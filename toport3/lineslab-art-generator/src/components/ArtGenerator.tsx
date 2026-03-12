
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Download, RefreshCw, Sliders, Image as ImageIcon, Settings2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AlgorithmOptions, 
  getGrayscale, 
  drawHatching, 
  drawCrossHatching,
  drawSpiral, 
  drawWavy,
  drawConcentric,
  drawHalftone,
  drawStippling,
  drawGrid,
  drawScribble,
  drawSketch
} from '../utils/algorithms';
import { SVGContext } from '../utils/svgContext';

type AlgorithmType = 'hatching' | 'cross-hatching' | 'spiral' | 'wavy' | 'concentric' | 'halftone' | 'stippling' | 'grid' | 'scribble' | 'sketch';

export const ArtGenerator: React.FC = () => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [algorithm, setAlgorithm] = useState<AlgorithmType>('hatching');
  const [options, setOptions] = useState<AlgorithmOptions>({
    lineSpacing: 8,
    minThickness: 0.5,
    maxThickness: 3,
    angle: 45,
    resolution: 1,
    intensity: 10,
    frequency: 1,
    invert: false,
    strokeDasharray: '',
    scribblePoints: 5000,
    opacity: 1,
    noise: 0,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          setImage(img);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: { 'image/*': [] },
    multiple: false 
  });

  const processImage = useCallback(() => {
    if (!image || !canvasRef.current || !sourceCanvasRef.current) return;
    
    setIsProcessing(true);
    
    const canvas = canvasRef.current;
    const sourceCanvas = sourceCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const sCtx = sourceCanvas.getContext('2d');
    
    if (!ctx || !sCtx) return;

    // Set dimensions
    const maxWidth = 800;
    const scale = Math.min(1, maxWidth / image.width);
    const width = image.width * scale;
    const height = image.height * scale;
    
    canvas.width = width;
    canvas.height = height;
    sourceCanvas.width = width;
    sourceCanvas.height = height;

    // Draw source and get grayscale
    sCtx.drawImage(image, 0, 0, width, height);
    const imageData = sCtx.getImageData(0, 0, width, height);
    const grayscale = getGrayscale(imageData);

    // Apply algorithm
    setTimeout(() => {
      switch (algorithm) {
        case 'hatching':
          drawHatching(ctx, grayscale, width, height, options);
          break;
        case 'cross-hatching':
          drawCrossHatching(ctx, grayscale, width, height, options);
          break;
        case 'spiral':
          drawSpiral(ctx, grayscale, width, height, options);
          break;
        case 'wavy':
          drawWavy(ctx, grayscale, width, height, options);
          break;
        case 'concentric':
          drawConcentric(ctx, grayscale, width, height, options);
          break;
        case 'halftone':
          drawHalftone(ctx, grayscale, width, height, options);
          break;
        case 'stippling':
          drawStippling(ctx, grayscale, width, height, options);
          break;
        case 'grid':
          drawGrid(ctx, grayscale, width, height, options);
          break;
        case 'scribble':
          drawScribble(ctx, grayscale, width, height, options);
          break;
        case 'sketch':
          drawSketch(ctx, grayscale, width, height, options);
          break;
      }
      setIsProcessing(false);
    }, 100);
  }, [image, algorithm, options]);

  useEffect(() => {
    processImage();
  }, [processImage]);

  const downloadImage = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `lineslab-${algorithm}.png`;
    link.href = canvasRef.current.toDataURL();
    link.click();
  };

  const downloadSVG = () => {
    if (!image || !sourceCanvasRef.current) return;
    
    const sourceCanvas = sourceCanvasRef.current;
    const sCtx = sourceCanvas.getContext('2d');
    if (!sCtx) return;

    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    const imageData = sCtx.getImageData(0, 0, width, height);
    const grayscale = getGrayscale(imageData);
    
    const svgCtx = new SVGContext(width, height);

    switch (algorithm) {
      case 'hatching':
        drawHatching(svgCtx, grayscale, width, height, options);
        break;
      case 'cross-hatching':
        drawCrossHatching(svgCtx, grayscale, width, height, options);
        break;
      case 'spiral':
        drawSpiral(svgCtx, grayscale, width, height, options);
        break;
      case 'wavy':
        drawWavy(svgCtx, grayscale, width, height, options);
        break;
      case 'concentric':
        drawConcentric(svgCtx, grayscale, width, height, options);
        break;
      case 'halftone':
        drawHalftone(svgCtx, grayscale, width, height, options);
        break;
      case 'stippling':
        drawStippling(svgCtx, grayscale, width, height, options);
        break;
      case 'grid':
        drawGrid(svgCtx, grayscale, width, height, options);
        break;
      case 'scribble':
        drawScribble(svgCtx, grayscale, width, height, options);
        break;
      case 'sketch':
        drawSketch(svgCtx, grayscale, width, height, options);
        break;
    }

    const svgString = svgCtx.serialize();
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `lineslab-${algorithm}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans p-4 md:p-8">
      <header className="max-w-7xl mx-auto mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-5xl md:text-7xl font-serif italic tracking-tight mb-2">LinesLab</h1>
          <p className="text-sm uppercase tracking-widest opacity-60 font-mono">Physical Monochrome Art Generator</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={downloadSVG}
            disabled={!image}
            className="flex items-center gap-2 px-6 py-3 bg-white text-[#141414] border border-black/10 rounded-full hover:bg-black/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Download size={18} />
            <span>Export SVG</span>
          </button>
          <button 
            onClick={downloadImage}
            disabled={!image}
            className="flex items-center gap-2 px-6 py-3 bg-[#141414] text-white rounded-full hover:bg-opacity-80 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Download size={18} />
            <span>Export PNG</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Controls Sidebar */}
        <aside className="lg:col-span-4 space-y-8">
          <section className="bg-white p-6 rounded-3xl shadow-sm border border-black/5">
            <div className="flex items-center gap-2 mb-6">
              <ImageIcon size={20} className="opacity-40" />
              <h2 className="text-xs uppercase tracking-widest font-bold">Source Image</h2>
            </div>
            
            <div 
              {...getRootProps()} 
              className={`
                relative aspect-video rounded-2xl border-2 border-dashed transition-all cursor-pointer overflow-hidden
                ${isDragActive ? 'border-[#141414] bg-black/5' : 'border-black/10 hover:border-black/30'}
              `}
            >
              <input {...getInputProps()} />
              {image ? (
                <img 
                  src={image.src} 
                  alt="Source" 
                  className="w-full h-full object-cover opacity-80"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                  <Upload size={32} className="mb-2 opacity-20" />
                  <p className="text-sm opacity-40">Drop image here or click to browse</p>
                </div>
              )}
            </div>
          </section>

          <section className="bg-white p-6 rounded-3xl shadow-sm border border-black/5">
            <div className="flex items-center gap-2 mb-6">
              <Settings2 size={20} className="opacity-40" />
              <h2 className="text-xs uppercase tracking-widest font-bold">Algorithm</h2>
            </div>
            
            <div className="grid grid-cols-2 gap-2 mb-8">
              {(['hatching', 'cross-hatching', 'spiral', 'wavy', 'concentric', 'halftone', 'stippling', 'grid', 'scribble', 'sketch'] as AlgorithmType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setAlgorithm(type)}
                  className={`
                    py-2 text-[10px] uppercase tracking-wider rounded-xl border transition-all
                    ${algorithm === type 
                      ? 'bg-[#141414] text-white border-[#141414]' 
                      : 'bg-transparent text-[#141414] border-black/10 hover:border-black/30'}
                  `}
                >
                  {type.replace('-', ' ')}
                </button>
              ))}
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] uppercase tracking-widest opacity-50 font-bold">
                  <span>Line Spacing</span>
                  <span>{options.lineSpacing}px</span>
                </div>
                <input 
                  type="range" min="2" max="30" step="1"
                  value={options.lineSpacing}
                  onChange={(e) => setOptions({...options, lineSpacing: parseInt(e.target.value)})}
                  className="w-full accent-[#141414]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] uppercase tracking-widest opacity-50 font-bold">
                    <span>Min Width</span>
                    <span>{options.minThickness}</span>
                  </div>
                  <input 
                    type="range" min="0" max="2" step="0.1"
                    value={options.minThickness}
                    onChange={(e) => setOptions({...options, minThickness: parseFloat(e.target.value)})}
                    className="w-full accent-[#141414]"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] uppercase tracking-widest opacity-50 font-bold">
                    <span>Max Width</span>
                    <span>{options.maxThickness}</span>
                  </div>
                  <input 
                    type="range" min="1" max="10" step="0.5"
                    value={options.maxThickness}
                    onChange={(e) => setOptions({...options, maxThickness: parseFloat(e.target.value)})}
                    className="w-full accent-[#141414]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[10px] uppercase tracking-widest opacity-50 font-bold">
                  <span>Opacity (Alpha)</span>
                  <span>{Math.round(options.opacity * 100)}%</span>
                </div>
                <input 
                  type="range" min="0.1" max="1" step="0.05"
                  value={options.opacity}
                  onChange={(e) => setOptions({...options, opacity: parseFloat(e.target.value)})}
                  className="w-full accent-[#141414]"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[10px] uppercase tracking-widest opacity-50 font-bold">
                  <span>Hand-drawn Noise</span>
                  <span>{options.noise}</span>
                </div>
                <input 
                  type="range" min="0" max="10" step="0.5"
                  value={options.noise}
                  onChange={(e) => setOptions({...options, noise: parseFloat(e.target.value)})}
                  className="w-full accent-[#141414]"
                />
              </div>

              {algorithm === 'hatching' && (
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] uppercase tracking-widest opacity-50 font-bold">
                    <span>Angle</span>
                    <span>{options.angle}°</span>
                  </div>
                  <input 
                    type="range" min="0" max="180" step="5"
                    value={options.angle}
                    onChange={(e) => setOptions({...options, angle: parseInt(e.target.value)})}
                    className="w-full accent-[#141414]"
                  />
                </div>
              )}

              {(algorithm === 'wavy' || algorithm === 'stippling' || algorithm === 'sketch') && (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] uppercase tracking-widest opacity-50 font-bold">
                      <span>Intensity</span>
                      <span>{options.intensity}</span>
                    </div>
                    <input 
                      type="range" min="0" max="50" step="1"
                      value={options.intensity}
                      onChange={(e) => setOptions({...options, intensity: parseInt(e.target.value)})}
                      className="w-full accent-[#141414]"
                    />
                  </div>
                  {algorithm === 'wavy' && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] uppercase tracking-widest opacity-50 font-bold">
                        <span>Wave Frequency</span>
                        <span>{options.frequency}</span>
                      </div>
                      <input 
                        type="range" min="0.1" max="5" step="0.1"
                        value={options.frequency}
                        onChange={(e) => setOptions({...options, frequency: parseFloat(e.target.value)})}
                        className="w-full accent-[#141414]"
                      />
                    </div>
                  )}
                </>
              )}

              {algorithm === 'scribble' && (
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] uppercase tracking-widest opacity-50 font-bold">
                    <span>Scribble Points</span>
                    <span>{options.scribblePoints}</span>
                  </div>
                  <input 
                    type="range" min="1000" max="20000" step="500"
                    value={options.scribblePoints}
                    onChange={(e) => setOptions({...options, scribblePoints: parseInt(e.target.value)})}
                    className="w-full accent-[#141414]"
                  />
                </div>
              )}

              {(algorithm === 'hatching' || algorithm === 'spiral' || algorithm === 'cross-hatching' || algorithm === 'grid') && (
                <div className="space-y-2 bg-black/5 p-3 rounded-xl border border-black/5">
                  <div className="flex justify-between text-[10px] uppercase tracking-widest opacity-50 font-bold mb-1">
                    <span>Stroke Dash Pattern</span>
                  </div>
                  <input 
                    type="text"
                    placeholder="e.g. 5, 5 or 10, 2, 2"
                    value={options.strokeDasharray}
                    onChange={(e) => setOptions({...options, strokeDasharray: e.target.value})}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-black/10 focus:border-black/30 bg-white outline-none transition-all font-mono"
                  />
                  <p className="text-[8px] uppercase tracking-wider opacity-30 mt-1">Comma separated values (dash, gap, ...)</p>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-black/5">
                <span className="text-[10px] uppercase tracking-widest opacity-50 font-bold">Invert Tones</span>
                <button 
                  onClick={() => setOptions({...options, invert: !options.invert})}
                  className={`w-12 h-6 rounded-full transition-all relative ${options.invert ? 'bg-[#141414]' : 'bg-black/10'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${options.invert ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
            </div>
          </section>
        </aside>

        {/* Canvas Display */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="bg-white rounded-[2rem] shadow-xl border border-black/5 overflow-hidden relative min-h-[500px] flex items-center justify-center p-8">
            <AnimatePresence>
              {isProcessing && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 bg-white/60 backdrop-blur-sm flex items-center justify-center"
                >
                  <div className="flex flex-col items-center gap-4">
                    <RefreshCw className="animate-spin opacity-40" size={32} />
                    <span className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-40">Processing Path</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {!image ? (
              <div className="text-center space-y-4 opacity-20">
                <ImageIcon size={64} className="mx-auto" />
                <p className="font-serif italic text-xl">Upload an image to begin</p>
              </div>
            ) : (
              <canvas 
                ref={canvasRef} 
                className="max-w-full h-auto shadow-2xl bg-white"
              />
            )}
            
            {/* Hidden source canvas */}
            <canvas ref={sourceCanvasRef} className="hidden" />
          </div>
          
          <div className="flex justify-between items-center px-4">
            <div className="flex items-center gap-4 opacity-40">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-black" />
                <span className="text-[10px] uppercase font-bold tracking-widest">Pen: 0.5mm - 2.0mm</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-black" />
                <span className="text-[10px] uppercase font-bold tracking-widest">Paper: A4 / 300dpi</span>
              </div>
            </div>
            <p className="text-[10px] uppercase font-bold tracking-widest opacity-20 italic">Algorithm: {algorithm}</p>
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto mt-24 pt-8 border-t border-black/10 flex justify-between items-center opacity-40">
        <p className="text-[10px] uppercase tracking-widest font-bold">LinesLab Research Implementation</p>
        <p className="text-[10px] uppercase tracking-widest font-bold">© 2024</p>
      </footer>
    </div>
  );
};
