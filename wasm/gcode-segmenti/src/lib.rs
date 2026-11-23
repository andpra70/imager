use std::{cell::RefCell, collections::HashSet};

#[derive(Clone, Copy)]
struct Point {
    x: f32,
    y: f32,
    z: f32,
}
#[derive(Clone, Copy)]
struct Step {
    x: f32,
    y: f32,
    z: f32,
    angle: f32,
    score: f32,
    gain: f32,
}
#[derive(Clone, Copy)]
struct Seed {
    x: f32,
    y: f32,
    score: f32,
}
struct Engine {
    w: usize,
    h: usize,
    target: Vec<f32>,
    draw: Vec<f32>,
    weight: Vec<f32>,
    alpha_mask: Vec<f32>,
    tiles_x: usize,
    tile_scores: Vec<f32>,
    dirty: Vec<bool>,
    paths: Vec<Vec<Point>>,
    error: f64,
    initial_mse: f64,
    segments: usize,
    resolution: f32,
    diameter: f32,
    alpha: f32,
    epsilon: f64,
    step_size: f32,
    directions: usize,
    over: f32,
    z_min: f32,
    z_max: f32,
    last: Option<Point>,
    stalled: usize,
    plateau: usize,
    done: bool,
    reason: i32,
}
thread_local! {static ENGINE:RefCell<Option<Engine>>=const{RefCell::new(None)};static INPUT:RefCell<Vec<u8>>=const{RefCell::new(Vec::new())};static SERIALIZED:RefCell<Vec<f32>>=const{RefCell::new(Vec::new())};}
fn clamp(v: f32, a: f32, b: f32) -> f32 {
    v.max(a).min(b)
}
#[no_mangle]
pub extern "C" fn input_alloc(len: usize) -> *mut u8 {
    INPUT.with(|b| {
        let mut b = b.borrow_mut();
        b.resize(len, 0);
        b.as_mut_ptr()
    })
}
#[no_mangle]
pub extern "C" fn init(
    w: usize,
    h: usize,
    resolution: f32,
    diameter: f32,
    alpha: f32,
    epsilon: f64,
    step_size: f32,
    directions: usize,
    over: f32,
    detail: f32,
    z_min: f32,
    z_max: f32,
) {
    INPUT.with(|input| {
        let input = input.borrow();
        let n = w * h;
        let mut target = vec![0.; n];
        let mut alpha_mask = vec![0.; n];
        for i in 0..n {
            let k = i * 4;
            let a = input[k + 3] as f32 / 255.;
            let light = (0.2126 * input[k] as f32
                + 0.7152 * input[k + 1] as f32
                + 0.0722 * input[k + 2] as f32)
                / 255.;
            alpha_mask[i] = a;
            target[i] = clamp((1. - light) * a, 0., 1.);
        }
        let mut weight = vec![0.; n];
        let mut error = 0.;
        for y in 0..h {
            for x in 0..w {
                let i = y * w + x;
                let x0 = x.saturating_sub(1);
                let x1 = (x + 1).min(w - 1);
                let y0 = y.saturating_sub(1);
                let y1 = (y + 1).min(h - 1);
                let gx = target[y * w + x1] - target[y * w + x0];
                let gy = target[y1 * w + x] - target[y0 * w + x];
                weight[i] = 1. + (detail - 1.) * clamp((gx * gx + gy * gy).sqrt() * 2.8, 0., 1.);
                let e = -target[i];
                error += (weight[i] * e * e) as f64;
            }
        }
        let tiles_x = (w + 15) / 16;
        let tiles_y = (h + 15) / 16;
        let mut engine = Engine {
            w,
            h,
            target,
            draw: vec![0.; n],
            weight,
            alpha_mask,
            tiles_x,
            tile_scores: vec![0.; tiles_x * tiles_y],
            dirty: vec![false; tiles_x * tiles_y],
            paths: Vec::new(),
            error,
            initial_mse: error / n as f64,
            segments: 0,
            resolution,
            diameter,
            alpha,
            epsilon,
            step_size,
            directions,
            over,
            z_min,
            z_max,
            last: None,
            stalled: 0,
            plateau: 0,
            done: false,
            reason: 0,
        };
        for id in 0..engine.tile_scores.len() {
            engine.update_tile(id)
        }
        ENGINE.with(|slot| *slot.borrow_mut() = Some(engine));
    });
}
impl Engine {
    fn error_at(&self, i: usize, value: f32) -> f32 {
        let e = value - self.target[i];
        self.weight[i] * (if e > 0. { self.over } else { 1. }) * e * e
    }
    fn mse(&self) -> f64 {
        self.error / (self.w * self.h) as f64
    }
    fn raw_seed_score(&self, x: usize, y: usize) -> f32 {
        let i = y * self.w + x;
        let r = self.target[i] - self.draw[i];
        if r < 0.045 {
            return 0.;
        }
        let s = r * r * self.weight[i];
        if s >= 0.003 {
            s
        } else {
            0.
        }
    }
    fn update_tile(&mut self, id: usize) {
        let tx = id % self.tiles_x;
        let ty = id / self.tiles_x;
        let mut best: f32 = 0.;
        for y in ((ty * 16).max(2)..(ty * 16 + 16).min(self.h - 2)).step_by(2) {
            for x in ((tx * 16).max(2)..(tx * 16 + 16).min(self.w - 2)).step_by(2) {
                best = best.max(self.raw_seed_score(x, y));
            }
        }
        self.tile_scores[id] = best;
    }
    fn refresh_dirty(&mut self) {
        for id in 0..self.dirty.len() {
            if self.dirty[id] {
                self.update_tile(id);
                self.dirty[id] = false;
            }
        }
    }
    fn segment(
        &mut self,
        x0: f32,
        y0: f32,
        x1: f32,
        y1: f32,
        z: f32,
        commit: bool,
    ) -> (f32, f32, f32) {
        let rad = (self.diameter * self.resolution * 0.58).max(0.55);
        let dx = x1 - x0;
        let dy = y1 - y0;
        let length2 = dx * dx + dy * dy;
        let opacity =
            self.alpha * (0.60 + 0.40 * (z - self.z_min) / (self.z_max - self.z_min).max(0.001));
        let min_x = ((x0.min(x1) - rad - 1.).floor().max(0.)) as usize;
        let max_x = ((x0.max(x1) + rad + 1.).ceil().min((self.w - 1) as f32)) as usize;
        let min_y = ((y0.min(y1) - rad - 1.).floor().max(0.)) as usize;
        let max_y = ((y0.max(y1) + rad + 1.).ceil().min((self.h - 1) as f32)) as usize;
        let mut gain = 0.;
        let mut ink = 0.;
        let mut blocked = 0.;
        for y in min_y..=max_y {
            for x in min_x..=max_x {
                let u = if length2 > 0. {
                    clamp(
                        ((x as f32 - x0) * dx + (y as f32 - y0) * dy) / length2,
                        0.,
                        1.,
                    )
                } else {
                    0.
                };
                let ex = x as f32 - x0 - u * dx;
                let ey = y as f32 - y0 - u * dy;
                let distance = (ex * ex + ey * ey).sqrt();
                if distance >= rad {
                    continue;
                }
                let i = y * self.w + x;
                let coverage = 1. - distance / rad;
                let a = opacity * coverage * coverage;
                if a < 0.0005 {
                    continue;
                }
                let before = self.draw[i];
                let after = before + (1. - before) * a;
                let improvement = self.error_at(i, before) - self.error_at(i, after);
                gain += improvement;
                ink += a;
                if self.alpha_mask[i] < 0.05 && after > 0.025 {
                    blocked += a
                }
                if commit {
                    self.draw[i] = after;
                    self.error -= improvement as f64;
                    self.dirty[(y >> 4) * self.tiles_x + (x >> 4)] = true;
                }
            }
        }
        (gain, ink, blocked)
    }
    fn direction_scores(
        &self,
        x: f32,
        y: f32,
        angle: f32,
    ) -> Option<([f32; 3], [f32; 3], [f32; 3], f32, f32)> {
        let delta = self.step_size * self.resolution;
        let (sin, cos) = angle.sin_cos();
        let nx = x + delta * cos;
        let ny = y + delta * sin;
        if nx < 1. || ny < 1. || nx >= (self.w - 2) as f32 || ny >= (self.h - 2) as f32 {
            return None;
        }
        let rad = (self.diameter * self.resolution * 0.58).max(0.55);
        let dx = nx - x;
        let dy = ny - y;
        let length2 = dx * dx + dy * dy;
        let min_x = ((x.min(nx) - rad - 1.).floor().max(0.)) as usize;
        let max_x = ((x.max(nx) + rad + 1.).ceil().min((self.w - 1) as f32)) as usize;
        let min_y = ((y.min(ny) - rad - 1.).floor().max(0.)) as usize;
        let max_y = ((y.max(ny) + rad + 1.).ceil().min((self.h - 1) as f32)) as usize;
        let mut gains = [0.; 3];
        let mut inks = [0.; 3];
        let mut blocked = [0.; 3];
        let opacities = [self.alpha * 0.60, self.alpha * 0.80, self.alpha];
        for py in min_y..=max_y {
            for px in min_x..=max_x {
                let u = clamp(
                    ((px as f32 - x) * dx + (py as f32 - y) * dy) / length2,
                    0.,
                    1.,
                );
                let ex = px as f32 - x - u * dx;
                let ey = py as f32 - y - u * dy;
                let distance2 = ex * ex + ey * ey;
                if distance2 >= rad * rad {
                    continue;
                }
                let coverage = 1. - distance2.sqrt() / rad;
                let coverage2 = coverage * coverage;
                let i = py * self.w + px;
                let before = self.draw[i];
                let before_error = self.error_at(i, before);
                for level in 0..3 {
                    let a = opacities[level] * coverage2;
                    if a < 0.0005 {
                        continue;
                    }
                    let after = before + (1. - before) * a;
                    gains[level] += before_error - self.error_at(i, after);
                    inks[level] += a;
                    if self.alpha_mask[i] < 0.05 && after > 0.025 {
                        blocked[level] += a;
                    }
                }
            }
        }
        Some((gains, inks, blocked, nx, ny))
    }
    fn best_step(&mut self, x: f32, y: f32, heading: f32, first: bool) -> Option<Step> {
        let mut best: Option<Step> = None;
        let count = if first { self.directions } else { 9 };
        let zs = [self.z_min, (self.z_min + self.z_max) / 2., self.z_max];
        for j in 0..count {
            let angle = if first {
                j as f32 * 2. * std::f32::consts::PI / self.directions as f32
            } else {
                heading + (j as f32 - 4.) * std::f32::consts::PI / 24.
            };
            let Some((gains, inks, blocked, nx, ny)) = self.direction_scores(x, y, angle) else {
                continue;
            };
            let turn = if first {
                0.
            } else {
                (j as f32 - 4.).abs() * std::f32::consts::PI / 24.
            };
            for level in 0..3 {
                let gain = gains[level];
                let ink = inks[level];
                if blocked[level] > ink * 0.04 || gain <= 0. {
                    continue;
                }
                let score = gain / (self.step_size * self.resolution + 0.5)
                    - 0.005 * turn * turn
                    - ink * 0.0005;
                let candidate = Step {
                    x: nx,
                    y: ny,
                    z: zs[level],
                    angle,
                    score,
                    gain,
                };
                if best.map_or(true, |b| candidate.score > b.score) {
                    best = Some(candidate)
                }
            }
        }
        best
    }
    fn seeds(&self) -> Vec<Seed> {
        let mut order: Vec<usize> = (0..self.tile_scores.len())
            .filter(|&i| self.tile_scores[i] > 0.003)
            .collect();
        order.sort_by(|&a, &b| {
            self.tile_scores[b]
                .partial_cmp(&self.tile_scores[a])
                .unwrap()
        });
        order.truncate(64);
        let mut candidates = Vec::new();
        for id in order {
            let tx = id % self.tiles_x;
            let ty = id / self.tiles_x;
            for y in ((ty * 16).max(2)..(ty * 16 + 16).min(self.h - 2)).step_by(2) {
                for x in ((tx * 16).max(2)..(tx * 16 + 16).min(self.w - 2)).step_by(2) {
                    let mut score = self.raw_seed_score(x, y);
                    if score == 0. {
                        continue;
                    }
                    if let Some(last) = self.last {
                        let dx = x as f32 - last.x;
                        let dy = y as f32 - last.y;
                        score /= 1. + (dx * dx + dy * dy).sqrt() / self.resolution * 0.006;
                    }
                    candidates.push(Seed {
                        x: x as f32,
                        y: y as f32,
                        score,
                    });
                }
            }
        }
        const CANDIDATE_FRONTIER: usize = 384;
        if candidates.len() > CANDIDATE_FRONTIER {
            candidates.select_nth_unstable_by(CANDIDATE_FRONTIER, |a, b| {
                b.score.partial_cmp(&a.score).unwrap()
            });
            candidates.truncate(CANDIDATE_FRONTIER);
        }
        candidates.sort_unstable_by(|a, b| b.score.partial_cmp(&a.score).unwrap());
        let separation = (self.resolution * 2.).round().max(4.);
        let mut selected: Vec<Seed> = Vec::new();
        for p in candidates {
            if selected.iter().all(|q| {
                let dx = q.x - p.x;
                let dy = q.y - p.y;
                dx * dx + dy * dy > separation * separation
            }) {
                selected.push(p);
                if selected.len() >= 24 {
                    break;
                }
            }
        }
        selected
    }
    fn grow(&mut self, seed: Seed, initial: Step) -> Option<Vec<Point>> {
        let mut x = seed.x;
        let mut y = seed.y;
        let mut angle = initial.angle;
        let mut points = vec![Point { x, y, z: initial.z }];
        let mut seen = HashSet::new();
        for j in 0..180 {
            let next = if j == 0 {
                Some(initial)
            } else {
                self.best_step(x, y, angle, false)
            };
            let Some(next) = next else { break };
            if next.gain < 0.00006 {
                break;
            }
            let key = ((next.x / 1.5).round() as i32, (next.y / 1.5).round() as i32);
            if !seen.insert(key) {
                break;
            }
            self.segment(x, y, next.x, next.y, next.z, true);
            points.push(Point {
                x: next.x,
                y: next.y,
                z: next.z,
            });
            x = next.x;
            y = next.y;
            angle = next.angle;
        }
        self.refresh_dirty();
        if points.len() >= 2 {
            Some(points)
        } else {
            None
        }
    }
    fn iteration(&mut self) {
        if self.mse() <= self.epsilon {
            self.done = true;
            self.reason = 1;
            return;
        }
        let before = self.mse();
        let seeds = self.seeds();
        let mut best: Option<(Seed, Step, f32)> = None;
        for seed in seeds {
            if let Some(initial) = self.best_step(seed.x, seed.y, 0., true) {
                let travel = self.last.map_or(0., |last| {
                    let dx = seed.x - last.x;
                    let dy = seed.y - last.y;
                    (dx * dx + dy * dy).sqrt() / self.resolution
                });
                let convergence = clamp(
                    (1. - self.mse() / self.initial_mse.max(1e-9)) as f32,
                    0.,
                    1.,
                );
                let score = initial.score / (1. + travel * (0.018 + 0.065 * convergence));
                if best.map_or(true, |v| score > v.2) {
                    best = Some((seed, initial, score));
                }
            }
        }
        let Some((seed, initial, score)) = best else {
            self.done = true;
            self.reason = 0;
            return;
        };
        if score <= 0. {
            self.done = true;
            self.reason = 0;
            return;
        }
        let Some(path) = self.grow(seed, initial) else {
            self.stalled += 1;
            if self.stalled > 10 {
                self.done = true;
                self.reason = 2
            }
            return;
        };
        self.segments += path.len() - 1;
        self.last = path.last().copied();
        self.paths.push(path);
        self.stalled = 0;
        let improvement = before - self.mse();
        let minimum = (self.epsilon * 1e-5).max(before * 1e-7);
        self.plateau = if improvement <= minimum {
            self.plateau + 1
        } else {
            0
        };
        if self.plateau >= 24 {
            self.done = true;
            self.reason = 3;
        }
    }
}
#[no_mangle]
pub extern "C" fn step(batch: usize) -> i32 {
    ENGINE.with(|s| {
        let mut s = s.borrow_mut();
        let e = s.as_mut().unwrap();
        for _ in 0..batch {
            if e.done {
                break;
            }
            e.iteration()
        }
        e.done as i32
    })
}
#[no_mangle]
pub extern "C" fn mse() -> f64 {
    ENGINE.with(|s| s.borrow().as_ref().map_or(0., Engine::mse))
}
#[no_mangle]
pub extern "C" fn strokes() -> usize {
    ENGINE.with(|s| s.borrow().as_ref().map_or(0, |e| e.paths.len()))
}
#[no_mangle]
pub extern "C" fn segments() -> usize {
    ENGINE.with(|s| s.borrow().as_ref().map_or(0, |e| e.segments))
}
#[no_mangle]
pub extern "C" fn reason() -> i32 {
    ENGINE.with(|s| s.borrow().as_ref().map_or(0, |e| e.reason))
}
#[no_mangle]
pub extern "C" fn draw_ptr() -> *const f32 {
    ENGINE.with(|s| {
        s.borrow()
            .as_ref()
            .map_or(std::ptr::null(), |e| e.draw.as_ptr())
    })
}
#[no_mangle]
pub extern "C" fn serialized_ptr() -> *const f32 {
    ENGINE.with(|s| {
        let s = s.borrow();
        let e = s.as_ref().unwrap();
        SERIALIZED.with(|b| {
            let mut b = b.borrow_mut();
            b.clear();
            b.push(e.paths.len() as f32);
            for path in &e.paths {
                b.push(path.len() as f32);
                for p in path {
                    b.extend_from_slice(&[p.x, p.y, p.z]);
                }
            }
            b.as_ptr()
        })
    })
}
#[no_mangle]
pub extern "C" fn serialized_len() -> usize {
    SERIALIZED.with(|b| b.borrow().len())
}
