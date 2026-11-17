import React, { useEffect, useRef, useState } from 'react';
import { Camera, ScanText, X, RefreshCw, Upload, Check, AlertCircle, ShieldCheck } from 'lucide-react';

interface CameraScannerModalProps {
  isOpen: boolean;
  mode: 'camera' | 'scanner';
  onClose: () => void;
  onCapture: (dataUrl: string, mimeType: string, isScanner: boolean) => void;
}

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  isOpen,
  mode,
  onClose,
  onCapture,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraConsentGranted, setCameraConsentGranted] = useState(false);
  const [isRequestingCamera, setIsRequestingCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const requestAndStartCamera = async (targetFacing: 'environment' | 'user' = facingMode) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        'Live camera preview is unavailable in this browser. Upload a photo or capture natively below.'
      );
      return;
    }
    setIsRequestingCamera(true);
    setCameraError(null);
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: targetFacing },
        audio: false,
      });
      streamRef.current = stream;
      setCameraConsentGranted(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      setCameraConsentGranted(false);
      const errName = err?.name || '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setCameraError(
          'Camera permission was denied. You can allow camera access in browser settings or upload an image file below.'
        );
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setCameraError('No camera device was detected. You can still upload an image file below.');
      } else {
        setCameraError(
          err?.message || 'Camera unavailable right now. Upload a photo or capture natively below.'
        );
      }
    } finally {
      setIsRequestingCamera(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setCapturedUrl(null);
      setCameraError(null);
      setCameraConsentGranted(false);
      setIsRequestingCamera(false);
      return;
    }

    if (cameraConsentGranted && !capturedUrl) {
      void requestAndStartCamera(facingMode);
    }

    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, facingMode, capturedUrl]);

  if (!isOpen) return null;

  const handleShutter = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (mode === 'scanner') {
      ctx.filter = 'contrast(1.18) brightness(1.04)';
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedUrl(dataUrl);
    stopCamera();
  };

  const handleFileFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = String(ev.target?.result || '');
      if (dataUrl) {
        onCapture(dataUrl, file.type || 'image/jpeg', mode === 'scanner');
        onClose();
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'scanner' ? 'Document Scanner' : 'Camera Capture'}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg glass-card rounded-3xl border border-purple-400/45 overflow-hidden shadow-2xl flex flex-col"
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-600/30 border border-purple-400/40 flex items-center justify-center text-purple-200">
              {mode === 'scanner' ? <ScanText className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {mode === 'scanner' ? 'Document Scanner' : 'Camera'}
              </h3>
              <p className="text-[11px] text-purple-200/75">
                {mode === 'scanner'
                  ? 'Capture or upload a document page for instant Gemini OCR & summary'
                  : 'Take a photo to attach directly to your Aadesh AI chat'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close camera modal"
            className="min-w-[38px] min-h-[38px] rounded-xl bg-white/5 hover:bg-white/10 text-purple-200 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <canvas ref={canvasRef} className="hidden" />
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileFallback}
            className="hidden"
          />

          <div className="relative rounded-2xl overflow-hidden bg-[#080512] border border-purple-400/25 aspect-[4/3] flex items-center justify-center">
            {capturedUrl ? (
              <img src={capturedUrl} alt="Captured frame" className="w-full h-full object-contain" />
            ) : cameraError ? (
              <div className="p-6 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                <p className="text-xs text-purple-100/85 leading-relaxed">{cameraError}</p>
                <button
                  type="button"
                  onClick={() => void requestAndStartCamera(facingMode)}
                  className="px-4 py-2 rounded-xl bg-purple-600/35 hover:bg-purple-600/50 border border-purple-400/40 text-xs font-bold text-white cursor-pointer"
                >
                  Try Camera Again
                </button>
              </div>
            ) : !cameraConsentGranted ? (
              <div className="p-6 text-center space-y-3 max-w-sm">
                <div className="w-12 h-12 rounded-2xl bg-purple-600/25 border border-purple-400/40 flex items-center justify-center mx-auto text-purple-200">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white">Camera Access Needed</h4>
                  <p className="text-xs text-purple-200/75 leading-relaxed">
                    Aadesh AI only activates your camera when you choose to take a live photo or scan a document.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isRequestingCamera}
                  onClick={() => void requestAndStartCamera(facingMode)}
                  className="purple-glow-btn px-5 py-2.5 rounded-xl text-xs font-bold text-white inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  <Camera className="w-4 h-4" />
                  <span>{isRequestingCamera ? 'Requesting Camera...' : 'Enable Live Camera'}</span>
                </button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {mode === 'scanner' && (
                  <div className="absolute inset-6 border-2 border-dashed border-purple-300/60 rounded-2xl pointer-events-none" />
                )}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {capturedUrl ? (
              <>
                <button
                  type="button"
                  onClick={() => setCapturedUrl(null)}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white cursor-pointer"
                >
                  Retake
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCapture(capturedUrl, 'image/jpeg', mode === 'scanner');
                    onClose();
                  }}
                  className="purple-glow-btn min-h-[42px] px-5 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{mode === 'scanner' ? 'Scan & Attach to Chat' : 'Use Photo'}</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-purple-100 flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>{mode === 'scanner' ? 'Upload Page' : 'Choose / Native Cam'}</span>
                </button>

                {cameraConsentGranted && !cameraError && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFacingMode((f) => (f === 'environment' ? 'user' : 'environment'))}
                      title="Switch camera"
                      className="min-w-[42px] min-h-[42px] rounded-xl bg-white/10 hover:bg-white/15 text-purple-200 flex items-center justify-center cursor-pointer"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleShutter}
                      className="purple-glow-btn min-h-[42px] px-5 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Capture</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
