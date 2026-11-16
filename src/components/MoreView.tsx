import React, { useState, useRef } from 'react';
import {
  Wand2,
  Image as ImageIcon,
  Clock,
  Video,
  Languages,
  FileText,
  Mail,
  Inbox,
  PenTool,
  SpellCheck,
  AlignLeft,
  Sparkles,
  ArrowLeft,
  Upload,
  RefreshCw,
  AlertCircle,
  Send,
  Copy,
  Check,
  LayoutGrid,
} from 'lucide-react';
import { AppSettings, GeotaggedMedia, UserProfile } from '../types';
import { SUPPORTED_LANGUAGES } from '../data/languages';
import { getAuthHeaders } from '../utils/firebase';
import { ImageStudioView } from './ImageStudioView';
import { WorldClockView } from './WorldClockView';
import { InterpreterView } from './InterpreterView';
import { GeotagGalleryView } from './GeotagGalleryView';
import { MoreToolWorkspace, MoreWorkspaceToolId } from './MoreToolWorkspace';
import { CameraScannerModal } from './CameraScannerModal';
import { MarkdownRenderer } from './MarkdownRenderer';

export type MorePageToolId =
  | 'image-gen'
  | 'gallery'
  | 'world-time'
  | 'video-upload'
  | 'translation'
  | MoreWorkspaceToolId;

interface MoreViewProps {
  user: UserProfile;
  settings: AppSettings;
  isOnline: boolean;
  mediaItems: GeotaggedMedia[];
  onAddMedia: (media: GeotaggedMedia) => void;
  onDeleteMedia: (id: string) => void;
  onImageGenerated: (latencyMs: number) => void;
  onRecordTranslationMetric: (langA: string, langB: string, latencyMs: number) => void;
  onSendToChat: (text: string) => void;
  onAttachPhotoToChat: (file: File) => void;
  onAttachVideoToChat: (params: {
    name: string;
    content: string;
    frameBase64?: string;
  }) => void;
  onAskAboutCountry: (countryName: string, city: string, formattedTime: string) => void;
  onOpenScannerToChat: (dataUrl: string, mimeType: string) => void;
  onOpenSettings: () => void;
}

const TOOL_ITEMS: Array<{
  id: MorePageToolId;
  title: string;
  description: string;
  category: 'Creative & Media' | 'Language & Communication' | 'Writing & Productivity';
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
}> = [
  {
    id: 'image-gen',
    title: 'AI Image Generation',
    description: 'Create high-detail artwork and visuals with Gemini.',
    category: 'Creative & Media',
    icon: Wand2,
    accentClass: 'text-fuchsia-300 bg-fuchsia-500/20 border-fuchsia-400/35',
  },
  {
    id: 'gallery',
    title: 'Gallery',
    description: 'Browse geotagged media or attach device photos to chat.',
    category: 'Creative & Media',
    icon: ImageIcon,
    accentClass: 'text-violet-300 bg-violet-500/20 border-violet-400/35',
  },
  {
    id: 'world-time',
    title: 'World Time',
    description: 'Live global clocks across 190+ countries and zones.',
    category: 'Creative & Media',
    icon: Clock,
    accentClass: 'text-amber-300 bg-amber-500/20 border-amber-400/35',
  },
  {
    id: 'video-upload',
    title: 'Video Upload',
    description: 'Upload clips to summarize scenes, generate SRT, or attach.',
    category: 'Creative & Media',
    icon: Video,
    accentClass: 'text-rose-300 bg-rose-500/20 border-rose-400/35',
  },
  {
    id: 'translation',
    title: 'Translation',
    description: 'Live multilingual interpreter with pronunciation playback.',
    category: 'Language & Communication',
    icon: Languages,
    accentClass: 'text-teal-300 bg-teal-500/20 border-teal-400/35',
  },
  {
    id: 'doc-translate',
    title: 'Document Translation',
    description: 'Translate PDF, DOCX, TXT, or Markdown files cleanly.',
    category: 'Language & Communication',
    icon: FileText,
    accentClass: 'text-cyan-300 bg-cyan-500/20 border-cyan-400/35',
  },
  {
    id: 'email-write',
    title: 'Email Writing',
    description: 'Compose complete professional or personal emails fast.',
    category: 'Language & Communication',
    icon: Mail,
    accentClass: 'text-sky-300 bg-sky-500/20 border-sky-400/35',
  },
  {
    id: 'email-assist',
    title: 'Email Assistant',
    description: 'Generate smart replies, thread summaries, and tasks.',
    category: 'Language & Communication',
    icon: Inbox,
    accentClass: 'text-indigo-300 bg-indigo-500/20 border-indigo-400/35',
  },
  {
    id: 'writing-assist',
    title: 'AI Writing Assistant',
    description: 'Draft articles, social posts, proposals, and reports.',
    category: 'Writing & Productivity',
    icon: PenTool,
    accentClass: 'text-purple-300 bg-purple-500/20 border-purple-400/35',
  },
  {
    id: 'grammar',
    title: 'Grammar Correction',
    description: 'Fix grammar, spelling, clarity, and sentence flow.',
    category: 'Writing & Productivity',
    icon: SpellCheck,
    accentClass: 'text-emerald-300 bg-emerald-500/20 border-emerald-400/35',
  },
  {
    id: 'summarizer',
    title: 'Text Summarizer',
    description: 'Condense long articles and notes into clear takeaways.',
    category: 'Writing & Productivity',
    icon: AlignLeft,
    accentClass: 'text-pink-300 bg-pink-500/20 border-pink-400/35',
  },
  {
    id: 'extra-tools',
    title: 'Other Useful AI Tools',
    description: 'Code helper, study tutor, web research, and OCR scanner.',
    category: 'Writing & Productivity',
    icon: Sparkles,
    accentClass: 'text-purple-200 bg-purple-600/25 border-purple-400/40',
  },
];

