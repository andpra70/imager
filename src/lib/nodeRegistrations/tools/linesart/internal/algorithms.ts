
export interface AlgorithmOptions {
  lineSpacing: number;
  minThickness: number;
  maxThickness: number;
  angle: number;
  resolution: number;
  intensity: number;
  frequency: number;
  invert: boolean;
  strokeDasharray: string;
  scribblePoints: number;
  opacity: number;
  noise: number;
}

export const getGrayscale = (imageData: ImageData): Uint8ClampedArray => {
  const data = imageData.data;
  const grayscale = new Uint8ClampedArray(data.length / 4);
  for (let i = 0; i < data.length; i += 4) {
    // Standard luminance formula
    grayscale[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return grayscale;
};

export const drawHatching = (
  ctx: any,
  grayscale: Uint8ClampedArray,
  width: number,
  height: number,
  options: AlgorithmOptions
) => {
  const { lineSpacing, minThickness, maxThickness, angle, invert, strokeDasharray, opacity, noise } = options;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = `rgba(0, 0, 0, ${opacity})`;
  ctx.lineCap = 'round';

  if (strokeDasharray) {
    const dash = strokeDasharray.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
    ctx.setLineDash(dash);
  } else {
    ctx.setLineDash([]);
  }

  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Determine bounds for lines
  const diag = Math.sqrt(width * width + height * height);
  
  for (let d = -diag; d < diag; d += lineSpacing) {
    ctx.beginPath();
    let started = false;

    for (let t = -diag; t < diag; t += 2) {
      let x = Math.floor(width / 2 + d * cos - t * sin);
      let y = Math.floor(height / 2 + d * sin + t * cos);

      // Apply noise
      if (noise > 0) {
        x += (Math.random() - 0.5) * noise;
        y += (Math.random() - 0.5) * noise;
      }

      if (x >= 0 && x < width && y >= 0 && y < height) {
        const idx = Math.floor(y) * width + Math.floor(x);
        if (idx >= grayscale.length) continue;
        
        let val = grayscale[idx] / 255;
        if (invert) val = 1 - val;
        
        const thickness = minThickness + (1 - val) * (maxThickness - minThickness);
        
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineWidth = thickness;
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x, y);
        }
      } else {
        if (started) {
          ctx.stroke();
          started = false;
        }
      }
    }
    if (started) ctx.stroke();
  }
};

export const drawCrossHatching = (
  ctx: any,
  grayscale: Uint8ClampedArray,
  width: number,
  height: number,
  options: AlgorithmOptions
) => {
  drawHatching(ctx, grayscale, width, height, options);
  // Second pass with 90 degree offset
  drawHatching(ctx, grayscale, width, height, {
    ...options,
    angle: options.angle + 90
  });
};

export const drawSpiral = (
  ctx: any,
  grayscale: Uint8ClampedArray,
  width: number,
  height: number,
  options: AlgorithmOptions
) => {
  const { lineSpacing, minThickness, maxThickness, invert, strokeDasharray, opacity, noise } = options;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = `rgba(0, 0, 0, ${opacity})`;
  ctx.lineCap = 'round';

  if (strokeDasharray) {
    const dash = strokeDasharray.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
    ctx.setLineDash(dash);
  } else {
    ctx.setLineDash([]);
  }

  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);
  
  ctx.beginPath();
  let started = false;

  // Spiral formula: r = a * theta
  // theta = r / a
  // We step through theta
  const a = lineSpacing / (2 * Math.PI);
  for (let theta = 0; theta < (maxRadius / a); theta += 0.1) {
    const r = a * theta;
    let x = Math.floor(centerX + r * Math.cos(theta));
    let y = Math.floor(centerY + r * Math.sin(theta));

    // Apply noise
    if (noise > 0) {
      x += (Math.random() - 0.5) * noise;
      y += (Math.random() - 0.5) * noise;
    }

    if (x >= 0 && x < width && y >= 0 && y < height) {
      const idx = Math.floor(y) * width + Math.floor(x);
      if (idx >= grayscale.length) continue;
      
      let val = grayscale[idx] / 255;
      if (invert) val = 1 - val;
      
      const thickness = minThickness + (1 - val) * (maxThickness - minThickness);
      
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineWidth = thickness;
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
      }
    }
  }
  ctx.stroke();
};

