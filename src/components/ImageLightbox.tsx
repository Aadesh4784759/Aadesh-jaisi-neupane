import React, { useEffect, useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, Download, MapPin, Clock } from 'lucide-react';

export interface LightboxImageData {
  url: string;
  alt?: string;
  senderName?: string;
  timestamp?: number;
  caption?: string;
  locationName?: string;
}

interface ImageLightboxProps {
  image: LightboxImageData | null;
  onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({ image, onClose }) => {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setZoom(1);
  }, [image?.url]);

  useEffect(() => {
    if (!image) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))));
      } else if (e.key === '-') {
        setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [image, onClose]);

  if (!image) return null;

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = image.url;
    link.download = `aadesh-ai-image-${image.timestamp || Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Full screen image viewer"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/92 backdrop-blur-md flex flex-col justify-between p-3 sm:p-6 animate-in fade-in duration-150"
    >
      {/* Top Controls Bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex items-center justify-between gap-3 max-w-6xl w-full mx-auto bg-[#0d101f]/90 border border-purple-500/35 rounded-2xl px-3.5 py-2.5 shadow-2xl"
      >
        <div className="min-w-0 flex items-center gap-2.5 text-xs text-gray-200">
          <span className="font-bold text-white truncate">
            {image.senderName || 'Attached Image'}
          </span>
          {image.timestamp && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-gray-400">
              <Clock className="w-3 h-3 text-purple-400" />
              <span>{new Date(image.timestamp).toLocaleString()}</span>
            </span>
          )}
          {image.locationName && (
            <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-950/70 border border-purple-500/30 text-[11px] text-purple-300">
              <MapPin className="w-3 h-3 text-purple-400" />
              <span className="truncate max-w-[180px]">{image.locationName}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
            className="p-2 rounded-xl bg-[#14182b] hover:bg-purple-900/50 border border-[#262b42] text-gray-200 hover:text-white transition-colors cursor-pointer"
            title="Zoom out (-)"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-[11px] font-mono tabular-nums text-purple-200 px-1.5 min-w-[44px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
            className="p-2 rounded-xl bg-[#14182b] hover:bg-purple-900/50 border border-[#262b42] text-gray-200 hover:text-white transition-colors cursor-pointer"
            title="Zoom in (+)"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="p-2 rounded-xl bg-[#14182b] hover:bg-purple-900/50 border border-[#262b42] text-gray-200 hover:text-white transition-colors cursor-pointer"
            title="Reset zoom"
            aria-label="Reset zoom"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="p-2 rounded-xl bg-[#14182b] hover:bg-purple-900/50 border border-[#262b42] text-purple-300 hover:text-white transition-colors cursor-pointer"
            title="Download image"
            aria-label="Download image"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-rose-950/60 hover:bg-rose-800/70 border border-rose-500/40 text-rose-200 hover:text-white transition-colors cursor-pointer ml-1"
            title="Close lightbox (Esc)"
            aria-label="Close lightbox"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Centered Full-Screen Image Viewport */}
      <div className="flex-1 flex items-center justify-center overflow-auto my-3">
        <img
          src={image.url}
          alt={image.alt || 'Attached chat image'}
          onClick={(e) => e.stopPropagation()}
          style={{ transform: `scale(${zoom})` }}
          className="max-h-[78vh] max-w-[92vw] object-contain rounded-2xl border border-white/15 shadow-[0_20px_70px_rgba(0,0,0,0.85)] transition-transform duration-150 select-none"
        />
      </div>

      {/* Optional Caption Footer */}
      {image.caption && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="max-w-3xl w-full mx-auto bg-[#0d101f]/90 border border-white/10 rounded-2xl px-4 py-2.5 text-center text-xs text-gray-200 line-clamp-2"
        >
          {image.caption}
        </div>
      )}
    </div>
  );
};
