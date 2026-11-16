import React, { useRef } from 'react';
import {
  X,
  Image as ImageIcon,
  Paperclip,
  MapPin,
  Video,
  Trash2,
  ArrowLeftRight,
  Upload,
} from 'lucide-react';
import { AppSettings, GeotaggedMedia, LocationData, UserProfile } from '../types';
import { DEFAULT_USER } from '../utils/storage';
import { ImageStudioView } from './ImageStudioView';
import { WorldClockView } from './WorldClockView';
import { ActiveVoiceView } from './ActiveVoiceView';
import { InterpreterView } from './InterpreterView';
import { GeotagGalleryView } from './GeotagGalleryView';
import { MoreToolWorkspace, MoreWorkspaceToolId } from './MoreToolWorkspace';

export type PlusToolModalId =
  | null
  | 'image-gen'
  | 'gallery'
  | 'world-time'
  | 'voice-assistant'
  | 'translation'
  | 'attachments'
  | MoreWorkspaceToolId;

interface ChatToolOverlayProps {
  activeTool: PlusToolModalId;
  onClose: () => void;
  user?: UserProfile;
  settings: AppSettings;
  isOnline: boolean;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onSendVoiceMessage: (params: { text: string; isVoice?: boolean; targetLanguage: string }) => Promise<any>;
  onSendToolResultToChat: (text: string) => void;
  onOpenScanner: () => void;
  onAskAboutCountry: (countryName: string, city: string, formattedTime: string) => void;
  onImageGenerated?: (latencyMs: number) => void;
  onRecordTranslationMetric?: (langA: string, langB: string, latencyMs: number) => void;
  mediaItems: GeotaggedMedia[];
  onAddMedia: (media: GeotaggedMedia) => void;
  onDeleteMedia: (id: string) => void;
  onPickDevicePhoto: (file: File) => void;
  selectedImage: { base64: string; mimeType: string } | null;
  selectedFile: { name: string; content: string } | null;
  selectedVideo: { name: string; size: number; previewUrl: string; duration?: number } | null;
  attachedLocation?: LocationData;
  onClearImage: () => void;
  onClearFile: () => void;
  onClearVideo: () => void;
  onClearLocation: () => void;
  onOpenTransfer?: () => void;
}

