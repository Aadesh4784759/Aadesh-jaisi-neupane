import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Image as ImageIcon,
  Wand2,
  Download,
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  Trash2,
  Maximize2,
  SlidersHorizontal,
  Clock,
  Layers,
  Cpu,
  WifiOff,
  Settings,
} from 'lucide-react';
import {
  AppSettings,
  GeneratedImageItem,
  ImageAspectRatio,
  ImageQualitySize,
  ImageStylePreset,
  UserProfile,
} from '../types';
import { ImageLightbox, LightboxImageData } from './ImageLightbox';
import {
  deleteGeneratedImageFromDB,
  loadGeneratedImagesFromDB,
  saveGeneratedImageToDB,
} from '../utils/imageHistoryStorage';
import {
  deleteGeneratedImageMetaFromFirestore,
  loadGeneratedImagesMetaFromFirestore,
  recordUsageAnalyticsToFirestore,
  saveGeneratedImageMetaToFirestore,
} from '../utils/firebase';

interface ImageModelOption {
  id: string;
  label: string;
  description: string;
  aspectRatios: ImageAspectRatio[];
  resolutions: ImageQualitySize[];
  supportsResolution: boolean;
}

const DEFAULT_IMAGE_MODELS: ImageModelOption[] = [
  {
    id: 'gemini-3.1-flash-lite-image',
    label: 'Flash Lite Image (Fast)',
    description: 'High-speed raster image generation powered by Gemini 3.1 Flash Lite Image',
    aspectRatios: ['1:1', '16:9', '9:16', '4:3'],
    resolutions: [],
    supportsResolution: false,
  },
  {
    id: 'gemini-nano-banana-2.1',
    label: 'Nano Banana 2.1 (HD)',
    description: 'Studio-quality 1K / 2K / 4K image generation powered by Gemini Nano Banana 2.1',
    aspectRatios: ['1:1', '16:9', '9:16', '4:3'],
    resolutions: ['1K', '2K', '4K'],
    supportsResolution: true,
  },
];

const STYLE_PRESETS: ImageStylePreset[] = [
  'Realistic',
  '3D',
  'Cartoon',
  'Anime',
  'Digital Art',
  'Painting',
];

const EXAMPLE_PROMPTS = [
  {
    label: 'Himalayan Sunrise',
    style: 'Realistic' as ImageStylePreset,
    aspectRatio: '16:9' as ImageAspectRatio,
    prompt:
      'Golden hour sunrise over snow-capped Himalayan peaks in Nepal, prayer flags fluttering in crisp mountain air, cinematic golden light and mist in the valley',
  },
  {
    label: 'Robot Portrait',
    style: 'Realistic' as ImageStylePreset,
    aspectRatio: '1:1' as ImageAspectRatio,
    prompt:
      'Close-up studio portrait of a friendly futuristic humanoid robot with subtle purple glass optics and brushed titanium plating, soft dramatic rim lighting',
  },
  {
    label: 'Futuristic City',
    style: 'Digital Art' as ImageStylePreset,
    aspectRatio: '16:9' as ImageAspectRatio,
    prompt:
      'Biophilic futuristic metropolis at twilight with elevated transit gardens, clean glass towers reflecting violet sky gradients, glowing waterfront promenades',
  },
  {
    label: 'Nepali Festival Art',
    style: 'Painting' as ImageStylePreset,
    aspectRatio: '4:3' as ImageAspectRatio,
    prompt:
      'Festive courtyard during Tihar in Kathmandu with hundreds of glowing brass oil diyo lamps, vibrant marigold garlands, and warm evening lantern light',
  },
  {
    label: '3D Explorer Mascot',
    style: '3D' as ImageStylePreset,
    aspectRatio: '1:1' as ImageAspectRatio,
    prompt:
      'Cute 3D stylized astronaut fox mascot holding a holographic globe, soft studio pastel purple lighting, crisp tactile materials',
  },
];

interface ImageStudioViewProps {
  settings: AppSettings;
  user: UserProfile;
  isOnline: boolean;
  onOpenSettings?: () => void;
  onImageGenerated?: (latencyMs?: number) => void;
}