export const MoreView: React.FC<MoreViewProps> = ({
  user,
  settings,
  isOnline,
  mediaItems,
  onAddMedia,
  onDeleteMedia,
  onImageGenerated,
  onRecordTranslationMetric,
  onSendToChat,
  onAttachPhotoToChat,
  onAttachVideoToChat,
  onAskAboutCountry,
  onOpenScannerToChat,
  onOpenSettings,
}) => {
  const [selectedTool, setSelectedTool] = useState<MorePageToolId | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  // Gallery device photo picker
  const galleryFileRef = useRef<HTMLInputElement>(null);

  // Video Upload & Analyzer state
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoFileMeta, setVideoFileMeta] = useState<{
    name: string;
    size: number;
    mimeType: string;
    duration?: number;
    dataUrl?: string;
    frameBase64?: string;
  } | null>(null);
  const [videoTask, setVideoTask] = useState<'summarize' | 'transcribe' | 'subtitles' | 'script'>('summarize');
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoTargetLang, setVideoTargetLang] = useState(settings.defaultTargetLanguage || 'en');
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoResult, setVideoResult] = useState<{
    summary?: string;
    transcript?: string;
    subtitlesSrt?: string;
    script?: string;
    highlights?: string[];
  } | null>(null);
  const [videoCopied, setVideoCopied] = useState(false);

  const activeMeta = TOOL_ITEMS.find((t) => t.id === selectedTool) || null;

  const handleVideoFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoError(null);
    setVideoResult(null);
    const objectUrl = URL.createObjectURL(file);
    setVideoPreviewUrl(objectUrl);

    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.muted = true;
    tempVideo.playsInline = true;
    tempVideo.src = objectUrl;

    tempVideo.onloadeddata = () => {
      const duration = Number.isFinite(tempVideo.duration) ? tempVideo.duration : undefined;
      setVideoFileMeta({
        name: file.name,
        size: file.size,
        mimeType: file.type || 'video/mp4',
        duration,
      });
      try {
        tempVideo.currentTime = Math.min(0.5, (tempVideo.duration || 1) / 2);
      } catch {}
    };

    tempVideo.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(960, tempVideo.videoWidth || 640);
        canvas.height = Math.min(540, tempVideo.videoHeight || 360);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
          const frame = canvas.toDataURL('image/jpeg', 0.85);
          setVideoFileMeta((prev) => (prev ? { ...prev, frameBase64: frame } : prev));
        }
      } catch {}
    };

    if (file.size <= 14 * 1024 * 1024) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = String(ev.target?.result || '');
        setVideoFileMeta((prev) =>
          prev
            ? { ...prev, dataUrl }
            : { name: file.name, size: file.size, mimeType: file.type || 'video/mp4', dataUrl }
        );
      };
      reader.readAsDataURL(file);
    }

    e.target.value = '';
  };

  const handleAnalyzeVideo = async () => {
    if (!videoFileMeta && !videoPrompt.trim()) {
      setVideoError('Upload a video clip or enter a prompt / script instructions first.');
      return;
    }
    if (!isOnline) {
      setVideoError('Video analysis with Gemini requires an internet connection.');
      return;
    }

    setVideoLoading(true);
    setVideoError(null);
    try {
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
        ...(settings.customGeminiApiKey ? { 'x-gemini-api-key': settings.customGeminiApiKey } : {}),
      });
      const res = await fetch('/api/video', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          task: videoTask,
          prompt:
            videoPrompt.trim() ||
            `Analyze "${videoFileMeta?.name || 'uploaded video'}" and generate ${videoTask}.`,
          videoData: videoFileMeta?.dataUrl || '',
          videoMimeType: videoFileMeta?.mimeType || 'video/mp4',
          targetLanguage: videoTargetLang,
          customApiKey: settings.customGeminiApiKey,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Video analysis failed (${res.status})`);
      }
      setVideoResult(data);
    } catch (err: any) {
      setVideoError(err?.message || 'Unable to analyze video right now.');
    } finally {
      setVideoLoading(false);
    }
  };

  const isMoreWorkspaceTool =
    selectedTool === 'doc-translate' ||
    selectedTool === 'email-write' ||
    selectedTool === 'email-assist' ||
    selectedTool === 'writing-assist' ||
    selectedTool === 'grammar' ||
    selectedTool === 'summarizer' ||
    selectedTool === 'extra-tools';

  return (
    <div className="max-w-5xl mx-auto w-full px-3 sm:px-6 py-5 pb-32 space-y-5">
      {!selectedTool ? (
        <>
          {/* Dedicated More Tools Hub Header */}
          <div className="glass-card rounded-3xl p-5 sm:p-6 border border-purple-400/30 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-300">
              <LayoutGrid className="w-4 h-4 text-purple-400" />
              <span>Aadesh AI Suite</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white">More AI Tools &amp; Utilities</h1>
            <p className="text-xs sm:text-sm text-purple-200/75 max-w-2xl">
              Launch image creation, media tools, world time, translation, email drafting, grammar refinement, summarization, and coding or study utilities.
            </p>
          </div>

          {(['Creative & Media', 'Language & Communication', 'Writing & Productivity'] as const).map(
            (groupName) => {
              const items = TOOL_ITEMS.filter((item) => item.category === groupName);
              return (
                <section key={groupName} className="space-y-3">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-purple-300/90 px-1">
                    {groupName}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {items.map((tool) => {
                      const ToolIcon = tool.icon;
                      return (
                        <button
                          key={tool.id}
                          type="button"
                          onClick={() => setSelectedTool(tool.id)}
                          className="glass-card glass-card-hover rounded-2xl p-4 border border-purple-400/25 hover:border-purple-400/60 flex flex-col justify-between gap-3 text-left cursor-pointer min-h-[126px] group"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${tool.accentClass}`}
                            >
                              <ToolIcon className="w-5 h-5" />
                            </span>
                          </div>
                          <div className="space-y-1">
                            <div className="text-sm font-bold text-white group-hover:text-purple-200 transition-colors">
                              {tool.title}
                            </div>
                            <p className="text-xs text-purple-200/70 leading-relaxed">
                              {tool.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            }
          )}
        </>
      ) : (
        <div className="space-y-4">
          {/* Active Tool Back Bar */}
          <div className="glass-card rounded-2xl px-4 py-3 border border-purple-400/35 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setSelectedTool(null)}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-purple-950/70 hover:bg-purple-900/70 border border-purple-400/35 text-xs font-bold text-purple-100 flex items-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>All Tools</span>
            </button>
            {activeMeta && (
              <div className="text-right min-w-0">
                <div className="text-sm font-bold text-white truncate">{activeMeta.title}</div>
                <div className="text-[11px] text-purple-200/70 truncate hidden sm:block">
                  {activeMeta.description}
                </div>
              </div>
            )}
          </div>

          {selectedTool === 'image-gen' && (
            <ImageStudioView
              settings={settings}
              user={user}
              isOnline={isOnline}
              onOpenSettings={onOpenSettings}
              onImageGenerated={(latencyMs) => onImageGenerated(latencyMs ?? 0)}
            />
          )}

          {selectedTool === 'world-time' && (
            <WorldClockView
              onAskAboutCountry={(country, formattedTime) => {
                onAskAboutCountry(country.country, country.city, formattedTime);
              }}
            />
          )}

          {selectedTool === 'translation' && (
            <InterpreterView
              settings={settings}
              isOnline={isOnline}
              onRecordTranslationMetric={onRecordTranslationMetric}
            />
          )}

          {selectedTool === 'gallery' && (
            <div className="space-y-4">
              <div className="glass-card rounded-2xl p-4 border border-purple-400/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Attach Photo from Device</div>
                  <p className="text-xs text-purple-200/75">
                    Select a photo from your device to analyze directly in Chat, or explore geotagged media below.
                  </p>
                </div>
                <input
                  ref={galleryFileRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      onAttachPhotoToChat(file);
                    }
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => galleryFileRef.current?.click()}
                  className="purple-glow-btn min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Upload className="w-4 h-4" />
                  <span>Attach Photo to Chat</span>
                </button>
              </div>

              <GeotagGalleryView
                mediaItems={mediaItems}
                onAddMedia={onAddMedia}
                onDeleteMedia={onDeleteMedia}
                isOnline={isOnline}
                customGeminiApiKey={settings.customGeminiApiKey}
              />
            </div>
          )}

          {selectedTool === 'video-upload' && (
            <div className="glass-card rounded-3xl p-5 sm:p-6 border border-purple-400/30 space-y-4">
              <input
                ref={videoFileInputRef}
                type="file"
                accept="video/*"
                onChange={handleVideoFileSelected}
                className="hidden"
              />

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-white flex items-center gap-2">
                    <Video className="w-5 h-5 text-rose-300" />
                    <span>Video Upload &amp; AI Analysis</span>
                  </h2>
                  <p className="text-xs text-purple-200/75">
                    Upload a video clip (up to 14 MB for direct Gemini video inspection) or attach its frame and metadata to Chat.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => videoFileInputRef.current?.click()}
                  className="purple-glow-btn min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Upload className="w-4 h-4" />
                  <span>Select Video File</span>
                </button>
              </div>

              {videoPreviewUrl && videoFileMeta && (
                <div className="p-3.5 rounded-2xl bg-[#0c081a] border border-purple-400/30 space-y-3">
                  <video
                    src={videoPreviewUrl}
                    controls
                    className="w-full max-h-64 rounded-xl bg-black border border-white/10"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-purple-200">
                    <span className="font-mono truncate max-w-xs">{videoFileMeta.name}</span>
                    <span className="tabular-nums text-purple-300">
                      {(videoFileMeta.size / (1024 * 1024)).toFixed(2)} MB
                      {videoFileMeta.duration ? ` · ${videoFileMeta.duration.toFixed(1)}s` : ''}
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-purple-200">Analysis Task</label>
                  <select
                    value={videoTask}
                    onChange={(e) => setVideoTask(e.target.value as any)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#0c081a] border border-purple-400/30 text-xs text-white outline-none"
                  >
                    <option value="summarize">Summarize Video &amp; Highlights</option>
                    <option value="transcribe">Transcribe Spoken Audio</option>
                    <option value="subtitles">Generate SRT Subtitles</option>
                    <option value="script">Write Narration / Script</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-purple-200">Output Language</label>
                  <select
                    value={videoTargetLang}
                    onChange={(e) => setVideoTargetLang(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#0c081a] border border-purple-400/30 text-xs text-white outline-none"
                  >
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.flag} {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <textarea
                rows={3}
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
                placeholder="Optional: ask specific questions about the video, describe what to extract, or paste a topic for a video script..."
                className="w-full p-3 rounded-2xl bg-[#0c081a] border border-purple-400/30 focus:border-purple-400 text-sm text-white placeholder-purple-300/45 outline-none"
              />

              {videoError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-400/40 text-xs text-rose-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{videoError}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleAnalyzeVideo}
                  disabled={videoLoading}
                  className="purple-glow-btn min-h-[44px] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {videoLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>{videoLoading ? 'Analyzing...' : 'Analyze with Gemini'}</span>
                </button>

                {videoFileMeta && (
                  <button
                    type="button"
                    onClick={() =>
                      onAttachVideoToChat({
                        name: videoFileMeta.name,
                        content: `Uploaded Video: ${videoFileMeta.name} (${(videoFileMeta.size / (1024 * 1024)).toFixed(2)} MB)${videoFileMeta.duration ? `, Duration: ${videoFileMeta.duration.toFixed(1)}s` : ''}`,
                        frameBase64: videoFileMeta.frameBase64,
                      })
                    }
                    className="min-h-[44px] px-4 py-2.5 rounded-xl bg-purple-950/70 hover:bg-purple-900/70 border border-purple-400/40 text-xs font-bold text-purple-100 flex items-center gap-2 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>Attach Video Frame to Chat</span>
                  </button>
                )}
              </div>

              {videoResult && (
                <div className="p-4 rounded-2xl bg-[#0c081a] border border-purple-400/35 space-y-3">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-xs font-bold text-purple-200 uppercase tracking-wider">
                      Video Analysis Result
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const text = [
                          videoResult.summary,
                          videoResult.transcript && `Transcript:\n${videoResult.transcript}`,
                          videoResult.subtitlesSrt && `Subtitles (SRT):\n${videoResult.subtitlesSrt}`,
                          videoResult.script && `Script:\n${videoResult.script}`,
                        ]
                          .filter(Boolean)
                          .join('\n\n');
                        navigator.clipboard.writeText(text);
                        setVideoCopied(true);
                        setTimeout(() => setVideoCopied(false), 1800);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-purple-100 flex items-center gap-1 cursor-pointer"
                    >
                      {videoCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{videoCopied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  {videoResult.summary && <MarkdownRenderer content={videoResult.summary} />}
                  {videoResult.highlights && videoResult.highlights.length > 0 && (
                    <ul className="list-disc pl-5 text-xs text-purple-100 space-y-1">
                      {videoResult.highlights.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  )}
                  {videoResult.transcript && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-bold text-purple-300">Transcript</div>
                      <pre className="p-3 rounded-xl bg-black/40 text-xs text-gray-200 whitespace-pre-wrap">
                        {videoResult.transcript}
                      </pre>
                    </div>
                  )}
                  {videoResult.subtitlesSrt && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-bold text-purple-300">Subtitles (.srt)</div>
                      <pre className="p-3 rounded-xl bg-black/40 text-xs text-gray-200 whitespace-pre-wrap font-mono">
                        {videoResult.subtitlesSrt}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {isMoreWorkspaceTool && (
            <div className="glass-card rounded-3xl p-4 sm:p-6 border border-purple-400/30">
              <MoreToolWorkspace
                toolId={selectedTool}
                settings={settings}
                isOnline={isOnline}
                onRecordTranslationMetric={onRecordTranslationMetric}
                onSendToChat={(text) => onSendToChat(text)}
                onOpenScanner={() => setScannerOpen(true)}
              />
            </div>
          )}
        </div>
      )}

      <CameraScannerModal
        isOpen={scannerOpen}
        mode="scanner"
        onClose={() => setScannerOpen(false)}
        onCapture={(dataUrl, mimeType) => {
          setScannerOpen(false);
          onOpenScannerToChat(dataUrl, mimeType);
        }}
      />
    </div>
  );
};