export const ChatToolOverlay: React.FC<ChatToolOverlayProps> = ({
  activeTool,
  onClose,
  user,
  settings,
  isOnline,
  onUpdateSettings,
  onSendVoiceMessage,
  onSendToolResultToChat,
  onOpenScanner,
  onAskAboutCountry,
  onImageGenerated,
  onRecordTranslationMetric,
  mediaItems,
  onAddMedia,
  onDeleteMedia,
  onPickDevicePhoto,
  selectedImage,
  selectedFile,
  selectedVideo,
  attachedLocation,
  onClearImage,
  onClearFile,
  onClearVideo,
  onClearLocation,
  onOpenTransfer,
}) => {
  const galleryFileRef = useRef<HTMLInputElement>(null);

  if (!activeTool) return null;

  const titles: Record<Exclude<PlusToolModalId, null>, string> = {
    'image-gen': 'AI Image Generation',
    gallery: 'Photo Gallery',
    'world-time': 'World Time',
    'voice-assistant': 'Voice Assistant',
    translation: 'Translation & Live Interpreter',
    attachments: 'Attachments',
    'doc-translate': 'Document Translation',
    'email-write': 'Email Writing',
    'email-assist': 'Email Assistant',
    'writing-assist': 'AI Writing Assistant',
    grammar: 'Grammar Correction',
    summarizer: 'Text Summarizer',
    'extra-tools': 'Additional AI Tools',
  };

  const isMoreWorkspaceTool =
    activeTool === 'doc-translate' ||
    activeTool === 'email-write' ||
    activeTool === 'email-assist' ||
    activeTool === 'writing-assist' ||
    activeTool === 'grammar' ||
    activeTool === 'summarizer' ||
    activeTool === 'extra-tools';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titles[activeTool]}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-4xl max-h-[92vh] glass-card rounded-t-3xl sm:rounded-3xl border border-purple-400/40 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-white/10 bg-[#0b0718]/90 flex items-center justify-between shrink-0">
          <h3 className="text-sm sm:text-base font-bold text-white">{titles[activeTool]}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tool"
            className="min-w-[38px] min-h-[38px] rounded-xl bg-white/5 hover:bg-white/15 text-purple-200 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5">
          {activeTool === 'image-gen' && (
            <ImageStudioView
              settings={settings}
              user={user || DEFAULT_USER}
              isOnline={isOnline}
              onOpenSettings={onClose}
              onImageGenerated={(latencyMs = 0) => onImageGenerated?.(latencyMs)}
            />
          )}

          {activeTool === 'world-time' && (
            <WorldClockView
              onAskAboutCountry={(country, formattedTime) => {
                onAskAboutCountry(country.country, country.city, formattedTime);
                onClose();
              }}
            />
          )}

          {activeTool === 'voice-assistant' && (
            <ActiveVoiceView
              settings={settings}
              onUpdateSettings={onUpdateSettings}
              isOnline={isOnline}
              onReturnToChat={onClose}
              onSendVoiceMessage={onSendVoiceMessage}
            />
          )}

          {activeTool === 'translation' && (
            <InterpreterView
              settings={settings}
              isOnline={isOnline}
              onRecordTranslationMetric={(langA, langB, latencyMs) =>
                onRecordTranslationMetric?.(langA, langB, latencyMs)
              }
            />
          )}

          {isMoreWorkspaceTool && (
            <MoreToolWorkspace
              toolId={activeTool}
              settings={settings}
              isOnline={isOnline}
              onRecordTranslationMetric={onRecordTranslationMetric}
              onSendToChat={(text) => {
                onClose();
                onSendToolResultToChat(text);
              }}
              onOpenScanner={() => {
                onClose();
                onOpenScanner();
              }}
            />
          )}

          {activeTool === 'gallery' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-purple-950/40 border border-purple-400/30">
                <div>
                  <div className="text-sm font-bold text-white">Attach Photo from Device</div>
                  <p className="text-xs text-purple-200/75">
                    Pick an image directly from your device gallery to analyze in chat, or explore saved geotagged media below.
                  </p>
                </div>
                <input
                  ref={galleryFileRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      onPickDevicePhoto(file);
                      onClose();
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
                  <span>Browse Device Gallery</span>
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

          {activeTool === 'attachments' && (
            <div className="space-y-4">
              {!selectedImage && !selectedFile && !selectedVideo && !attachedLocation ? (
                <div className="py-10 text-center space-y-3">
                  <Paperclip className="w-9 h-9 text-purple-400/70 mx-auto" />
                  <div className="text-sm font-bold text-white">No Active Attachments</div>
                  <p className="text-xs text-purple-200/70 max-w-sm mx-auto">
                    Use Camera, Upload Documents, Upload Files, or Location Sharing from the + menu to attach context to your message.
                  </p>
                  {onOpenTransfer && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenTransfer();
                      }}
                      className="purple-glow-btn px-4 py-2.5 rounded-xl text-xs font-bold text-white inline-flex items-center gap-2 cursor-pointer"
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                      <span>Open Transfer Hub</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedImage && (
                    <div className="p-3 rounded-2xl bg-[#0b0818]/80 border border-purple-400/30 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={selectedImage.base64}
                          alt="Attached"
                          className="w-14 h-14 rounded-xl object-cover border border-purple-400/40 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5 text-purple-300" />
                            <span>Attached Image</span>
                          </div>
                          <div className="text-[11px] text-purple-200/70">{selectedImage.mimeType}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={onClearImage}
                        className="p-2 rounded-xl bg-rose-500/20 text-rose-300 hover:text-white cursor-pointer"
                        aria-label="Remove image"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {selectedVideo && (
                    <div className="p-3 rounded-2xl bg-[#0b0818]/80 border border-purple-400/30 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <video
                          src={selectedVideo.previewUrl}
                          className="w-16 h-14 rounded-xl object-cover border border-purple-400/40 shrink-0 bg-black"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                            <Video className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                            <span className="truncate">{selectedVideo.name}</span>
                          </div>
                          <div className="text-[11px] text-purple-200/70 tabular-nums">
                            {(selectedVideo.size / (1024 * 1024)).toFixed(2)} MB
                            {selectedVideo.duration ? ` · ${Math.round(selectedVideo.duration)}s` : ''}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={onClearVideo}
                        className="p-2 rounded-xl bg-rose-500/20 text-rose-300 hover:text-white cursor-pointer"
                        aria-label="Remove video"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {selectedFile && (
                    <div className="p-3 rounded-2xl bg-[#0b0818]/80 border border-purple-400/30 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                          <Paperclip className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                          <span className="truncate font-mono">{selectedFile.name}</span>
                        </div>
                        <div className="text-[11px] text-purple-200/70 mt-0.5 tabular-nums">
                          {selectedFile.content.length.toLocaleString()} characters loaded
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={onClearFile}
                        className="p-2 rounded-xl bg-rose-500/20 text-rose-300 hover:text-white cursor-pointer"
                        aria-label="Remove file"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {attachedLocation && (
                    <div className="p-3 rounded-2xl bg-[#0b0818]/80 border border-purple-400/30 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                          <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="truncate">{attachedLocation.name}</span>
                        </div>
                        <div className="text-[11px] text-purple-200/70 font-mono tabular-nums">
                          {attachedLocation.lat.toFixed(4)}, {attachedLocation.lng.toFixed(4)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={onClearLocation}
                        className="p-2 rounded-xl bg-rose-500/20 text-rose-300 hover:text-white cursor-pointer"
                        aria-label="Remove location"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {onOpenTransfer && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenTransfer();
                      }}
                      className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400/40 text-xs font-bold text-white flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                      <span>Manage &amp; Share Files in Transfer Tab</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