export const drawWavy = (
  ctx: any,
  grayscale: Uint8ClampedArray,
  width: number,
  height: number,
  options: AlgorithmOptions
) => {
  const { lineSpacing, minThickness, maxThickness, intensity, frequency, invert, opacity, noise } = options;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = `rgba(0, 0, 0, ${opacity})`;
  ctx.lineCap = 'round';

  for (let yLine = 0; yLine < height; yLine += lineSpacing) {
    ctx.beginPath();
    let started = false;

    for (let x = 0; x < width; x += 2) {
      const idx = Math.floor(yLine) * width + x;
      if (idx >= grayscale.length) continue;
      
      let val = grayscale[idx] / 255;
      if (invert) val = 1 - val;

      // Wavy displacement based on brightness
      // Both amplitude and frequency can be modulated
      const amp = (1 - val) * intensity;
      const freq = 0.05 + (1 - val) * frequency * 0.1;
      let yDisplaced = yLine + Math.sin(x * freq) * amp;
      let xPos = x;

      // Apply noise
      if (noise > 0) {
        xPos += (Math.random() - 0.5) * noise;
        yDisplaced += (Math.random() - 0.5) * noise;
      }
      
      const thickness = minThickness + (1 - val) * (maxThickness - minThickness);

      if (!started) {
        ctx.moveTo(xPos, yDisplaced);
        started = true;
      } else {
        ctx.lineWidth = thickness;
        ctx.lineTo(xPos, yDisplaced);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(xPos, yDisplaced);
      }
    }
    ctx.stroke();
  }
};

export const drawConcentric = (
  ctx: any,
  grayscale: Uint8ClampedArray,
  width: number,
  height: number,
  options: AlgorithmOptions
) => {
  const { lineSpacing, minThickness, maxThickness, invert, opacity, noise } = options;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = `rgba(0, 0, 0, ${opacity})`;
  ctx.lineCap = 'round';

  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);

  for (let r = lineSpacing; r < maxRadius; r += lineSpacing) {
    ctx.beginPath();
    let started = false;

    // Step around the circle
    const circumference = 2 * Math.PI * r;
    const steps = Math.max(12, circumference / 2);
    
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * Math.PI * 2;
      let x = Math.floor(centerX + r * Math.cos(theta));
      let y = Math.floor(centerY + r * Math.sin(theta));

      // Apply noise
      if (noise > 0) {
        x += (Math.random() - 0.5) * noise;
        y += (Math.random() - 0.5) * noise;
      }

      if (x >= 0 && x < width && y >= 0 && y < height) {
        const idx = Math.floor(y) * width + Math.floor(x);
        if (idx >= grayscale.length) continue;
        
        let val = grayscale[idx] / 255;
        if (invert) val = 1 - val;
        
        const thickness = minThickness + (1 - val) * (maxThickness - minThickness);
        
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineWidth = thickness;
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x, y);
        }
      } else {
        if (started) {
          ctx.stroke();
          started = false;
        }
      }
    }
    if (started) ctx.stroke();
  }
};

