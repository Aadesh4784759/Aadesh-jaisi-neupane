import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Image as ImageIcon,
  MapPin,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Sparkles,
  Download,
  Trash2,
  Plus,
  Compass,
  Languages,
  ChevronDown,
  Layers,
  Info,
  ArrowUpRight,
  Globe2,
  HelpCircle,
  Lightbulb,
  FileText,
  FileCode,
  SlidersHorizontal,
  Square,
} from 'lucide-react';
import { AppSettings, ChatMessage, ChatSession, LocationData } from '../types';
import { SUPPORTED_LANGUAGES, UI_TRANSLATIONS } from '../data/languages';
import { GeotagPickerModal } from './GeotagPickerModal';
import { ExportModal, ExportFormat } from './ExportModal';
import { voiceAssistant } from '../utils/speech';

interface ChatViewProps {
  currentSession: ChatSession;
  allSessions: ChatSession[];
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onClearCurrentSession: () => void;
  onSendMessage: (params: {
    text: string;
    imageData?: string;
    imageMimeType?: string;
    location?: LocationData;
    isVoice?: boolean;
    targetLanguage: string;
  }) => Promise<void>;
  onUpdateSessionTargetLang: (lang: string) => void;
  settings: AppSettings;
  isOnline: boolean;
  isLoading: boolean;
  searchFilter: string;
}

