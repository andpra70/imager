use std::cell::RefCell;
#[derive(Clone, Copy)]
struct Point {
    x: f32,
    y: f32,
}
struct Curve {
    p0: Point,
    p1: Point,
    p2: Point,
    p3: Point,
    points: Vec<Point>,
    angle: f32,
}
struct Stroke {
    curves: Vec<Curve>,
    gain: f32,
}
struct Engine {
    w: usize,
    h: usize,
    target: Vec<f32>,
    draw: Vec<f32>,
    safe: Vec<u8>,
    edge: Vec<f32>,
    marks: Vec<i32>,
    footprint: Vec<usize>,
    stamp: i32,
    error: f64,
    strokes: Vec<Stroke>,
    cols: usize,
    scores: Vec<f64>,
    tiles: Vec<usize>,
    seed: u32,
    ppm: f32,
    pen: f32,
    alpha: f32,
    candidates: usize,
    step_size: f32,
    bend: f32,
    chain: usize,
    max_strokes: usize,
    target_mse: f64,
    min_progress: f64,
    attempt: usize,
    last_error: f64,
    stalled: usize,
    fail: usize,
    curve_count: usize,
    done: bool,
    reason: i32,
}
thread_local! {static ENGINE:RefCell<Option<Engine>>=const{RefCell::new(None)};static INPUT:RefCell<Vec<u8>>=const{RefCell::new(Vec::new())};static SERIALIZED:RefCell<Vec<f32>>=const{RefCell::new(Vec::new())};}
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
    ppm: f32,
    pen: f32,
    alpha: f32,
    white: f32,
    margin: f32,
    candidates: usize,
    step_size: f32,
    bend_deg: f32,
    chain: usize,
    max_strokes: usize,
    target_mse: f64,
    min_progress: f64,
) {
    INPUT.with(|input| {
        let input = input.borrow();
        let n = w * h;
        let mut target = vec![0.; n];
        let mut mask = vec![0u8; n];
        let mut error = 0.;
        for i in 0..n {
            let k = i * 4;
            let l = (0.2126 * input[k] as f32
                + 0.7152 * input[k + 1] as f32
                + 0.0722 * input[k + 2] as f32)
                / 255.;
            target[i] = 1. - l;
            mask[i] = if l < white / 255. { 1 } else { 0 };
            error += (target[i] * target[i]) as f64;
        }
        let radius = ((pen / 2. + margin) * ppm).ceil() as isize;
        let mut offsets = Vec::new();
        for dy in -radius..=radius {
            for dx in -radius..=radius {
                if dx * dx + dy * dy <= radius * radius {
                    offsets.push((dx, dy));
                }
            }
        }
        let mut safe = vec![0u8; n];
        for y in radius..h as isize - radius {
            for x in radius..w as isize - radius {
                let i = y as usize * w + x as usize;
                if mask[i] == 0 {
                    continue;
                }
                let valid = offsets
                    .iter()
                    .all(|(dx, dy)| mask[(y + dy) as usize * w + (x + dx) as usize] != 0);
                safe[i] = valid as u8;
            }
        }
        let mut edge = vec![0.; n];
        for y in 1..h - 1 {
            for x in 1..w - 1 {
                let i = y * w + x;
                edge[i] = ((target[i + 1] - target[i - 1]).powi(2)
                    + (target[i + w] - target[i - w]).powi(2))
                .sqrt();
            }
        }
        let cols = (w + 19) / 20;
        let rows = (h + 19) / 20;
        ENGINE.with(|slot| {
            *slot.borrow_mut() = Some(Engine {
                w,
                h,
                target,
                draw: vec![0.; n],
                safe,
                edge,
                marks: vec![0; n],
                footprint: Vec::with_capacity(512),
                stamp: 0,
                error,
                strokes: Vec::new(),
                cols,
                scores: vec![0.; cols * rows],
                tiles: Vec::new(),
                seed: 0x7f4a7c15,
                ppm,
                pen,
                alpha,
                candidates,
                step_size,
                bend: bend_deg * std::f32::consts::PI / 180.,
                chain,
                max_strokes,
                target_mse,
                min_progress,
                attempt: 0,
                last_error: error,
                stalled: 0,
                fail: 0,
                curve_count: 0,
                done: false,
                reason: 0,
            })
        });
    });
}
impl Engine {
    fn random(&mut self) -> f32 {
        let mut x = self.seed;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.seed = x;
        x as f32 / 4294967296.
    }
    fn refresh_tiles(&mut self) {
        self.scores.fill(0.);
        for y in 0..self.h {
            for x in 0..self.w {
                let i = y * self.w + x;
                if self.safe[i] == 0 {
                    continue;
                }
                let e = (self.target[i] - self.draw[i]).max(0.);
                self.scores[(y / 20) * self.cols + x / 20] +=
                    (e * e * (1. + (self.edge[i] * 4.).min(3.))) as f64;
            }
        }
        let mut tiles: Vec<usize> = (0..self.scores.len())
            .filter(|&i| self.scores[i] > 0.00001)
            .collect();
        tiles.sort_by(|&a, &b| self.scores[b].partial_cmp(&self.scores[a]).unwrap());
        tiles.truncate(24usize.max((self.scores.len() as f32 * 0.12).ceil() as usize));
        self.tiles = tiles;
    }
    fn pick_seed(&mut self) -> Option<Point> {
        if self.tiles.is_empty() {
            return None;
        }
        let mut best: Option<(Point, f32)> = None;
        let tries = 180.min(self.tiles.len() * 6);
        for _ in 0..tries {
            let r = self.random().powf(1.7);
            let tile = self.tiles
                [((r * self.tiles.len() as f32).floor() as usize).min(self.tiles.len() - 1)];
            let tx = (tile % self.cols) * 20;
            let ty = (tile / self.cols) * 20;
            let x = tx as f32 + self.random() * (20usize.min(self.w - tx) as f32);
            let y = ty as f32 + self.random() * (20usize.min(self.h - ty) as f32);
            let ix = x.round() as usize;
            let iy = y.round() as usize;
            if ix >= self.w || iy >= self.h {
                continue;
            }
            let i = iy * self.w + ix;
            if self.safe[i] == 0 {
                continue;
            }
            let score = (self.target[i] - self.draw[i]) * (1. + (self.edge[i] * 4.).min(3.));
            if score > 0.03 && best.as_ref().map_or(true, |(_, s)| score > *s) {
                best = Some((Point { x, y }, score));
            }
        }
        best.map(|v| v.0)
    }
    fn tangent(&self, x: f32, y: f32) -> f32 {
        let ix = (x.round() as isize).clamp(1, self.w as isize - 2) as usize;
        let iy = (y.round() as isize).clamp(1, self.h as isize - 2) as usize;
        let i = iy * self.w + ix;
        (self.target[i + self.w] - self.target[i - self.w])
            .atan2(-(self.target[i + 1] - self.target[i - 1]))
    }
    fn curve(&self, p: Point, angle: f32, len: f32, delta: f32, mut points: Vec<Point>) -> Curve {
        let a = angle + delta;
        let (angle_sin, angle_cos) = angle.sin_cos();
        let (end_sin, end_cos) = a.sin_cos();
        let p0 = p;
        let p1 = Point {
            x: p.x + angle_cos * len * 0.36,
            y: p.y + angle_sin * len * 0.36,
        };
        let p3 = Point {
            x: p.x + end_cos * len,
            y: p.y + end_sin * len,
        };
        let p2 = Point {
            x: p3.x - end_cos * len * 0.36,
            y: p3.y - end_sin * len * 0.36,
        };
        let n = 8usize.max((len / 0.27).ceil() as usize);
        points.clear();
        if points.capacity() < n + 1 {
            points.reserve(n + 1 - points.capacity());
        }
        for j in 0..=n {
            let t = j as f32 / n as f32;
            let q = 1. - t;
            points.push(Point {
                x: q * q * q * p0.x
                    + 3. * q * q * t * p1.x
                    + 3. * q * t * t * p2.x
                    + t * t * t * p3.x,
                y: q * q * q * p0.y
                    + 3. * q * q * t * p1.y
                    + 3. * q * t * t * p2.y
                    + t * t * t * p3.y,
            });
        }
        Curve {
            p0,
            p1,
            p2,
            p3,
            points,
            angle: a,
        }
    }
    fn score(&mut self, curve: &Curve, commit: bool) -> f32 {
        let brush = (self.pen * self.ppm / 2.).max(0.45);
        let rr = brush * brush;
        self.stamp += 1;
        if self.stamp == i32::MAX {
            self.marks.fill(0);
            self.stamp = 1
        }
        self.footprint.clear();
        for p in &curve.points {
            let ix = p.x.round() as isize;
            let iy = p.y.round() as isize;
            if ix < 0
                || iy < 0
                || ix >= self.w as isize
                || iy >= self.h as isize
                || self.safe[iy as usize * self.w + ix as usize] == 0
            {
                return 0.;
            }
            let y0 = (p.y - brush).floor().max(0.) as usize;
            let y1 = (p.y + brush).ceil().min((self.h - 1) as f32) as usize;
            let x0 = (p.x - brush).floor().max(0.) as usize;
            let x1 = (p.x + brush).ceil().min((self.w - 1) as f32) as usize;
            for y in y0..=y1 {
                for x in x0..=x1 {
                    if (x as f32 - p.x).powi(2) + (y as f32 - p.y).powi(2) > rr {
                        continue;
                    }
                    let i = y * self.w + x;
                    if self.safe[i] == 0 {
                        return 0.;
                    }
                    if self.marks[i] != self.stamp {
                        self.marks[i] = self.stamp;
                        self.footprint.push(i);
                    }
                }
            }
        }
        if self.footprint.is_empty() {
            return 0.;
        }
        let mut gain = 0.;
        for &i in &self.footprint {
            let d = self.draw[i];
            let next = d + (1. - d) * self.alpha;
            let t = self.target[i];
            gain += (d - t).powi(2) - (next - t).powi(2);
        }
        if gain <= 0. {
            return 0.;
        }
        if commit {
            for &i in &self.footprint {
                let d = self.draw[i];
                let next = d + (1. - d) * self.alpha;
                let t = self.target[i];
                self.draw[i] = next;
                self.error += ((next - t).powi(2) - (d - t).powi(2)) as f64;
            }
        }
        gain
    }
    fn quick_score(&self, curve: &Curve) -> f32 {
        let mut score = 0.;
        for p in curve.points.iter().step_by(3) {
            let x = p.x.round() as isize;
            let y = p.y.round() as isize;
            if x < 0 || y < 0 || x >= self.w as isize || y >= self.h as isize {
                return 0.;
            }
            let i = y as usize * self.w + x as usize;
            if self.safe[i] == 0 {
                return 0.;
            }
            score += (self.target[i] - self.draw[i]).max(0.) * (1. + (self.edge[i] * 4.).min(3.));
        }
        score
    }
    fn next_choice(&mut self, p: Point, angle: f32, first: bool) -> Option<(Curve, f32, f32)> {
        let mut shortlist: Vec<(Curve, f32, f32, f32)> = Vec::with_capacity(self.candidates);
        for j in 0..self.candidates {
            let delta = if j == 0 {
                0.
            } else {
                (2. * self.random() - 1.) * self.bend
            };
            let len = self.step_size * self.ppm * (0.65 + self.random() * 0.75);
            let a = if first && j > 0 {
                angle + (2. * self.random() - 1.) * std::f32::consts::PI * 0.38
            } else {
                angle
            };
            let curve = self.curve(p, a, len, delta, Vec::with_capacity(48));
            let quick = self.quick_score(&curve);
            if quick > 0. {
                shortlist.push((curve, delta, len, quick));
            }
        }
        shortlist.sort_unstable_by(|a, b| b.3.partial_cmp(&a.3).unwrap());
        shortlist.truncate(shortlist.len().min(6));
        let mut best: Option<(Curve, f32, f32)> = None;
        for (curve, delta, len, _) in shortlist {
            let gain = self.score(&curve, false);
            if gain == 0. {
                continue;
            }
            let curvature = delta.abs() / len.max(1.);
            let score = gain / (len.powf(0.38) + 1.)
                * (1. - 0.15 * delta.abs() / self.bend.max(0.01))
                - 0.002 * curvature;
            if best.as_ref().map_or(true, |(_, s, _)| score > *s) {
                best = Some((curve, score, gain));
            }
        }
        best
    }
    fn make_stroke(&mut self, seed: Point) -> Option<Stroke> {
        let angle = self.tangent(seed.x, seed.y);
        let forward = self.next_choice(seed, angle, true);
        let reverse = self.next_choice(seed, angle + std::f32::consts::PI, true);
        let best = match (forward, reverse) {
            (None, None) => return None,
            (Some(v), None) | (None, Some(v)) => v,
            (Some(f), Some(r)) => {
                if f.1 >= r.1 {
                    f
                } else {
                    r
                }
            }
        };
        let mut curves = Vec::new();
        let mut p = seed;
        let mut a = best.0.angle;
        let mut first_choice = Some(best);
        let mut gain = 0.;
        for k in 0..self.chain {
            let choice = if k == 0 {
                first_choice.take().unwrap()
            } else {
                match self.next_choice(p, a, false) {
                    Some(v) => v,
                    None => break,
                }
            };
            let current = self.score(&choice.0, true);
            if current == 0. {
                break;
            }
            p = choice.0.p3;
            a = choice.0.angle;
            curves.push(choice.0);
            gain += current;
            if k > 3 && current < 0.00001f32.max(gain * 0.0008) {
                break;
            }
        }
        if curves.is_empty() {
            None
        } else {
            Some(Stroke { curves, gain })
        }
    }
    fn attempt_once(&mut self) {
        if self.attempt >= self.max_strokes {
            self.done = true;
            self.reason = 0;
            return;
        }
        if self.attempt % 5 == 0 {
            self.refresh_tiles()
        }
        self.attempt += 1;
        let Some(seed) = self.pick_seed() else {
            self.done = true;
            self.reason = 1;
            return;
        };
        let Some(stroke) = self.make_stroke(seed) else {
            self.fail += 1;
            if self.fail > 35 {
                self.done = true;
                self.reason = 2
            }
            return;
        };
        self.fail = 0;
        self.curve_count += stroke.curves.len();
        self.strokes.push(stroke);
        if self.strokes.len() % 30 == 0 {
            let improvement = (self.last_error - self.error) / self.last_error.max(1e-12) * 100.;
            self.stalled = if improvement < self.min_progress {
                self.stalled + 1
            } else {
                0
            };
            self.last_error = self.error;
            if self.stalled >= 2 {
                self.done = true;
                self.reason = 3;
                return;
            }
        }
        if self.error / (self.w * self.h) as f64 <= self.target_mse {
            self.done = true;
            self.reason = 4;
        }
    }
}
#[no_mangle]
pub extern "C" fn step(batch: usize) -> i32 {
    ENGINE.with(|slot| {
        let mut slot = slot.borrow_mut();
        let e = slot.as_mut().unwrap();
        for _ in 0..batch {
            if e.done {
                break;
            }
            e.attempt_once()
        }
        e.done as i32
    })
}
#[no_mangle]
pub extern "C" fn mse() -> f64 {
    ENGINE.with(|s| {
        s.borrow()
            .as_ref()
            .map_or(0., |e| e.error / (e.w * e.h) as f64)
    })
}
#[no_mangle]
pub extern "C" fn strokes() -> usize {
    ENGINE.with(|s| s.borrow().as_ref().map_or(0, |e| e.strokes.len()))
}
#[no_mangle]
pub extern "C" fn curves() -> usize {
    ENGINE.with(|s| s.borrow().as_ref().map_or(0, |e| e.curve_count))
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
        SERIALIZED.with(|buffer| {
            let mut b = buffer.borrow_mut();
            b.clear();
            b.push(e.strokes.len() as f32);
            for stroke in &e.strokes {
                b.push(stroke.gain);
                b.push(stroke.curves.len() as f32);
                for c in &stroke.curves {
                    for p in [c.p0, c.p1, c.p2, c.p3] {
                        b.push(p.x);
                        b.push(p.y)
                    }
                    b.push(c.angle);
                    b.push(c.points.len() as f32);
                    for p in &c.points {
                        b.push(p.x);
                        b.push(p.y);
                    }
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