export const ImageStudioView: React.FC<ImageStudioViewProps> = ({
  settings,
  user,
  isOnline,
  onOpenSettings,
  onImageGenerated,
}) => {
  const [models, setModels] = useState<ImageModelOption[]>(DEFAULT_IMAGE_MODELS);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.1-flash-lite-image');
  const [prompt, setPrompt] = useState<string>('');
  const [style, setStyle] = useState<ImageStylePreset>('Realistic');
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>('1:1');
  const [resolution, setResolution] = useState<ImageQualitySize>('1K');

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [generationStage, setGenerationStage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);

  const [activeImage, setActiveImage] = useState<GeneratedImageItem | null>(null);
  const [history, setHistory] = useState<GeneratedImageItem[]>([]);
  const [cloudMetadataOnly, setCloudMetadataOnly] = useState<
    Omit<GeneratedImageItem, 'imageDataUrl'>[]
  >([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<LightboxImageData | null>(null);

  const inFlightRef = useRef<boolean>(false);

  const activeModelMeta =
    models.find((m) => m.id === selectedModel) || models[0] || DEFAULT_IMAGE_MODELS[0];

  // Fetch supported models & capabilities from backend
  useEffect(() => {
    let cancelled = false;
    fetch('/api/images/models')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.models?.length) return;
        setModels(data.models);
        if (data.defaultModel) {
          setSelectedModel((prev) =>
            data.models.some((m: ImageModelOption) => m.id === prev) ? prev : data.defaultModel
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Load persistent history from IndexedDB + optional Firestore metadata when logged in
  useEffect(() => {
    let cancelled = false;
    const uid = user?.id || 'guest';

    (async () => {
      const localItems = await loadGeneratedImagesFromDB(uid);
      if (cancelled) return;
      setHistory(localItems);
      if (localItems.length > 0) {
        setActiveImage((prev) => prev || localItems[0]);
      }

      if (user?.isLoggedIn) {
        const remoteMeta = await loadGeneratedImagesMetaFromFirestore(uid).catch(() => []);
        if (cancelled) return;
        const localIds = new Set(localItems.map((item) => item.id));
        setCloudMetadataOnly(remoteMeta.filter((m) => !localIds.has(m.id)));
      } else {
        setCloudMetadataOnly([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.isLoggedIn]);

  // Live elapsed timer & honest progress stage text while generating
  useEffect(() => {
    if (!isGenerating) {
      setElapsedSeconds(0);
      setGenerationStage('');
      return;
    }

    setElapsedSeconds(0);
    setGenerationStage('Sending prompt to Gemini Image AI...');
    const interval = window.setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        if (next >= 3 && next < 9) {
          setGenerationStage('Composing scene & rendering pixels...');
        } else if (next >= 9) {
          setGenerationStage('Finalizing high-resolution image...');
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isGenerating]);

  const handleGenerate = async (overridePrompt?: string) => {
    if (inFlightRef.current || isGenerating) return;

    const promptToUse = (overridePrompt !== undefined ? overridePrompt : prompt).trim();
    if (!promptToUse) {
      setErrorMessage('Please enter a prompt describing the image you want to create.');
      return;
    }

    if (!isOnline) {
      setErrorMessage(
        'Image generation requires an active internet connection. Reconnect from Offline Mode and try again.'
      );
      return;
    }

    inFlightRef.current = true;
    setIsGenerating(true);
    setErrorMessage(null);
    setFallbackNotice(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (settings.customGeminiApiKey) {
        headers['x-gemini-api-key'] = settings.customGeminiApiKey;
      }

      const payload: Record<string, any> = {
        prompt: promptToUse,
        style,
        aspectRatio,
        model: selectedModel,
        customApiKey: settings.customGeminiApiKey,
      };
      if (activeModelMeta.supportsResolution) {
        payload.resolution = resolution;
      }

      const res = await fetch('/api/images/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.imageDataUrl || !String(data.imageDataUrl).startsWith('data:image/')) {
        throw new Error(
          data?.error || `Image generation failed (${res.status}). Please check your API key or try again.`
        );
      }

      const newId = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const uid = user?.id || 'guest';
      const generatedItem: GeneratedImageItem = {
        id: newId,
        userId: uid,
        prompt: promptToUse,
        revisedPrompt: data.revisedPrompt,
        style: data.style || style,
        aspectRatio: data.aspectRatio || aspectRatio,
        resolution: data.resolution || (activeModelMeta.supportsResolution ? resolution : undefined),
        modelName: data.modelUsed || selectedModel,
        mimeType: data.mimeType || 'image/png',
        imageDataUrl: data.imageDataUrl,
        storageLocation: `indexeddb:${newId}`,
        createdAt: Date.now(),
        latencyMs: data.latencyMs,
      };

      setActiveImage(generatedItem);
      setHistory((prev) => [generatedItem, ...prev]);
      if (data.fallbackNotice) {
        setFallbackNotice(String(data.fallbackNotice));
      }

      await saveGeneratedImageToDB(uid, generatedItem);
      if (user?.isLoggedIn) {
        saveGeneratedImageMetaToFirestore(uid, generatedItem).catch(() => {});
        recordUsageAnalyticsToFirestore({
          eventType: 'image',
          language: settings.uiLanguage || 'en',
          latencyMs: generatedItem.latencyMs,
        }).catch(() => {});
      }

      onImageGenerated?.(generatedItem.latencyMs);
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Unable to generate image right now. Please try again.'
      );
    } finally {
      inFlightRef.current = false;
      setIsGenerating(false);
    }
  };

  const handleDownloadImage = (item: GeneratedImageItem) => {
    const ext = item.mimeType?.includes('svg')
      ? 'svg'
      : item.mimeType?.includes('jpeg')
      ? 'jpg'
      : item.mimeType?.includes('webp')
      ? 'webp'
      : 'png';
    const link = document.createElement('a');
    link.href = item.imageDataUrl;
    link.download = `aadesh-ai-${item.id}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyPrompt = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {}
  };

  const handleDeleteHistoryItem = async (id: string) => {
    const uid = user?.id || 'guest';
    setHistory((prev) => prev.filter((item) => item.id !== id));
    setCloudMetadataOnly((prev) => prev.filter((item) => item.id !== id));
    if (activeImage?.id === id) {
      const remaining = history.filter((item) => item.id !== id);
      setActiveImage(remaining[0] || null);
    }
    await deleteGeneratedImageFromDB(id, uid);
    if (user?.isLoggedIn) {
      deleteGeneratedImageMetaFromFirestore(uid, id).catch(() => {});
    }
  };

  const needsBillingHint =
    Boolean(errorMessage) &&
    /billing|permission|quota|api key|403|401|429/i.test(errorMessage || '');

  return (
    <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 py-4 sm:py-6 pb-28 lg:pb-10 space-y-6">
      {/* Studio Header */}
      <div className="glass-card rounded-3xl p-4 sm:p-6 border border-purple-500/35 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl purple-glow-btn flex items-center justify-center shrink-0 shadow-lg">
            <Wand2 className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-black text-white tracking-tight flex flex-wrap items-center gap-2">
              <span>Aadesh AI Image Studio</span>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purple-900/60 border border-purple-400/40 text-purple-200">
                {activeModelMeta.label}
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
              Generate real high-detail raster artwork with aspect ratio, style, and resolution controls.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isOnline && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950/70 border border-amber-500/40 text-amber-300 text-xs font-semibold">
              <WifiOff className="w-3.5 h-3.5" />
              <span>Offline</span>
            </span>
          )}
          <div className="px-3 py-1.5 rounded-xl bg-[#090a0f]/90 border border-[#232738] text-xs text-gray-300 flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            <span>
              Saved: <strong className="text-white">{history.length}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Main Responsive Grid: Controls Left, Preview Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: Prompt & Model Settings */}
        <div className="lg:col-span-5 glass-card rounded-3xl p-4 sm:p-5 border border-purple-500/30 space-y-5">
          {/* Prompt Box */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="image-studio-prompt"
                className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Image Prompt</span>
              </label>
              {prompt.trim() && (
                <button
                  type="button"
                  onClick={() => handleCopyPrompt(prompt, 'composer-prompt')}
                  className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  {copiedId === 'composer-prompt' ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-300">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Prompt</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <textarea
              id="image-studio-prompt"
              rows={4}
              maxLength={1500}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
              placeholder="Describe your scene, subject, lighting, mood, and composition..."
              className="w-full bg-[#090a0f]/95 border border-[#232738] focus:border-purple-500 rounded-2xl p-3.5 text-sm text-gray-100 placeholder-gray-500 outline-none resize-y min-h-[108px] leading-relaxed transition-colors"
            />
            <div className="flex items-center justify-between text-[11px] text-gray-500">
              <span>Ctrl/Cmd + Enter to generate</span>
              <span>{prompt.length}/1500</span>
            </div>
          </div>

          {/* Starter Example Prompts */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Starter Prompts
            </div>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => {
                    setPrompt(ex.prompt);
                    setStyle(ex.style);
                    setAspectRatio(ex.aspectRatio);
                    setErrorMessage(null);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-[#090a0f] hover:bg-purple-950/60 border border-[#232738] hover:border-purple-500/50 text-[11px] font-semibold text-purple-200 transition-all cursor-pointer"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>

          {/* Model Selector */}
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-purple-400" />
              <span>AI Image Model</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
              {models.map((m) => {
                const selected = selectedModel === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedModel(m.id)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      selected
                        ? 'bg-purple-900/40 border-purple-400 text-white shadow-md shadow-purple-950/50'
                        : 'bg-[#090a0f]/90 border-[#232738] text-gray-300 hover:border-purple-500/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold">{m.label}</span>
                      <span className="text-[10px] font-mono text-purple-300 truncate">{m.id}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">{m.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Style Selector */}
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-purple-400" />
              <span>Visual Style</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {STYLE_PRESETS.map((preset) => {
                const active = style === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setStyle(preset)}
                    className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      active
                        ? 'bg-purple-600/40 border-purple-400 text-white shadow-sm'
                        : 'bg-[#090a0f]/90 border-[#232738] text-gray-300 hover:border-purple-500/40 hover:text-white'
                    }`}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Aspect Ratio */}
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-purple-300">
              Aspect Ratio
            </div>
            <div className="grid grid-cols-4 gap-2">
              {activeModelMeta.aspectRatios.map((ratio) => {
                const active = aspectRatio === ratio;
                return (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setAspectRatio(ratio)}
                    className={`py-2 px-2 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer ${
                      active
                        ? 'bg-purple-600/40 border-purple-400 text-white'
                        : 'bg-[#090a0f]/90 border-[#232738] text-gray-300 hover:border-purple-500/40 hover:text-white'
                    }`}
                  >
                    {ratio}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quality / Resolution (shown ONLY for models supporting imageSize) */}
          {activeModelMeta.supportsResolution && activeModelMeta.resolutions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-purple-300">
                <span>Quality / Resolution</span>
                <span className="text-[10px] font-normal text-purple-200/80">Nano Banana 2.1</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {activeModelMeta.resolutions.map((resOpt) => {
                  const active = resolution === resOpt;
                  return (
                    <button
                      key={resOpt}
                      type="button"
                      onClick={() => setResolution(resOpt)}
                      className={`py-2 px-3 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer ${
                        active
                          ? 'bg-purple-600/40 border-purple-400 text-white'
                          : 'bg-[#090a0f]/90 border-[#232738] text-gray-300 hover:border-purple-500/40 hover:text-white'
                      }`}
                    >
                      {resOpt}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Primary Generate CTA */}
          <button
            type="button"
            onClick={() => handleGenerate()}
            disabled={isGenerating || !prompt.trim() || !isOnline}
            className="w-full purple-glow-btn text-white font-bold py-3.5 px-5 rounded-2xl flex items-center justify-center gap-2 text-sm disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer transition-all"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Generating ({elapsedSeconds}s)...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                <span>Generate Image</span>
              </>
            )}
          </button>
        </div>

        {/* RIGHT COLUMN: Live Preview, Errors & Metadata */}
        <div className="lg:col-span-7 space-y-5">
          {/* Honest Error Banner with Retry */}
          {errorMessage && (
            <div
              role="alert"
              className="rounded-2xl bg-rose-950/75 border border-rose-500/50 p-4 text-rose-100 space-y-3 shadow-xl"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-xs sm:text-sm font-bold text-rose-200">
                    Image Generation Unavailable
                  </div>
                  <p className="text-xs text-rose-100/90 leading-relaxed break-words">
                    {errorMessage}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-8">
                <button
                  type="button"
                  onClick={() => handleGenerate()}
                  disabled={isGenerating || !prompt.trim()}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Generation</span>
                </button>
                {needsBillingHint && onOpenSettings && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="px-3.5 py-1.5 rounded-xl bg-[#131520] hover:bg-white/10 border border-rose-400/40 text-rose-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Configure Gemini API Key</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {fallbackNotice && !errorMessage && (
            <div
              role="status"
              className="rounded-2xl bg-amber-950/60 border border-amber-500/45 p-3.5 text-amber-100 flex items-start gap-2.5 text-xs shadow-lg"
            >
              <Sparkles className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1 leading-relaxed">{fallbackNotice}</div>
            </div>
          )}

          {/* Main Image Canvas Card */}
          <div className="glass-card rounded-3xl p-4 sm:p-6 border border-purple-500/30 space-y-4">
            {isGenerating ? (
              <div className="aspect-square max-h-[520px] w-full rounded-2xl bg-[#090a0f]/95 border border-purple-500/35 flex flex-col items-center justify-center p-6 text-center space-y-4 relative overflow-hidden">
                <div className="w-16 h-16 rounded-2xl purple-glow-btn flex items-center justify-center animate-pulse shadow-2xl">
                  <Sparkles className="w-7 h-7 text-white animate-spin" />
                </div>
                <div className="space-y-1.5 max-w-sm">
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    {generationStage || 'Generating your image...'}
                  </h3>
                  <p className="text-xs text-purple-300 font-mono">
                    {selectedModel} · {aspectRatio} · {style} · {elapsedSeconds}s
                  </p>
                </div>
                <div className="w-48 h-1.5 rounded-full bg-[#131520] overflow-hidden">
                  <div className="h-full w-2/3 bg-gradient-to-r from-purple-500 via-fuchsia-400 to-indigo-500 animate-pulse rounded-full" />
                </div>
              </div>
            ) : activeImage ? (
              <>
                <div className="relative group rounded-2xl overflow-hidden bg-[#090a0f] border border-white/10 flex items-center justify-center max-h-[560px]">
                  <img
                    src={activeImage.imageDataUrl}
                    alt={activeImage.prompt}
                    onClick={() =>
                      setLightboxImage({
                        url: activeImage.imageDataUrl,
                        alt: activeImage.prompt,
                        senderName: `Aadesh AI · ${activeImage.modelName}`,
                        timestamp: activeImage.createdAt,
                        caption: activeImage.prompt,
                      })
                    }
                    className="w-full max-h-[540px] object-contain cursor-zoom-in"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxImage({
                        url: activeImage.imageDataUrl,
                        alt: activeImage.prompt,
                        senderName: `Aadesh AI · ${activeImage.modelName}`,
                        timestamp: activeImage.createdAt,
                        caption: activeImage.prompt,
                      })
                    }
                    className="absolute top-3 right-3 p-2 rounded-xl bg-black/70 hover:bg-purple-900/80 border border-white/15 text-white opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="View Full Screen"
                    aria-label="Open full-screen preview"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Preview Metadata & Action Bar */}
                <div className="space-y-3 pt-1">
                  <p className="text-xs sm:text-sm text-gray-200 leading-relaxed break-words">
                    {activeImage.prompt}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-white/10">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                      <span className="px-2 py-0.5 rounded-lg bg-[#090a0f] border border-purple-500/30 text-purple-200 font-mono">
                        {activeImage.modelName}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-[#090a0f] border border-white/10">
                        {activeImage.aspectRatio}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-[#090a0f] border border-white/10">
                        {activeImage.style}
                      </span>
                      {activeImage.resolution && (
                        <span className="px-2 py-0.5 rounded-lg bg-[#090a0f] border border-white/10 font-mono">
                          {activeImage.resolution}
                        </span>
                      )}
                      {typeof activeImage.latencyMs === 'number' && (
                        <span className="inline-flex items-center gap-1 text-gray-400">
                          <Clock className="w-3 h-3 text-purple-400" />
                          <span>{(activeImage.latencyMs / 1000).toFixed(1)}s</span>
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyPrompt(activeImage.prompt, activeImage.id)}
                        className="px-3 py-1.5 rounded-xl bg-[#090a0f] hover:bg-white/10 border border-[#232738] text-xs font-semibold text-gray-200 flex items-center gap-1.5 cursor-pointer"
                      >
                        {copiedId === activeImage.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-300">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-purple-300" />
                            <span>Copy Prompt</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPrompt(activeImage.prompt);
                          handleGenerate(activeImage.prompt);
                        }}
                        disabled={isGenerating}
                        className="px-3 py-1.5 rounded-xl bg-[#090a0f] hover:bg-purple-900/40 border border-purple-500/35 text-xs font-semibold text-purple-200 flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Regenerate</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownloadImage(activeImage)}
                        className="purple-glow-btn px-3.5 py-1.5 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-16 px-6 rounded-2xl bg-[#090a0f]/80 border border-dashed border-purple-500/30 flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-purple-950/70 border border-purple-500/40 flex items-center justify-center text-purple-300">
                  <ImageIcon className="w-7 h-7" />
                </div>
                <div className="space-y-1 max-w-md">
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    Create High-Detail Images with Aadesh AI
                  </h3>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Enter a prompt or pick a starter idea on the left, customize your style and aspect ratio, then click <strong className="text-purple-300">Generate Image</strong>.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Persistent Image Generation History */}
      {(history.length > 0 || cloudMetadataOnly.length > 0) && (
        <div className="glass-card rounded-3xl p-4 sm:p-6 border border-purple-500/25 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-purple-400" />
              <span>Image Generation History</span>
            </h2>
            <span className="text-xs text-gray-400">
              {history.length} local {history.length === 1 ? 'image' : 'images'}
            </span>
          </div>

          {history.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {history.map((item) => {
                const isSelected = activeImage?.id === item.id;
                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl overflow-hidden bg-[#090a0f]/95 border transition-all flex flex-col ${
                      isSelected
                        ? 'border-purple-400 ring-2 ring-purple-500/40'
                        : 'border-[#232738] hover:border-purple-500/50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveImage(item);
                        setPrompt(item.prompt);
                      }}
                      className="aspect-square w-full overflow-hidden bg-black/50 cursor-pointer block"
                    >
                      <img
                        src={item.imageDataUrl}
                        alt={item.prompt}
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                      />
                    </button>

                    <div className="p-2.5 space-y-2 flex-1 flex flex-col justify-between">
                      <p className="text-[11px] text-gray-200 line-clamp-2 leading-snug">
                        {item.prompt}
                      </p>

                      <div className="flex items-center justify-between gap-1 pt-1 border-t border-white/5">
                        <span className="text-[10px] text-purple-300 font-semibold truncate">
                          {item.style} · {item.aspectRatio}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleDownloadImage(item)}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white cursor-pointer"
                            title="Download"
                            aria-label="Download image"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteHistoryItem(item.id)}
                            className="p-1.5 rounded-lg hover:bg-rose-950/60 text-gray-400 hover:text-rose-300 cursor-pointer"
                            title="Delete from history"
                            aria-label="Delete image"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {cloudMetadataOnly.length > 0 && (
            <div className="pt-3 border-t border-white/10 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Recent Prompts Synced to Account (Reload prompt to regenerate on this device)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {cloudMetadataOnly.slice(0, 6).map((meta) => (
                  <button
                    key={meta.id}
                    type="button"
                    onClick={() => {
                      setPrompt(meta.prompt);
                      if (STYLE_PRESETS.includes(meta.style as ImageStylePreset)) {
                        setStyle(meta.style as ImageStylePreset);
                      }
                      if (['1:1', '16:9', '9:16', '4:3'].includes(meta.aspectRatio)) {
                        setAspectRatio(meta.aspectRatio as ImageAspectRatio);
                      }
                    }}
                    className="p-2.5 rounded-xl bg-[#090a0f]/80 hover:bg-purple-950/40 border border-[#232738] hover:border-purple-500/40 text-left space-y-1 cursor-pointer transition-colors"
                  >
                    <p className="text-xs text-gray-200 line-clamp-1">{meta.prompt}</p>
                    <div className="text-[10px] text-purple-300">
                      {meta.style} · {meta.aspectRatio} · {meta.modelName}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <ImageLightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />
    </div>
  );
};