export const ChatView: React.FC<ChatViewProps> = ({
  currentSession,
  allSessions,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onClearCurrentSession,
  onSendMessage,
  onUpdateSessionTargetLang,
  settings,
  isOnline,
  isLoading,
  searchFilter,
}) => {
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [attachedLocation, setAttachedLocation] = useState<LocationData | undefined>(undefined);
  const [showGeotagModal, setShowGeotagModal] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceInterimTranscript, setVoiceInterimTranscript] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [sessionsSidebarOpen, setSessionsSidebarOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Auto-increment recording timer when recording is active
  useEffect(() => {
    let interval: any = null;
    if (isRecording) {
      setRecordingDuration(0);
      interval = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingDuration(0);
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Translation view mode per message: 'bilingual' | 'original' | 'translated'
  const [translationViewModes, setTranslationViewModes] = useState<Record<string, 'bilingual' | 'original' | 'translated'>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const t = UI_TRANSLATIONS[settings.uiLanguage] || UI_TRANSLATIONS.en;
  const targetLangObj =
    SUPPORTED_LANGUAGES.find((l) => l.code === currentSession.targetLanguage) || SUPPORTED_LANGUAGES[1];

  // Auto scroll to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession.messages, isLoading, voiceInterimTranscript]);

  // Handle Photo selection & base64 conversion
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setSelectedImage({
        base64: result,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  // Voice Speech Recognition Trigger
  const toggleVoiceRecording = () => {
    if (isRecording) {
      voiceAssistant.stopListening();
      setIsRecording(false);
      return;
    }

    const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === settings.uiLanguage);
    const speechCode = currentLang?.speechCode || 'en-US';

    const started = voiceAssistant.startListening(speechCode, {
      onStart: () => {
        setIsRecording(true);
        setVoiceInterimTranscript('');
      },
      onResult: (transcript, isFinal) => {
        setVoiceInterimTranscript(transcript);
        if (isFinal) {
          setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
          setIsRecording(false);

          if (settings.handsFreeMode && transcript.trim()) {
            setTimeout(() => {
              handleSend(transcript.trim(), true);
            }, 300);
          }
        }
      },
      onError: (err) => {
        console.warn('Voice recognition error:', err);
        setIsRecording(false);
      },
      onEnd: () => {
        setIsRecording(false);
      },
    });

    if (!started) {
      setIsRecording(false);
    }
  };

  // Handle Send
  const handleSend = async (customText?: string, isVoice: boolean = false) => {
    const textToSend = (customText !== undefined ? customText : inputText).trim();
    if (!textToSend && !selectedImage) return;

    const payload = {
      text: textToSend,
      imageData: selectedImage?.base64,
      imageMimeType: selectedImage?.mimeType,
      location: attachedLocation,
      isVoice: isVoice || isRecording,
      targetLanguage: currentSession.targetLanguage,
    };

    setInputText('');
    setSelectedImage(null);
    setAttachedLocation(undefined);
    setVoiceInterimTranscript('');

    await onSendMessage(payload);
  };

  // Read message aloud with Text to Speech
  const handleSpeakMessage = (msgId: string, text: string, langCode: string) => {
    if (speakingId === msgId) {
      voiceAssistant.stopSpeaking();
      setSpeakingId(null);
      return;
    }

    setSpeakingId(msgId);
    voiceAssistant.speak(text, langCode, {
      rate: settings.voiceSpeed,
      pitch: settings.voicePitch,
      onEnd: () => setSpeakingId(null),
      onError: () => setSpeakingId(null),
    });
  };

  // Copy text to clipboard
  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Quick Export directly as formatted text or JSON backup
  const handleQuickExport = (format: ExportFormat, targetSession: ChatSession = currentSession) => {
    const safeTitle = (targetSession.title || 'conversation')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const targetLang = SUPPORTED_LANGUAGES.find((l) => l.code === targetSession.targetLanguage) || SUPPORTED_LANGUAGES[0];
    const timestampStr = new Date().toISOString().slice(0, 10);

    if (format === 'json') {
      const data = {
        exportVersion: '2.5',
        generator: 'Aadesh AI - AI Learning Platform (Built by Aadesh Jaisi)',
        backupType: 'Local Chat Session Backup',
        exportedAt: new Date().toISOString(),
        exportedTimestamp: Date.now(),
        session: {
          id: targetSession.id,
          title: targetSession.title,
          createdAt: targetSession.createdAt,
          createdAtFormatted: new Date(targetSession.createdAt).toISOString(),
          updatedAt: targetSession.updatedAt,
          targetLanguage: {
            code: targetSession.targetLanguage,
            name: targetLang.name,
          },
          totalMessages: targetSession.messages.length,
          messages: targetSession.messages,
        },
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aadesh-ai-${safeTitle}-${timestampStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportToast('JSON backup saved to your local downloads!');
    } else if (format === 'txt') {
      const divider = '='.repeat(78);
      const subDivider = '-'.repeat(78);

      let text = `${divider}\n`;
      text += `AADESH AI - CONVERSATION HISTORY & LOCAL BACKUP\n`;
      text += `${divider}\n`;
      text += `Session Title   : ${targetSession.title}\n`;
      text += `Target Language : ${targetLang.name} (${targetSession.targetLanguage})\n`;
      text += `Export Date     : ${new Date().toLocaleString()}\n`;
      text += `Total Messages  : ${targetSession.messages.length}\n`;
      text += `Platform        : Aadesh AI Global Hub\n`;
      text += `${divider}\n\n`;

      targetSession.messages.forEach((m, idx) => {
        const speaker = m.role === 'user' ? '👤 USER' : '⚡ AADESH AI';
        const timeStr = `[${new Date(m.timestamp).toLocaleString()}]`;

        text += `Message #${idx + 1} ${timeStr} | ${speaker}\n`;

        if (m.location) {
          text += `📍 Geotag: ${m.location.name} (${m.location.lat}°, ${m.location.lng}°)\n`;
        }

        if (m.isVoiceInput) {
          text += `🎙️ Input: Voice Speech\n`;
        }

        text += `\n${m.content}\n`;

        if (m.translation) {
          text += `\n🌐 Translation (${targetLang.name}):\n`;
          text += `   ${m.translation.replace(/\n/g, '\n   ')}\n`;
        }

        if (m.geotagInsights) {
          text += `\n💡 Regional Insight:\n   ${m.geotagInsights}\n`;
        }

        text += `\n${subDivider}\n\n`;
      });

      text += `${divider}\nEnd of Backup - Exported from Aadesh AI\n${divider}\n`;

      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aadesh-ai-${safeTitle}-${timestampStr}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      setExportToast('Formatted Text backup saved locally!');
    } else {
      // Markdown
      let md = `# Aadesh AI Chat: ${targetSession.title}\n\n`;
      md += `> Target Language: **${targetLang.name}**  \n`;
      md += `> Export Date: ${new Date().toLocaleString()}  \n\n---\n\n`;

      targetSession.messages.forEach((m) => {
        md += `### ${m.role === 'user' ? '👤 User' : '⚡ Aadesh AI'} (${new Date(m.timestamp).toLocaleTimeString()})\n\n`;
        if (m.location) md += `📍 *Geotag*: ${m.location.name}\n\n`;
        md += `${m.content}\n\n`;
        if (m.translation) md += `🌐 *Translation (${targetLang.name})*:\n${m.translation}\n\n`;
        md += `---\n\n`;
      });

      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aadesh-ai-${safeTitle}-${timestampStr}.md`;
      a.click();
      URL.revokeObjectURL(url);
      setExportToast('Markdown backup saved locally!');
    }

    setExportDropdownOpen(false);
    setTimeout(() => setExportToast(null), 3000);
  };

  // Extract latest suggested questions from the most recent model response
  const latestModelMessage = [...currentSession.messages].reverse().find((m) => m.role === 'model');
  const activeSmartReplies = latestModelMessage?.suggestedQuestions && latestModelMessage.suggestedQuestions.length > 0
    ? latestModelMessage.suggestedQuestions
    : [
        'Translate this to Japanese',
        'How do I say "Thank you" in Nepali?',
        'Cultural customs in Kyoto',
        'Identify landmark in photo',
      ];

  // Filter messages if searchFilter is applied
  const displayedMessages = searchFilter
    ? currentSession.messages.filter(
        (m) =>
          m.content.toLowerCase().includes(searchFilter.toLowerCase()) ||
          (m.translation && m.translation.toLowerCase().includes(searchFilter.toLowerCase())) ||
          (m.location?.name && m.location.name.toLowerCase().includes(searchFilter.toLowerCase()))
      )
    : currentSession.messages;

  return (
    <div className="flex h-[calc(100vh-6.5rem)] relative w-full overflow-hidden">
      {/* SESSIONS SIDEBAR (Desktop & Mobile Drawer) */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-72 glass-nav border-r border-[#232738] p-4 flex flex-col justify-between transform transition-transform duration-300 md:relative md:translate-x-0 ${
          sessionsSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="space-y-4 flex-grow overflow-hidden flex flex-col">
          {/* Top Actions */}
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              <span>Conversation Logs</span>
            </h3>
            <button
              onClick={onNewSession}
              className="text-xs bg-purple-900/40 hover:bg-purple-900/80 border border-purple-500/40 text-purple-200 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all"
              title="New Chat Session"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
          </div>

          {/* Session List */}
          <div className="overflow-y-auto space-y-1.5 flex-grow pr-1">
            {allSessions.map((s) => {
              const isSelected = s.id === currentSession.id;
              return (
                <div
                  key={s.id}
                  onClick={() => {
                    onSelectSession(s.id);
                    setSessionsSidebarOpen(false);
                  }}
                  className={`group relative p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                    isSelected
                      ? 'bg-purple-900/35 border-purple-500/50 text-white shadow-md'
                      : 'bg-[#131520]/70 border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }`}
                >
                  <div className="min-w-0 flex-grow pr-2">
                    <p className="text-xs font-semibold truncate text-white">{s.title}</p>
                    <p className="text-[10px] text-gray-500 flex items-center gap-1">
                      <span>{new Date(s.updatedAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>{s.messages.length} msgs</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQuickExport('txt', s);
                      }}
                      className="p-1 hover:text-purple-300 text-gray-500 transition-colors cursor-pointer"
                      title="Export as Formatted Text (.txt)"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQuickExport('json', s);
                      }}
                      className="p-1 hover:text-purple-300 text-gray-500 transition-colors cursor-pointer"
                      title="Export as JSON (.json)"
                    >
                      <FileCode className="w-3.5 h-3.5" />
                    </button>
                    {allSessions.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSession(s.id);
                        }}
                        className="p-1 hover:text-red-400 text-gray-500 transition-colors cursor-pointer"
                        title="Delete Session"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-gray-400">
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-1.5 text-purple-300 hover:text-white font-semibold text-xs cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-purple-400" />
            <span>Export Backup</span>
          </button>
          <button
            onClick={() => setSessionsSidebarOpen(false)}
            className="md:hidden text-purple-400 text-xs font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Backdrop for mobile drawer */}
      {sessionsSidebarOpen && (
        <div
          onClick={() => setSessionsSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-xs"
        />
      )}

      {/* MAIN CHAT STREAM CONTAINER */}
      <div className="flex-1 flex flex-col h-full bg-transparent overflow-hidden relative">
        {/* Session Sub-Header Controls */}
        <div className="glass-nav px-4 py-2 border-b border-[#232738] flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSessionsSidebarOpen(true)}
              className="md:hidden p-1.5 rounded-lg bg-[#131520] border border-[#232738] text-gray-300"
              title="View History Logs"
            >
              <Layers className="w-4 h-4 text-purple-400" />
            </button>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <h2 className="text-xs sm:text-sm font-bold text-white truncate max-w-[180px] sm:max-w-xs">
                {currentSession.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Target Translation Selector */}
            <div className="flex items-center gap-1.5 bg-[#131520] border border-[#232738] px-2.5 py-1 rounded-xl text-xs">
              <Languages className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-[11px] text-gray-400 hidden sm:inline">Translate to:</span>
              <select
                value={currentSession.targetLanguage}
                onChange={(e) => onUpdateSessionTargetLang(e.target.value)}
                className="bg-transparent text-purple-300 font-semibold text-xs outline-none cursor-pointer"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code} className="bg-[#131520] text-gray-200">
                    {lang.flag} {lang.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Active AI Voice Persona Badge */}
            <div className="hidden lg:flex items-center gap-1.5 bg-[#131520] border border-purple-500/30 px-2.5 py-1 rounded-xl text-xs text-purple-300">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span className="capitalize font-semibold">{settings.voicePersona || 'friendly'} Voice</span>
            </div>

            {/* Export Chat Dropdown & Trigger */}
            <div className="relative">
              <button
                onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                className="p-1.5 sm:px-2.5 sm:py-1 rounded-xl bg-[#131520] hover:bg-purple-900/30 border border-[#232738] hover:border-purple-500/40 text-purple-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                title="Export Conversation History & Local Backup"
              >
                <Download className="w-3.5 h-3.5 text-purple-400" />
                <span className="hidden sm:inline">Export</span>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>

              {/* Export Dropdown Menu */}
              {exportDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 glass-card rounded-2xl p-2 border border-purple-500/40 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 space-y-1">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1 border-b border-white/5">
                    Save Local Backup (.txt / .json)
                  </div>

                  <button
                    onClick={() => handleQuickExport('txt')}
                    className="w-full text-left p-2 rounded-xl text-xs hover:bg-purple-900/30 text-gray-200 hover:text-white flex items-center justify-between transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-purple-400" />
                      <div>
                        <div className="font-semibold">Formatted Text (.txt)</div>
                        <div className="text-[10px] text-gray-400">Timestamped conversation transcript</div>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleQuickExport('json')}
                    className="w-full text-left p-2 rounded-xl text-xs hover:bg-purple-900/30 text-gray-200 hover:text-white flex items-center justify-between transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-purple-400" />
                      <div>
                        <div className="font-semibold">Structured JSON (.json)</div>
                        <div className="text-[10px] text-gray-400">Complete raw backup data</div>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleQuickExport('md')}
                    className="w-full text-left p-2 rounded-xl text-xs hover:bg-purple-900/30 text-gray-200 hover:text-white flex items-center justify-between transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-2">
                      <Download className="w-4 h-4 text-purple-400" />
                      <div>
                        <div className="font-semibold">Markdown (.md)</div>
                        <div className="text-[10px] text-gray-400">Formatted documentation</div>
                      </div>
                    </div>
                  </button>

                  <div className="pt-1 border-t border-white/5">
                    <button
                      onClick={() => {
                        setExportDropdownOpen(false);
                        setIsExportModalOpen(true);
                      }}
                      className="w-full text-center py-1.5 px-2 rounded-lg bg-purple-900/30 hover:bg-purple-900/60 text-purple-300 text-[11px] font-semibold border border-purple-500/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <SlidersHorizontal className="w-3 h-3 text-purple-400" />
                      <span>Customize & Preview Backup...</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Clear Messages */}
            <button
              onClick={onClearCurrentSession}
              className="p-1.5 rounded-xl bg-[#131520] border border-[#232738] text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
              title="Clear Session Messages"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Message Feed */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 pb-44">
          {/* Hero Welcome banner when starting */}
          {displayedMessages.length <= 1 && (
            <div className="relative text-center py-6 sm:py-8 space-y-4 max-w-2xl mx-auto overflow-hidden">
              {/* Subtle 3D Spheres floating in background matching attached photo */}
              <div className="sphere-3d w-14 h-14 absolute -top-2 left-6 opacity-60 animate-float-slow" />
              <div className="sphere-3d w-20 h-20 absolute -top-4 right-10 opacity-70 animate-float-delayed" />
              <div className="sphere-3d w-8 h-8 absolute bottom-0 left-1/4 opacity-50 animate-pulse-glow" />

              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-purple-950/60 border border-purple-500/30 text-purple-300 text-xs font-semibold shadow-inner">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>AI Learning Platform • Built by Aadesh Jaisi (आदेश जैसी)</span>
              </div>

              <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                Learn Anything with <span className="text-gradient">Aadesh AI</span>
              </h1>

              <p className="text-xs sm:text-sm text-gray-400 max-w-lg mx-auto">
                Real-time regional translation across 18+ languages, photo upload with geotagging, hands-free voice conversation, and smart follow-up suggestions.
              </p>

              {/* Quick Topic Starter Cards */}
              <div className="grid grid-cols-2 gap-2.5 pt-2 text-left">
                <button
                  onClick={() => handleSend('Translate "Can you recommend a traditional vegetarian meal?" into Japanese and explain the cultural etiquette')}
                  className="glass-card glass-card-hover p-3 rounded-xl border border-purple-500/25 text-left group"
                >
                  <div className="text-xs font-bold text-white flex items-center justify-between">
                    <span>🍜 Kyoto Dining Guide</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-purple-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1 line-clamp-1">Japanese dining phrases & etiquette</p>
                </button>

                <button
                  onClick={() => handleSend('How do I greet people warmly in Nepali? Give me common phrases with pronunciation')}
                  className="glass-card glass-card-hover p-3 rounded-xl border border-purple-500/25 text-left group"
                >
                  <div className="text-xs font-bold text-white flex items-center justify-between">
                    <span>🏔️ Nepali Greetings</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-purple-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1 line-clamp-1">Namaste, polite phrases & pronunciation</p>
                </button>

                <button
                  onClick={() => handleSend('Translate common emergency hospital and pharmacy questions into Spanish')}
                  className="glass-card glass-card-hover p-3 rounded-xl border border-purple-500/25 text-left group"
                >
                  <div className="text-xs font-bold text-white flex items-center justify-between">
                    <span>🏥 Spanish Health Care</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-purple-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1 line-clamp-1">Emergency & pharmacy vocabulary</p>
                </button>

                <button
                  onClick={() => setShowGeotagModal(true)}
                  className="glass-card glass-card-hover p-3 rounded-xl border border-purple-500/25 text-left group"
                >
                  <div className="text-xs font-bold text-white flex items-center justify-between">
                    <span>📍 Geotagged Landmark</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-purple-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1 line-clamp-1">Pin GPS coordinates or world cities</p>
                </button>
              </div>
            </div>
          )}

          {/* Render Messages */}
          {displayedMessages.map((msg) => {
            const isUser = msg.role === 'user';
            const viewMode = translationViewModes[msg.id] || 'bilingual';

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-2 max-w-4xl mx-auto w-full`}
              >
                {/* Geotag Indicator Pill */}
                {msg.location && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-purple-950/70 border border-purple-500/40 text-[11px] text-purple-300 font-medium">
                    <MapPin className="w-3 h-3 text-purple-400" />
                    <span>{msg.location.name}</span>
                  </div>
                )}

                {/* Main Message Bubble */}
                <div
                  className={`w-full max-w-[92%] sm:max-w-[85%] rounded-2xl p-4 sm:p-5 relative space-y-3.5 shadow-xl transition-all ${
                    isUser
                      ? 'bg-gradient-to-r from-purple-700/85 via-purple-600/85 to-indigo-700/85 text-white rounded-tr-xs border border-purple-400/40 shadow-purple-900/30'
                      : 'glass-card text-gray-100 rounded-tl-xs border border-purple-500/30'
                  }`}
                >
                  {/* AI Model Header */}
                  {!isUser && (
                    <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg purple-glow-btn flex items-center justify-center text-white text-xs font-black shadow-sm">
                          ⚡
                        </div>
                        <span className="text-xs font-bold text-white tracking-wide flex items-center gap-1.5">
                          Aadesh AI
                          <span className="text-[10px] text-purple-300 bg-purple-950 px-1.5 py-0.2 rounded font-normal border border-purple-500/30">
                            Assistant
                          </span>
                        </span>
                      </div>

                      {/* View Mode Toggle Tabs (Original vs Translated vs Bilingual) */}
                      {msg.translation && (
                        <div className="flex items-center gap-1 bg-[#090a0f] p-0.5 rounded-lg border border-[#232738] text-[10px]">
                          <button
                            onClick={() =>
                              setTranslationViewModes((prev) => ({ ...prev, [msg.id]: 'bilingual' }))
                            }
                            className={`px-2 py-0.5 rounded font-medium transition-colors ${
                              viewMode === 'bilingual' ? 'bg-purple-900/60 text-purple-200' : 'text-gray-400 hover:text-white'
                            }`}
                          >
                            Split View
                          </button>
                          <button
                            onClick={() =>
                              setTranslationViewModes((prev) => ({ ...prev, [msg.id]: 'original' }))
                            }
                            className={`px-2 py-0.5 rounded font-medium transition-colors ${
                              viewMode === 'original' ? 'bg-purple-900/60 text-purple-200' : 'text-gray-400 hover:text-white'
                            }`}
                          >
                            Original
                          </button>
                          <button
                            onClick={() =>
                              setTranslationViewModes((prev) => ({ ...prev, [msg.id]: 'translated' }))
                            }
                            className={`px-2 py-0.5 rounded font-medium transition-colors ${
                              viewMode === 'translated' ? 'bg-purple-900/60 text-purple-200' : 'text-gray-400 hover:text-white'
                            }`}
                          >
                            Translated
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Attached Image Preview */}
                  {msg.imageUrl && (
                    <div className="rounded-xl overflow-hidden border border-white/10 max-h-72 max-w-md shadow-md">
                      <img
                        src={msg.imageUrl}
                        alt="Uploaded query"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {/* Content View: Depending on ViewMode */}
                  {(viewMode === 'bilingual' || viewMode === 'original' || isUser) && (
                    <div className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap text-gray-100">
                      {msg.content}
                    </div>
                  )}

                  {/* Real-Time Translation Card (For AI Model responses) */}
                  {!isUser && msg.translation && (viewMode === 'bilingual' || viewMode === 'translated') && (
                    <div className="pt-2 border-t border-purple-500/20 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-purple-300 font-semibold">
                        <span className="flex items-center gap-1.5">
                          <Languages className="w-3.5 h-3.5 text-purple-400" />
                          <span>{targetLangObj.name} Translation</span>
                        </span>
                        <span className="text-[10px] text-gray-400 font-normal">
                          Detected Source: {msg.detectedLanguage?.toUpperCase() || 'Auto'}
                        </span>
                      </div>
                      <div className="text-xs sm:text-sm text-purple-100 bg-[#090a0f]/75 p-3.5 rounded-xl border border-purple-500/25 leading-relaxed font-normal shadow-inner">
                        {msg.translation}
                      </div>
                    </div>
                  )}

                  {/* Geotag Cultural / Regional Insights */}
                  {!isUser && msg.geotagInsights && (
                    <div className="text-xs bg-indigo-950/40 border border-indigo-500/30 text-indigo-200 p-3 rounded-xl flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="block text-indigo-300 font-semibold mb-0.5">Regional Context:</strong>
                        <span>{msg.geotagInsights}</span>
                      </div>
                    </div>
                  )}

                  {/* Bubble Actions Toolbar */}
                  <div className="flex items-center justify-between pt-1 text-[11px] text-gray-400 border-t border-white/5">
                    <span className="text-[10px]">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {msg.isVoiceInput && ' • 🎙️ Voice'}
                      {msg.isOffline && ' • 💾 Local Engine'}
                    </span>

                    <div className="flex items-center space-x-2.5">
                      {/* Copy */}
                      <button
                        onClick={() => handleCopy(msg.id, msg.translation ? `${msg.content}\n\nTranslation: ${msg.translation}` : msg.content)}
                        className="hover:text-white transition-colors p-1"
                        title="Copy to clipboard"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* Text to Speech */}
                      <button
                        onClick={() =>
                          handleSpeakMessage(
                            msg.id,
                            msg.translation || msg.content,
                            targetLangObj.speechCode
                          )
                        }
                        className={`hover:text-purple-300 transition-colors p-1 ${
                          speakingId === msg.id ? 'text-purple-400 animate-pulse' : ''
                        }`}
                        title="Listen with AI Voice"
                      >
                        {speakingId === msg.id ? (
                          <VolumeX className="w-3.5 h-3.5 text-purple-400" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* INTERACTIVE 'SMART REPLY' BUTTONS ON MESSAGE */}
                {!isUser && msg.suggestedQuestions && msg.suggestedQuestions.length > 0 && (
                  <div className="space-y-1.5 pt-1 w-full max-w-[92%] sm:max-w-[85%]">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-purple-400 pl-1">
                      <Sparkles className="w-3 h-3 text-purple-400" />
                      <span>Smart Replies (1-Tap Follow-up)</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {msg.suggestedQuestions.map((q, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSend(q)}
                          className="smart-reply-chip text-xs text-purple-200 px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 group cursor-pointer"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 group-hover:scale-125 transition-transform" />
                          <span>{q}</span>
                          <ArrowUpRight className="w-3 h-3 text-purple-400/70 group-hover:text-purple-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* AI Response Loading Indicator */}
          {isLoading && (
            <div className="flex items-start max-w-4xl mx-auto w-full">
              <div className="glass-card rounded-2xl rounded-tl-xs p-4 border border-purple-500/30 flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-purple-300 font-medium animate-pulse">
                  Aadesh AI is translating and synthesizing response...
                </span>
              </div>
            </div>
          )}

          {/* Live Voice Interim Speech Bubble */}
          {isRecording && voiceInterimTranscript && (
            <div className="flex justify-end max-w-4xl mx-auto w-full">
              <div className="glass-card rounded-2xl rounded-tr-xs p-3.5 border border-purple-500/50 text-xs text-purple-200 italic flex items-center gap-2">
                <Mic className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                <span>"{voiceInterimTranscript}"</span>
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* ULTRA-BEAUTIFUL GLOWING INPUT DOCK CONTAINER */}
        <div className="absolute bottom-16 sm:bottom-18 left-0 right-0 px-3 sm:px-6 z-20 pointer-events-none">
          <div className="max-w-4xl mx-auto pointer-events-auto space-y-2">
            {/* Quick Context & Smart Reply strip above the input bar */}
            <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-none">
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1 pl-1">
                  <Sparkles className="w-3 h-3 text-purple-400" />
                  <span>Quick Prompts:</span>
                </span>
                {activeSmartReplies.slice(0, 3).map((reply, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(reply)}
                    className="text-[11px] bg-[#131520]/90 hover:bg-purple-900/40 text-purple-300 border border-purple-500/30 px-2.5 py-1 rounded-full whitespace-nowrap transition-all flex items-center gap-1 shadow-sm"
                  >
                    <span>{reply}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Attached context chip (if photo or geotag is selected) */}
            {(selectedImage || attachedLocation) && (
              <div className="glass-card rounded-xl p-2 px-3 flex items-center justify-between border border-purple-500/40 text-xs shadow-md">
                <div className="flex items-center gap-3">
                  {selectedImage && (
                    <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-purple-500/50">
                      <img src={selectedImage.base64} alt="Attached" className="w-full h-full object-cover" />
                      <button
                        onClick={() => setSelectedImage(null)}
                        className="absolute top-0 right-0 bg-red-600/90 text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-bl-sm"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {attachedLocation && (
                    <div className="flex items-center gap-1.5 text-purple-300 font-semibold">
                      <MapPin className="w-3.5 h-3.5 text-purple-400" />
                      <span>{attachedLocation.name}</span>
                      <button
                        onClick={() => setAttachedLocation(undefined)}
                        className="text-gray-400 hover:text-white text-xs ml-1"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>

                <span className="text-[10px] text-gray-400">Attached to upcoming query</span>
              </div>
            )}

            {/* Main Glowing Interactive Input Box */}
            <div className="glow-input-container">
              <div className="glow-input-inner p-2 sm:p-2.5 flex items-center gap-1.5 sm:gap-2">
                {isRecording ? (
                  /* VISUAL AUDIO-WAVE ANIMATION & STOP BUTTON OVERLAY */
                  <div className="flex-1 flex items-center justify-between gap-2 sm:gap-3 px-2 py-0.5 animate-in fade-in zoom-in-95 duration-150">
                    {/* Left: Pulsing Red Recording Indicator & Timer */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="w-3 h-3 rounded-full bg-red-500 recording-pulse shrink-0" />
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-red-300 flex items-center gap-1.5 leading-tight">
                          <span>Listening...</span>
                          <span className="text-[10px] text-gray-400 font-mono">
                            00:{recordingDuration < 10 ? `0${recordingDuration}` : recordingDuration}
                          </span>
                        </span>
                        <span className="text-[10px] text-purple-300/80 font-medium max-w-[120px] sm:max-w-xs truncate">
                          {voiceInterimTranscript ? `"${voiceInterimTranscript}"` : 'Speak now hands-free...'}
                        </span>
                      </div>
                    </div>

                    {/* Center: Dynamic Audio Waveform Bars */}
                    <div className="flex-1 flex items-center justify-center gap-1 sm:gap-1.5 h-8 px-2 overflow-hidden">
                      {[35, 75, 45, 90, 60, 100, 70, 85, 40, 95, 65, 80, 50, 90, 40, 70, 55, 30].map((h, i) => (
                        <span
                          key={i}
                          className="wave-bar"
                          style={{
                            animationDelay: `${(i % 6) * 0.12}s`,
                            animationDuration: `${0.85 + (i % 4) * 0.15}s`,
                            maxHeight: `${h}%`,
                          }}
                        />
                      ))}
                    </div>

                    {/* Right: Cancel & Stop Button Overlay */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => {
                          voiceAssistant.stopListening();
                          setIsRecording(false);
                          setVoiceInterimTranscript('');
                        }}
                        className="p-2 rounded-xl bg-gray-800/80 hover:bg-gray-700 text-gray-400 hover:text-white text-xs cursor-pointer transition-colors"
                        title="Cancel recording"
                      >
                        ✕
                      </button>

                      {/* Prominent Stop & Submit Button */}
                      <button
                        onClick={() => {
                          voiceAssistant.stopListening();
                          setIsRecording(false);
                          const finalSpeech = voiceInterimTranscript.trim() || inputText.trim();
                          if (finalSpeech) {
                            handleSend(finalSpeech, true);
                          }
                        }}
                        className="bg-gradient-to-r from-red-600 via-rose-600 to-red-500 hover:from-red-500 hover:to-rose-400 text-white font-bold py-2 px-3.5 rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-red-600/40 cursor-pointer transition-transform hover:scale-105 active:scale-95"
                        title="Stop recording and send message"
                      >
                        <Square className="w-3.5 h-3.5 fill-white text-white" />
                        <span>Stop</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Standard Input Layout */
                  <>
                    {/* Photo Upload Button */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handlePhotoSelect}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className={`p-2 sm:p-2.5 rounded-xl transition-all border cursor-pointer ${
                        selectedImage
                          ? 'bg-purple-900/70 text-purple-200 border-purple-400 shadow-sm'
                          : 'bg-[#181a29]/80 text-gray-400 border-white/5 hover:text-purple-300 hover:border-purple-500/40'
                      }`}
                      title="Upload Photo for Vision & Translation"
                    >
                      <ImageIcon className="w-4 h-4" />
                    </button>

                    {/* Geotag Location Pin Button */}
                    <button
                      onClick={() => setShowGeotagModal(true)}
                      className={`p-2 sm:p-2.5 rounded-xl transition-all border cursor-pointer ${
                        attachedLocation
                          ? 'bg-purple-900/70 text-purple-200 border-purple-400 shadow-sm'
                          : 'bg-[#181a29]/80 text-gray-400 border-white/5 hover:text-purple-300 hover:border-purple-500/40'
                      }`}
                      title="Attach Geotag Location"
                    >
                      <MapPin className="w-4 h-4" />
                    </button>

                    {/* Text Input */}
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Ask Aadesh AI in any language or attach photo..."
                      className="flex-1 bg-transparent text-gray-100 placeholder-gray-500 text-xs sm:text-sm px-2 outline-none font-medium"
                    />

                    {/* Hands-Free Voice Mic Button */}
                    <button
                      onClick={toggleVoiceRecording}
                      className="p-2 sm:p-2.5 rounded-xl transition-all relative cursor-pointer bg-[#181a29]/80 text-purple-400 border border-purple-500/25 hover:border-purple-500 hover:bg-purple-900/20"
                      title="Hands-Free Voice Input (Tap to speak)"
                    >
                      <Mic className="w-4 h-4" />
                    </button>

                    {/* Send Button */}
                    <button
                      onClick={() => handleSend()}
                      disabled={isLoading || (!inputText.trim() && !selectedImage)}
                      className="purple-glow-btn text-white font-semibold py-2 px-3.5 sm:py-2.5 sm:px-4 rounded-xl flex items-center justify-center gap-1.5 text-xs sm:text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                    >
                      <span className="hidden xs:inline">Send</span>
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Author Attribution Footer Tagline */}
            <div className="text-center text-[11px] text-gray-400 flex items-center justify-center gap-1.5 pt-1">
              <span>⚡ Aadesh AI</span>
              <span>•</span>
              <span className="text-purple-300 font-bold tracking-wide">AI Learning Platform</span>
              <span>•</span>
              <span className="text-gray-400 font-medium">Built by Aadesh Jaisi (आदेश जैसी)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Geotag Picker Modal */}
      <GeotagPickerModal
        isOpen={showGeotagModal}
        onClose={() => setShowGeotagModal(false)}
        onSelectLocation={(loc) => setAttachedLocation(loc)}
        currentSelected={attachedLocation}
      />

      {/* Export & Backup Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        session={currentSession}
      />

      {/* Toast Notification when backup is downloaded */}
      {exportToast && (
        <div className="fixed top-18 right-5 z-50 glass-card rounded-2xl p-3 px-4 border border-purple-500/60 text-white text-xs shadow-2xl flex items-center gap-2.5 animate-in slide-in-from-top-3 duration-200">
          <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400">
            <Check className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold text-gray-100">{exportToast}</span>
        </div>
      )}
    </div>
  );
};