export const drawHalftone = (
  ctx: any,
  grayscale: Uint8ClampedArray,
  width: number,
  height: number,
  options: AlgorithmOptions
) => {
  const { lineSpacing, maxThickness, invert, opacity, noise } = options;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;

  for (let y = lineSpacing / 2; y < height; y += lineSpacing) {
    for (let x = lineSpacing / 2; x < width; x += lineSpacing) {
      let xPos = x;
      let yPos = y;

      // Apply noise
      if (noise > 0) {
        xPos += (Math.random() - 0.5) * noise;
        yPos += (Math.random() - 0.5) * noise;
      }

      const idx = Math.floor(yPos) * width + Math.floor(xPos);
      if (idx < 0 || idx >= grayscale.length) continue;
      
      let val = grayscale[idx] / 255;
      if (invert) val = 1 - val;

      const radius = (1 - val) * (lineSpacing / 2) * (maxThickness / 5);
      
      if (radius > 0.1) {
        ctx.beginPath();
        ctx.arc(xPos, yPos, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
};

export const drawStippling = (
  ctx: any,
  grayscale: Uint8ClampedArray,
  width: number,
  height: number,
  options: AlgorithmOptions
) => {
  const { intensity, invert, opacity } = options;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;

  // Number of dots based on intensity
  const dotCount = (width * height) / (20 - intensity * 0.3);
  
  for (let i = 0; i < dotCount; i++) {
    const x = Math.floor(Math.random() * width);
    const y = Math.floor(Math.random() * height);
    const idx = y * width + x;
    
    let val = grayscale[idx] / 255;
    if (invert) val = 1 - val;

    // Probability of placing a dot increases with darkness
    if (Math.random() > val) {
      ctx.fillRect(x, y, 1, 1);
    }
  }
};

export const drawGrid = (
  ctx: any,
  grayscale: Uint8ClampedArray,
  width: number,
  height: number,
  options: AlgorithmOptions
) => {
  drawHatching(ctx, grayscale, width, height, { ...options, angle: 0 });
  drawHatching(ctx, grayscale, width, height, { ...options, angle: 90 });
};

export const drawSketch = (
  ctx: any,
  grayscale: Uint8ClampedArray,
  width: number,
  height: number,
  options: AlgorithmOptions
) => {
  const { lineSpacing, minThickness, maxThickness, invert, opacity, noise, intensity } = options;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = `rgba(0, 0, 0, ${opacity})`;
  ctx.lineCap = 'round';

  // Grid-based sampling with randomized short strokes to simulate pencil shading
  const step = Math.max(2, lineSpacing / 2);
  
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = Math.floor(y) * width + Math.floor(x);
      if (idx >= grayscale.length) continue;

      let val = grayscale[idx] / 255;
      if (invert) val = 1 - val;

      // Darker areas get more and longer strokes
      if (val < 0.95) {
        const strokeDensity = (1 - val) * (intensity / 5);
        const numStrokes = Math.ceil(strokeDensity);
        
        for (let i = 0; i < numStrokes; i++) {
          const angle = (Math.random() * 0.5 - 0.25) * Math.PI + (i % 2 === 0 ? 0 : Math.PI / 4); // Varying angles
          const length = (1 - val) * lineSpacing * (0.5 + Math.random());
          
          let x1 = x + (Math.random() - 0.5) * step;
          let y1 = y + (Math.random() - 0.5) * step;
          
          // Apply noise
          if (noise > 0) {
            x1 += (Math.random() - 0.5) * noise;
            y1 += (Math.random() - 0.5) * noise;
          }

          const x2 = x1 + Math.cos(angle) * length;
          const y2 = y1 + Math.sin(angle) * length;

          ctx.beginPath();
          ctx.lineWidth = minThickness + Math.random() * (maxThickness - minThickness);
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }
    }
  }
};

export const drawScribble = (
  ctx: any,
  grayscale: Uint8ClampedArray,
  width: number,
  height: number,
  options: AlgorithmOptions
) => {
  const { scribblePoints, minThickness, maxThickness, invert, opacity, noise } = options;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = `rgba(0, 0, 0, ${opacity})`;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 1. Sample points based on density
  const points: { x: number, y: number, visited: boolean }[] = [];
  const targetPoints = scribblePoints || 5000;
  
  let attempts = 0;
  while (points.length < targetPoints && attempts < targetPoints * 50) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const idx = Math.floor(y) * width + Math.floor(x);
    
    if (idx < 0 || idx >= grayscale.length) {
      attempts++;
      continue;
    }
    
    let val = grayscale[idx] / 255;
    if (invert) val = 1 - val;
    
    if (Math.random() > val) {
      points.push({ x, y, visited: false });
    }
    attempts++;
  }

  if (points.length < 2) return;

  // 2. Build a spatial grid for fast nearest neighbor search
  const cellSize = 30;
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const grid: number[][] = Array.from({ length: cols * rows }, () => []);

  points.forEach((p, i) => {
    const col = Math.floor(p.x / cellSize);
    const row = Math.floor(p.y / cellSize);
    grid[row * cols + col].push(i);
  });

  // 3. Connect points using nearest neighbor with spatial optimization
  let currentIdx = 0;
  points[currentIdx].visited = true;
  let visitedCount = 1;

  ctx.beginPath();
  ctx.moveTo(points[currentIdx].x, points[currentIdx].y);

  while (visitedCount < points.length) {
    let nextIdx = -1;
    let minDistSq = Infinity;
    const p1 = points[currentIdx];

    const startCol = Math.floor(p1.x / cellSize);
    const startRow = Math.floor(p1.y / cellSize);

    // Search in expanding rings of cells
    let foundInRing = false;
    for (let radius = 0; radius < Math.max(cols, rows); radius++) {
      for (let r = startRow - radius; r <= startRow + radius; r++) {
        for (let c = startCol - radius; c <= startCol + radius; c++) {
          if (radius > 0 && r > startRow - radius && r < startRow + radius && c > startCol - radius && c < startCol + radius) continue;
          
          if (r >= 0 && r < rows && c >= 0 && c < cols) {
            const cellIdx = r * cols + c;
            const cellPoints = grid[cellIdx];
            
            for (const pIdx of cellPoints) {
              if (points[pIdx].visited) continue;
              
              const p2 = points[pIdx];
              const dx = p1.x - p2.x;
              const dy = p1.y - p2.y;
              const dSq = dx * dx + dy * dy;
              
              if (dSq < minDistSq) {
                minDistSq = dSq;
                nextIdx = pIdx;
                foundInRing = true;
              }
            }
          }
        }
      }
      if (foundInRing) break;
    }

    if (nextIdx === -1) break;

    const p2 = points[nextIdx];
    let drawX = p2.x;
    let drawY = p2.y;

    if (noise > 0) {
      drawX += (Math.random() - 0.5) * noise;
      drawY += (Math.random() - 0.5) * noise;
    }

    const idx = Math.floor(p2.y) * width + Math.floor(p2.x);
    let val = grayscale[idx] / 255;
    if (invert) val = 1 - val;
    
    ctx.lineWidth = minThickness + (1 - val) * (maxThickness - minThickness);
    ctx.lineTo(drawX, drawY);
    
    if (visitedCount % 20 === 0) {
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(drawX, drawY);
    }

    points[nextIdx].visited = true;
    currentIdx = nextIdx;
    visitedCount++;
  }

  ctx.stroke();
};
