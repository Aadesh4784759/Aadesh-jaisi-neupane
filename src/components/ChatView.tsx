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
  Share2,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  Edit3,
  Pause,
  Play,
  AlertCircle,
  X,
  Paperclip,
  ThumbsUp,
  ThumbsDown,
  Search,
  Pin,
  PinOff,
  ChevronUp,
  Bot,
  SmilePlus,
  Maximize2,
  Clock,
  Calendar,
  Folder,
  FolderOpen,
  FolderPlus,
  Briefcase,
  User as UserIcon,
  GraduationCap,
  Tag,
} from 'lucide-react';
import { AppSettings, ChatMessage, ChatSession, LocationData, UserProfile } from '../types';
import { SUPPORTED_LANGUAGES, UI_TRANSLATIONS, VOICE_PERSONAS, isRtlLanguage } from '../data/languages';
import { GeotagPickerModal } from './GeotagPickerModal';
import { ExportModal, ExportFormat } from './ExportModal';
import { ImageLightbox, LightboxImageData } from './ImageLightbox';
import { MarkdownRenderer } from './MarkdownRenderer';
import { HighlightText } from './HighlightText';
import { voiceAssistant, VoicePlaybackState } from '../utils/speech';
import { generateThemeTokensFromColor } from '../utils/avatarTheme';
import { DEFAULT_SESSION_CATEGORIES } from '../utils/storage';

interface ChatViewProps {
  currentSession: ChatSession;
  allSessions: ChatSession[];
  sessionFolders?: string[];
  onSelectSession: (id: string) => void;
  onNewSession: (category?: string) => void;
  onUpdateSessionCategory?: (id: string, category: string) => void;
  onCreateFolder?: (folderName: string) => void;
  onDeleteSession: (id: string) => void;
  onClearCurrentSession: () => void;
  onSendMessage: (params: {
    text: string;
    imageData?: string;
    imageMimeType?: string;
    attachmentName?: string;
    attachmentContent?: string;
    location?: LocationData;
    isVoice?: boolean;
    targetLanguage: string;
  }) => Promise<void>;
  onUpdateSessionTargetLang: (lang: string) => void;
  onTranslateMessage?: (messageId: string, targetLangCode: string) => Promise<string>;
  onFeedbackMessage?: (messageId: string, feedback: 'up' | 'down') => void;
  onTogglePinMessage?: (messageId: string) => void;
  onReactMessage?: (messageId: string, emoji: string) => void;
  onRenameSession?: (id: string, newTitle: string) => void;
  user?: UserProfile;
  settings: AppSettings;
  isOnline: boolean;
  isLoading: boolean;
  searchFilter: string;
  onSearchChange?: (q: string) => void;
  isKeyboardOpen?: boolean;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮'] as const;
const EXTRA_REACTIONS = ['🔥', '👏'] as const;

const STOP_WORDS = new Set([
  'about', 'above', 'after', 'again', 'against', 'almost', 'alone', 'along', 'already', 'also',
  'although', 'always', 'among', 'another', 'around', 'because', 'before', 'being', 'below',
  'between', 'beyond', 'could', 'doing', 'during', 'either', 'enough', 'every', 'first', 'found',
  'further', 'having', 'hence', 'however', 'including', 'instead', 'into', 'itself', 'just',
  'later', 'likely', 'mainly', 'maybe', 'might', 'moreover', 'never', 'other', 'otherwise',
  'overall', 'quite', 'rather', 'really', 'should', 'since', 'something', 'sometimes', 'still',
  'such', 'thank', 'thanks', 'their', 'there', 'these', 'thing', 'things', 'think', 'those',
  'though', 'through', 'today', 'together', 'under', 'until', 'using', 'usually', 'very',
  'where', 'whether', 'which', 'while', 'within', 'without', 'would', 'your', 'yours',
]);

function extractRelatedTerms(text: string): string[] {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#*_~>\[\](){}"'.,!?;:/\\|+=<>-]/g, ' ');

  const counts = new Map<string, { word: string; score: number }>();
  const tokens = cleaned.split(/\s+/).filter(Boolean);

  for (const raw of tokens) {
    const lower = raw.toLowerCase();
    if (lower.length < 4 || /^\d+$/.test(lower) || STOP_WORDS.has(lower)) continue;
    const isProperOrTech = /^[A-Z]/.test(raw) || /[A-Z]{2,}/.test(raw);
    const boost = isProperOrTech ? 1.6 : 1;
    const prev = counts.get(lower);
    if (prev) {
      prev.score += boost;
    } else {
      counts.set(lower, {
        word: isProperOrTech ? raw : lower,
        score: boost + Math.min(raw.length, 12) * 0.08,
      });
    }
  }

  return Array.from(counts.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((entry) => entry.word);
}

export const ChatView: React.FC<ChatViewProps> = ({
  currentSession,
  allSessions,
  sessionFolders,
  onSelectSession,
  onNewSession,
  onUpdateSessionCategory,
  onCreateFolder,
  onDeleteSession,
  onClearCurrentSession,
  onSendMessage,
  onUpdateSessionTargetLang,
  onTranslateMessage,
  onFeedbackMessage,
  onTogglePinMessage,
  onReactMessage,
  onRenameSession,
  user,
  settings,
  isOnline,
  isLoading,
  searchFilter,
  onSearchChange,
  isKeyboardOpen = false,
}) => {
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<{ name: string; content: string } | null>(null);
  const [attachedLocation, setAttachedLocation] = useState<LocationData | undefined>(undefined);
  const [showGeotagModal, setShowGeotagModal] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const [voiceInterimTranscript, setVoiceInterimTranscript] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<VoicePlaybackState>(() => voiceAssistant.getPlaybackState());
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [translatingMsgId, setTranslatingMsgId] = useState<string | null>(null);
  const [sharePopoverMsgId, setSharePopoverMsgId] = useState<string | null>(null);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);
  const [sessionsSidebarOpen, setSessionsSidebarOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showInlineSearch, setShowInlineSearch] = useState(false);
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<LightboxImageData | null>(null);
  const [drawerSearchQuery, setDrawerSearchQuery] = useState<string>('');
  const [drawerDateFilter, setDrawerDateFilter] = useState<string>('');
  const [sessionSearchDropdownOpen, setSessionSearchDropdownOpen] = useState(false);
  const [langSwitcherOpen, setLangSwitcherOpen] = useState(false);
  const [langSearchQuery, setLangSearchQuery] = useState('');
  const [activeFolderFilter, setActiveFolderFilter] = useState<string>('All');
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderAssignSessionId, setFolderAssignSessionId] = useState<string | null>(null);
  const [quickContextMenu, setQuickContextMenu] = useState<{
    msgId: string;
    x: number;
    y: number;
    content: string;
    relatedTerms: string[];
  } | null>(null);
  const [messageSummary, setMessageSummary] = useState<{
    msgId: string;
    originalContent: string;
    summary: string;
    keyPoints: string[];
    isLoading: boolean;
    error?: string;
    modelUsed?: string;
    latencyMs?: number;
    copied?: boolean;
  } | null>(null);

  const userAvatarTokens = generateThemeTokensFromColor(user?.avatarColor);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const justTriggeredQuickContextRef = useRef<boolean>(false);
  const langSwitcherRef = useRef<HTMLDivElement>(null);
  const langSearchInputRef = useRef<HTMLInputElement>(null);
  const sessionSearchRef = useRef<HTMLDivElement>(null);

  // Close Quick Language Switcher, Session Search Dropdown, and Folder Assign popover on outside click / Escape
  useEffect(() => {
    if (!langSwitcherOpen && !folderAssignSessionId && !sessionSearchDropdownOpen) return;
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (langSwitcherOpen && langSwitcherRef.current && !langSwitcherRef.current.contains(target)) {
        setLangSwitcherOpen(false);
      }
      if (
        sessionSearchDropdownOpen &&
        sessionSearchRef.current &&
        !sessionSearchRef.current.contains(target)
      ) {
        setSessionSearchDropdownOpen(false);
      }
      if (folderAssignSessionId && !target?.closest('[data-folder-assign-menu="true"]')) {
        setFolderAssignSessionId(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLangSwitcherOpen(false);
        setSessionSearchDropdownOpen(false);
        setFolderAssignSessionId(null);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('touchstart', handleOutsideClick);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('touchstart', handleOutsideClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [langSwitcherOpen, folderAssignSessionId]);

  useEffect(() => {
    if (langSwitcherOpen) {
      setLangSearchQuery('');
      const timer = window.setTimeout(() => {
        langSearchInputRef.current?.focus();
      }, 40);
      return () => window.clearTimeout(timer);
    }
  }, [langSwitcherOpen]);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
  };

  useEffect(() => {
    if (!quickContextMenu) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setQuickContextMenu(null);
      }
    };
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-quick-context-menu="true"]')) return;
      setQuickContextMenu(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('touchstart', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('touchstart', handlePointerDown);
    };
  }, [quickContextMenu]);

  useEffect(() => {
    if (!messageSummary) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMessageSummary(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [messageSummary]);

  useEffect(() => {
    return () => clearLongPressTimer();
  }, []);

  const openQuickContextAt = (msg: ChatMessage, clientX: number, clientY: number) => {
    const terms = extractRelatedTerms(msg.content);
    const menuWidth = 248;
    const menuHeight = 250;
    const clampedX = Math.max(12, Math.min(window.innerWidth - menuWidth - 12, clientX - menuWidth / 2));
    const clampedY = Math.max(12, Math.min(window.innerHeight - menuHeight - 12, clientY - 24));
    justTriggeredQuickContextRef.current = true;
    window.setTimeout(() => {
      justTriggeredQuickContextRef.current = false;
    }, 600);
    setQuickContextMenu({
      msgId: msg.id,
      x: clampedX,
      y: clampedY,
      content: msg.content,
      relatedTerms: terms,
    });
  };

  const startQuickContextLongPress = (
    msg: ChatMessage,
    clientX: number,
    clientY: number,
    target: EventTarget | null
  ) => {
    if (msg.role !== 'model') return;
    const el = target as HTMLElement | null;
    if (el?.closest('button, a, select, input, textarea, label, [role="menu"]')) return;
    clearLongPressTimer();
    longPressOriginRef.current = { x: clientX, y: clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      openQuickContextAt(msg, clientX, clientY);
      longPressTimerRef.current = null;
      longPressOriginRef.current = null;
    }, 500);
  };

  const handleQuickContextMove = (clientX: number, clientY: number) => {
    if (!longPressOriginRef.current) return;
    const dx = Math.abs(clientX - longPressOriginRef.current.x);
    const dy = Math.abs(clientY - longPressOriginRef.current.y);
    if (dx > 12 || dy > 12) {
      clearLongPressTimer();
    }
  };

  const handleQuickContextCopy = () => {
    if (!quickContextMenu) return;
    navigator.clipboard.writeText(quickContextMenu.content);
    setExportToast('Copied AI response to clipboard!');
    setTimeout(() => setExportToast(null), 2200);
    setQuickContextMenu(null);
  };

  const summarizeMessageWithGemini = async (msgId: string, content: string) => {
    setMessageSummary({
      msgId,
      originalContent: content,
      summary: '',
      keyPoints: [],
      isLoading: true,
    });

    if (!isOnline) {
      const sentences = content
        .replace(/[#*_`>]/g, '')
        .split(/(?<=[.!?।])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const concise = sentences.slice(0, 2).join(' ') || content.slice(0, 220);
      setMessageSummary({
        msgId,
        originalContent: content,
        summary: `[Offline Local Summary] ${concise}`,
        keyPoints: sentences.slice(0, 3).map((s) => (s.length > 110 ? `${s.slice(0, 107)}...` : s)),
        isLoading: false,
        modelUsed: 'offline-local-summary',
      });
      return;
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (settings.customGeminiApiKey) {
        headers['x-gemini-api-key'] = settings.customGeminiApiKey;
      }

      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: content,
          targetLanguage: currentSession.targetLanguage,
          customApiKey: settings.customGeminiApiKey,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Summarization failed (${res.status})`);
      }

      setMessageSummary({
        msgId,
        originalContent: content,
        summary: data.summary || 'Summary generated.',
        keyPoints: Array.isArray(data.keyPoints) ? data.keyPoints : [],
        isLoading: false,
        modelUsed: data.modelUsed || 'gemini-4-hydrogen',
        latencyMs: data.latencyMs,
      });
    } catch (err: any) {
      setMessageSummary({
        msgId,
        originalContent: content,
        summary: '',
        keyPoints: [],
        isLoading: false,
        error: err?.message || 'Unable to generate summary with Gemini API right now.',
      });
    }
  };

  const handleQuickContextSummarize = async () => {
    if (!quickContextMenu) return;
    const { msgId, content } = quickContextMenu;
    setQuickContextMenu(null);
    await summarizeMessageWithGemini(msgId, content);
  };

  const handleQuickContextSearch = (term?: string) => {
    if (!quickContextMenu) return;
    const chosen =
      term ||
      quickContextMenu.relatedTerms[0] ||
      quickContextMenu.content.trim().split(/\s+/).slice(0, 2).join(' ');
    if (chosen) {
      onSearchChange?.(chosen);
      setDrawerSearchQuery(chosen);
      setShowInlineSearch(true);
      setExportToast(`Searching related term: "${chosen}"`);
      setTimeout(() => setExportToast(null), 2400);
    }
    setQuickContextMenu(null);
  };

  const formatBubbleTimestamp = (ts: number): string => {
    const date = new Date(ts);
    const now = new Date();
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isSameDay = date.toDateString() === now.toDateString();
    if (isSameDay) return `Today · ${timeStr}`;

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday · ${timeStr}`;
    }

    const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${dateStr} · ${timeStr}`;
  };

  // Sync live VoiceAssistant playback state (enables Voice Visualizer overlay from anywhere)
  useEffect(() => {
    const unsubscribe = voiceAssistant.subscribePlayback((state) => {
      setPlaybackState(state);
      if (!state.isSpeaking) {
        setSpeakingId(null);
      }
      if (state.lastError) {
        setVoiceError(state.lastError);
      }
    });
    return () => {
      unsubscribe();
      voiceAssistant.stopListening();
    };
  }, []);

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
  const docFileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const t = UI_TRANSLATIONS[settings.uiLanguage] || UI_TRANSLATIONS.en;
  const targetLangObj =
    SUPPORTED_LANGUAGES.find((l) => l.code === currentSession.targetLanguage) || SUPPORTED_LANGUAGES[1];

  // Auto-resize composer textarea on input changes
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(156, Math.max(40, el.scrollHeight))}px`;
  }, [inputText]);

  // Automatically scroll to the latest message whenever the current session's message array is updated
  useEffect(() => {
    if (searchFilter.trim()) return;
    const rafId = window.requestAnimationFrame(() => {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [currentSession.messages, isLoading, voiceInterimTranscript, searchFilter]);

  // Handle Photo selection & base64 conversion
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setVoiceError('Please upload an image file (PNG, JPG, WebP).');
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
    e.target.value = '';
  };

  // Handle text/code/data file attachment
  const handleDocumentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 160 * 1024) {
      setVoiceError('Attached text/code files must be 160 KB or smaller.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = String(event.target?.result || '');
      setSelectedFile({ name: file.name, content: text });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Voice Speech Recognition Trigger
  const toggleVoiceRecording = () => {
    setVoiceError(null);
    if (isRecording) {
      voiceAssistant.stopListening();
      setIsRecording(false);
      return;
    }

    if (isLoading) return;

    const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === settings.uiLanguage);
    const speechCode = currentLang?.speechCode || 'en-US';

    const started = voiceAssistant.startListening(speechCode, {
      onStart: () => {
        setIsRecording(true);
        setVoiceInterimTranscript('');
        setVoiceError(null);
      },
      onResult: (transcript, isFinal) => {
        setVoiceInterimTranscript(transcript);
        if (isFinal) {
          setIsRecording(false);
          if (settings.handsFreeMode && transcript.trim()) {
            handleSend(transcript.trim(), true);
          } else if (transcript.trim()) {
            setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
          }
        }
      },
      onError: (err) => {
        setVoiceError(err || 'Voice recognition encountered an issue.');
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
    if (isLoading) return;
    const textToSend = (customText !== undefined ? customText : inputText).trim();
    if (!textToSend && !selectedImage && !selectedFile) return;

    const payload = {
      text: textToSend,
      imageData: selectedImage?.base64,
      imageMimeType: selectedImage?.mimeType,
      attachmentName: selectedFile?.name,
      attachmentContent: selectedFile?.content,
      location: attachedLocation,
      isVoice: isVoice || isRecording,
      targetLanguage: currentSession.targetLanguage,
    };

    setInputText('');
    setSelectedImage(null);
    setSelectedFile(null);
    setAttachedLocation(undefined);
    setVoiceInterimTranscript('');

    await onSendMessage(payload);
  };

  // Resolve best BCP-47 speech code for a message based on explicit language or script
  const resolveMessageSpeechCode = (text: string, explicitLangCode?: string): string => {
    if (explicitLangCode) {
      const explicitObj = SUPPORTED_LANGUAGES.find((l) => l.code === explicitLangCode);
      if (explicitObj) return explicitObj.speechCode;
    }
    if (/[\u0900-\u097F]/.test(text)) {
      return settings.uiLanguage === 'hi' || currentSession.targetLanguage === 'hi' ? 'hi-IN' : 'ne-NP';
    }
    if (/[\u0600-\u06FF]/.test(text)) return 'ar-SA';
    if (/[\u4E00-\u9FFF]/.test(text)) return 'zh-CN';
    if (/[\u3040-\u30FF]/.test(text)) return 'ja-JP';
    if (/[\uAC00-\uD7AF]/.test(text)) return 'ko-KR';
    const uiObj = SUPPORTED_LANGUAGES.find((l) => l.code === settings.uiLanguage);
    return uiObj?.speechCode || 'en-US';
  };

  // Read message aloud with Web Speech API (respecting active voice persona, speed, pitch, and volume)
  const handleSpeakMessage = (msgId: string, text: string, langCode: string) => {
    if (!voiceAssistant.isSpeechSynthesisSupported()) {
      setVoiceError('Web Speech API Read Aloud is not supported in this browser.');
      return;
    }

    if (speakingId === msgId && playbackState.isSpeaking) {
      voiceAssistant.stopSpeaking();
      setSpeakingId(null);
      return;
    }

    setVoiceError(null);
    setSpeakingId(msgId);
    const activePersonaObj =
      VOICE_PERSONAS.find((p) => p.id === (settings.voicePersona || 'friendly')) || VOICE_PERSONAS[3];
    const configuredSpeed = Math.max(0.5, Math.min(2.0, settings.voiceSpeed ?? 1.0));
    voiceAssistant.configure({
      rate: configuredSpeed,
      pitch: Math.max(0.5, Math.min(2.0, settings.voicePitch ?? activePersonaObj.pitch)),
      volume: settings.voiceVolume ?? 1.0,
    });

    voiceAssistant.speak(text, langCode, {
      rate: configuredSpeed,
      pitch: Math.max(0.5, Math.min(2.0, settings.voicePitch ?? activePersonaObj.pitch)),
      volume: settings.voiceVolume ?? 1.0,
      onEnd: () => setSpeakingId(null),
      onError: () => setSpeakingId(null),
    });
  };

  // Translate an individual AI response card into any supported language
  const handleInlineTranslate = async (msgId: string, langCode: string) => {
    if (!onTranslateMessage || !langCode) return;
    setTranslatingMsgId(msgId);
    setVoiceError(null);
    try {
      await onTranslateMessage(msgId, langCode);
      setTranslationViewModes((prev) => ({ ...prev, [msgId]: 'bilingual' }));
    } catch (err: any) {
      setVoiceError(err?.message || 'Unable to translate this response right now.');
    } finally {
      setTranslatingMsgId(null);
    }
  };

  // Generate formatted share snippet for social sharing
  const getFormattedShareSnippet = (msg: ChatMessage) => {
    let snippet = `⚡ Aadesh AI Global Hub • Worldwide Multimodal Intelligence:\n\n"${msg.content}"`;
    if (msg.translation) {
      snippet += `\n\n🌐 Translation (${targetLangObj.name}):\n"${msg.translation}"`;
    }
    if (msg.location) {
      snippet += `\n\n📍 Geotagged: ${msg.location.name}`;
    }
    snippet += `\n\n#AadeshAIGlobalHub #UniversalAI #MultimodalAI #LearnWithAI`;
    return snippet;
  };

  const handleCopyShareSnippet = (msg: ChatMessage) => {
    const text = getFormattedShareSnippet(msg);
    navigator.clipboard.writeText(text);
    setExportToast('Copied formatted snippet for sharing!');
    setTimeout(() => setExportToast(null), 2500);
    setSharePopoverMsgId(null);
  };

  const handleNativeShare = async (msg: ChatMessage) => {
    const text = getFormattedShareSnippet(msg);
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Aadesh AI - AI Learning Platform',
          text,
          url: window.location.href,
        });
        setSharePopoverMsgId(null);
      } catch {
        // Fallback to copy if cancelled
      }
    } else {
      handleCopyShareSnippet(msg);
    }
  };

  // Copy text to clipboard
  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Regenerate response for a previous AI message
  const handleRegenerate = async (msgId: string) => {
    const msgIndex = currentSession.messages.findIndex((m) => m.id === msgId);
    const userMsg = currentSession.messages
      .slice(0, msgIndex >= 0 ? msgIndex : undefined)
      .reverse()
      .find((m) => m.role === 'user');

    if (!userMsg) return;
    await onSendMessage({
      text: userMsg.content,
      imageData: userMsg.imageUrl,
      location: userMsg.location,
      targetLanguage: currentSession.targetLanguage,
      isVoice: userMsg.isVoiceInput,
    });
  };

  // Save renamed session title
  const handleSaveRename = (sessionId: string) => {
    if (editingTitle.trim() && onRenameSession) {
      onRenameSession(sessionId, editingTitle.trim());
    }
    setEditingSessionId(null);
    setEditingTitle('');
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
        generator: 'Aadesh AI Global Hub - Worldwide Multimodal Intelligence',
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

  // Detect active geotagged conversation context from attached location or any message in session
  const activeConversationGeotagLocation =
    attachedLocation ||
    [...currentSession.messages].reverse().find((m) => Boolean(m.location))?.location;
  const isGeotaggedConversation = Boolean(
    activeConversationGeotagLocation ||
      currentSession.messages.some((m) => Boolean(m.location || m.geotagInsights))
  );

  // Filter messages if searchFilter is applied
  const trimmedSearch = searchFilter.trim();
  const normalizedSearch = trimmedSearch.toLowerCase();

  const displayedMessages = normalizedSearch
    ? currentSession.messages.filter(
        (m) =>
          m.content.toLowerCase().includes(normalizedSearch) ||
          (m.translation && m.translation.toLowerCase().includes(normalizedSearch)) ||
          (m.location?.name && m.location.name.toLowerCase().includes(normalizedSearch)) ||
          (m.attachmentName && m.attachmentName.toLowerCase().includes(normalizedSearch)) ||
          (m.geotagInsights && m.geotagInsights.toLowerCase().includes(normalizedSearch))
      )
    : currentSession.messages;

  const pinnedMessages = currentSession.messages
    .filter((m) => m.isPinned)
    .sort((a, b) => (a.pinnedAt || a.timestamp) - (b.pinnedAt || b.timestamp));

  // Full-text & date search across all past conversations in the session drawer
  const toLocalDateKey = (ts: number): string => {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const getDateSearchTokens = (ts: number): string => {
    const d = new Date(ts);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const rel =
      d.toDateString() === now.toDateString()
        ? 'today'
        : d.toDateString() === yesterday.toDateString()
        ? 'yesterday'
        : '';
    return [
      toLocalDateKey(ts),
      d.toISOString().slice(0, 10),
      d.toLocaleDateString(),
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      rel,
    ]
      .join(' ')
      .toLowerCase();
  };

  const trimmedDrawerQuery = drawerSearchQuery.trim();
  const normalizedDrawerQuery = trimmedDrawerQuery.toLowerCase();
  const drawerQueryKeywords = normalizedDrawerQuery.split(/\s+/).filter(Boolean);

  const filteredSessions = allSessions
    .map((session) => {
      const matchesDate =
        !drawerDateFilter ||
        toLocalDateKey(session.createdAt) === drawerDateFilter ||
        toLocalDateKey(session.updatedAt) === drawerDateFilter ||
        session.messages.some((m) => toLocalDateKey(m.timestamp) === drawerDateFilter);

      if (!matchesDate) return null;

      if (!normalizedDrawerQuery) {
        return { session, matchCount: 0, snippet: '' };
      }

      const titleLower = session.title.toLowerCase();
      const titleMatch =
        titleLower.includes(normalizedDrawerQuery) ||
        drawerQueryKeywords.every((kw) => titleLower.includes(kw));
      const sessionDateMatch =
        getDateSearchTokens(session.createdAt).includes(normalizedDrawerQuery) ||
        getDateSearchTokens(session.updatedAt).includes(normalizedDrawerQuery);

      const messageHaystacks = session.messages.map((m) => ({
        msg: m,
        haystack: [
          m.content,
          m.translation || '',
          m.senderName || '',
          m.attachmentName || '',
          m.location?.name || '',
          m.geotagInsights || '',
          getDateSearchTokens(m.timestamp),
        ]
          .join(' ')
          .toLowerCase(),
      }));

      const matchingMessages = messageHaystacks
        .filter(({ haystack }) =>
          drawerQueryKeywords.length > 1
            ? haystack.includes(normalizedDrawerQuery) ||
              drawerQueryKeywords.every((kw) => haystack.includes(kw))
            : haystack.includes(normalizedDrawerQuery)
        )
        .map(({ msg }) => msg);

      const combinedSessionHaystack = [
        titleLower,
        getDateSearchTokens(session.createdAt),
        getDateSearchTokens(session.updatedAt),
        ...messageHaystacks.map((entry) => entry.haystack),
      ].join(' ');

      const allKeywordsPresentAcrossSession = drawerQueryKeywords.every((kw) =>
        combinedSessionHaystack.includes(kw)
      );

      if (
        !titleMatch &&
        !sessionDateMatch &&
        matchingMessages.length === 0 &&
        !allKeywordsPresentAcrossSession
      ) {
        return null;
      }

      const fallbackMatchedMsg =
        matchingMessages[0] ||
        messageHaystacks.find(({ haystack }) =>
          drawerQueryKeywords.some((kw) => haystack.includes(kw))
        )?.msg;
      const snippet = fallbackMatchedMsg
        ? fallbackMatchedMsg.content.replace(/\s+/g, ' ').trim().slice(0, 72)
        : '';

      return {
        session,
        matchCount:
          matchingMessages.length > 0
            ? matchingMessages.length
            : allKeywordsPresentAcrossSession && !titleMatch
            ? 1
            : 0,
        snippet,
      };
    })
    .filter((entry): entry is { session: ChatSession; matchCount: number; snippet: string } => entry !== null);

  const scrollToPinnedMessage = (msgId: string) => {
    const el = document.getElementById(`chat-msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(msgId);
      setTimeout(() => {
        setHighlightedMsgId((prev) => (prev === msgId ? null : prev));
      }, 2000);
    }
  };

  const availableFolders = Array.from(
    new Set([
      ...(sessionFolders && sessionFolders.length > 0 ? sessionFolders : DEFAULT_SESSION_CATEGORIES),
      ...allSessions.map((s) => (s.category || 'General').trim()).filter(Boolean),
    ])
  );

  const folderSessionCounts = availableFolders.reduce<Record<string, number>>((acc, folder) => {
    acc[folder] = allSessions.filter((s) => (s.category || 'General') === folder).length;
    return acc;
  }, {});

  const folderFilteredSessions =
    activeFolderFilter === 'All'
      ? filteredSessions
      : filteredSessions.filter(({ session: s }) => (s.category || 'General') === activeFolderFilter);

  const getFolderMeta = (folderName: string) => {
    const key = folderName.toLowerCase();
    if (key === 'work') {
      return {
        icon: <Briefcase className="w-3 h-3 text-sky-400 shrink-0" />,
        badgeClass: 'bg-sky-950/60 text-sky-300 border-sky-500/35',
        dotClass: 'bg-sky-400',
      };
    }
    if (key === 'personal') {
      return {
        icon: <UserIcon className="w-3 h-3 text-emerald-400 shrink-0" />,
        badgeClass: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/35',
        dotClass: 'bg-emerald-400',
      };
    }
    if (key === 'language practice') {
      return {
        icon: <Languages className="w-3 h-3 text-amber-400 shrink-0" />,
        badgeClass: 'bg-amber-950/60 text-amber-300 border-amber-500/35',
        dotClass: 'bg-amber-400',
      };
    }
    if (key === 'study & code') {
      return {
        icon: <GraduationCap className="w-3 h-3 text-indigo-400 shrink-0" />,
        badgeClass: 'bg-indigo-950/60 text-indigo-300 border-indigo-500/35',
        dotClass: 'bg-indigo-400',
      };
    }
    if (key === 'general') {
      return {
        icon: <Folder className="w-3 h-3 text-purple-400 shrink-0" />,
        badgeClass: 'bg-purple-950/60 text-purple-300 border-purple-500/35',
        dotClass: 'bg-purple-400',
      };
    }
    return {
      icon: <Tag className="w-3 h-3 text-pink-400 shrink-0" />,
      badgeClass: 'bg-pink-950/60 text-pink-300 border-pink-500/35',
      dotClass: 'bg-pink-400',
    };
  };

  const handleSubmitNewFolder = (e?: React.FormEvent) => {
    e?.preventDefault();
    const clean = newFolderName.trim().slice(0, 48);
    if (!clean) return;
    onCreateFolder?.(clean);
    setActiveFolderFilter(clean);
    setNewFolderName('');
    setIsCreatingFolder(false);
    setExportToast(`Created folder "${clean}"`);
    setTimeout(() => setExportToast(null), 2200);
  };

  const handleQuickAssignFolder = (sessionId: string, folder: string) => {
    onUpdateSessionCategory?.(sessionId, folder);
    setFolderAssignSessionId(null);
    setExportToast(`Moved chat to "${folder}"`);
    setTimeout(() => setExportToast(null), 2000);
  };

  const quickSwitcherFilteredLangs = SUPPORTED_LANGUAGES.filter((lang) => {
    const q = langSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      lang.name.toLowerCase().includes(q) ||
      lang.nativeName.toLowerCase().includes(q) ||
      lang.code.toLowerCase().includes(q) ||
      lang.region.toLowerCase().includes(q)
    );
  });

  const handleQuickSelectLanguage = (langCode: string) => {
    onUpdateSessionTargetLang(langCode);
    setLangSwitcherOpen(false);
    const chosen = SUPPORTED_LANGUAGES.find((l) => l.code === langCode);
    if (chosen) {
      setExportToast(`Target language switched to ${chosen.flag} ${chosen.name}`);
      setTimeout(() => setExportToast(null), 2200);
    }
  };

  const renderSessionRow = ({
    session: s,
    matchCount,
    snippet,
  }: {
    session: ChatSession;
    matchCount: number;
    snippet: string;
  }) => {
    const isSelected = s.id === currentSession.id;
    const sessionCategory = s.category || 'General';
    const folderMeta = getFolderMeta(sessionCategory);
    const isAssignOpen = folderAssignSessionId === s.id;

    return (
      <div
        key={s.id}
        onClick={() => {
          onSelectSession(s.id);
          if (trimmedDrawerQuery && matchCount > 0 && onSearchChange) {
            onSearchChange(trimmedDrawerQuery);
          }
          setSessionsSidebarOpen(false);
        }}
        className={`group relative p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
          isSelected
            ? 'bg-purple-900/35 border-purple-500/50 text-white shadow-md'
            : 'bg-[#131520]/70 border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5'
        }`}
      >
        <div className="min-w-0 flex-grow pr-2">
          {editingSessionId === s.id ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                autoFocus
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveRename(s.id);
                  if (e.key === 'Escape') setEditingSessionId(null);
                }}
                className="bg-[#090a0f] border border-purple-400 rounded px-1.5 py-0.5 text-xs text-white w-full outline-none"
              />
              <button
                onClick={() => handleSaveRename(s.id)}
                className="text-xs bg-purple-600 text-white px-1.5 py-0.5 rounded cursor-pointer"
              >
                ✓
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-xs font-semibold truncate text-white flex-1">
                  <HighlightText text={s.title} query={trimmedDrawerQuery || trimmedSearch} />
                </p>
              </div>
              <p className="text-[10px] text-gray-500 flex items-center flex-wrap gap-1 mt-0.5">
                <button
                  type="button"
                  data-folder-assign-menu="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFolderAssignSessionId(isAssignOpen ? null : s.id);
                  }}
                  title="Change conversation folder"
                  className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded border text-[9px] font-semibold cursor-pointer hover:brightness-125 ${folderMeta.badgeClass}`}
                >
                  {folderMeta.icon}
                  <span className="truncate max-w-[82px]">{sessionCategory}</span>
                </button>
                <span>•</span>
                <span>{new Date(s.updatedAt).toLocaleDateString()}</span>
                <span>•</span>
                <span>{s.messages.length} msgs</span>
                {matchCount > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-amber-300 font-semibold">
                      {matchCount} {matchCount === 1 ? 'hit' : 'hits'}
                    </span>
                  </>
                )}
              </p>
              {snippet && (
                <p className="text-[10px] text-purple-200/80 truncate mt-1 bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-500/20">
                  <HighlightText text={snippet} query={trimmedDrawerQuery} />
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
          {onUpdateSessionCategory && (
            <button
              type="button"
              data-folder-assign-menu="true"
              onClick={(e) => {
                e.stopPropagation();
                setFolderAssignSessionId(isAssignOpen ? null : s.id);
              }}
              className="p-1 hover:text-emerald-300 text-gray-500 transition-colors cursor-pointer"
              title="Move to Folder"
              aria-label="Move conversation to folder"
            >
              <Folder className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditingSessionId(s.id);
              setEditingTitle(s.title);
            }}
            className="p-1 hover:text-amber-300 text-gray-500 transition-colors cursor-pointer"
            title="Rename Conversation"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
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

        {/* Inline Folder Reassignment Menu */}
        {isAssignOpen && (
          <div
            data-folder-assign-menu="true"
            onClick={(e) => e.stopPropagation()}
            className="absolute right-2 top-full mt-1 w-48 glass-card rounded-xl border border-purple-500/45 shadow-2xl p-1.5 z-50 space-y-0.5"
          >
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-white/10">
              Move to Folder
            </div>
            {availableFolders.map((folder) => {
              const meta = getFolderMeta(folder);
              const isCurrent = sessionCategory === folder;
              return (
                <button
                  key={`${s.id}-move-${folder}`}
                  type="button"
                  onClick={() => handleQuickAssignFolder(s.id, folder)}
                  className={`w-full px-2 py-1.5 rounded-lg text-left text-xs flex items-center justify-between transition-colors cursor-pointer ${
                    isCurrent
                      ? 'bg-purple-600/35 text-white font-bold'
                      : 'text-gray-200 hover:bg-white/10'
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    {meta.icon}
                    <span className="truncate">{folder}</span>
                  </span>
                  {isCurrent && <Check className="w-3 h-3 text-purple-300 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 flex relative w-full overflow-hidden">
      {/* SESSIONS SIDEBAR (Desktop & Mobile Drawer) */}
      <div
        className={`fixed inset-y-0 left-0 z-50 md:z-20 w-72 max-w-[85vw] safe-top safe-bottom glass-nav border-r border-[#232738] p-4 flex flex-col justify-between transform transition-all duration-300 md:relative ${
          sessionsSidebarOpen
            ? 'translate-x-0 md:w-72 md:opacity-100'
            : '-translate-x-full md:w-0 md:p-0 md:opacity-0 md:overflow-hidden md:border-none'
        }`}
      >
        <div className="space-y-3 flex-grow overflow-hidden flex flex-col">
          {/* Top Actions */}
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              <span>Conversation Logs</span>
            </h3>
            <div className="flex items-center gap-1">
              {onCreateFolder && (
                <button
                  type="button"
                  onClick={() => setIsCreatingFolder((prev) => !prev)}
                  className={`text-xs px-2 py-1 rounded-lg border flex items-center gap-1 transition-all cursor-pointer ${
                    isCreatingFolder
                      ? 'bg-emerald-950/60 border-emerald-400/50 text-emerald-200'
                      : 'bg-[#131520] hover:bg-white/10 border-[#232738] text-gray-300 hover:text-white'
                  }`}
                  title="Create New Conversation Folder"
                  aria-label="Create new folder"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => onNewSession(activeFolderFilter !== 'All' ? activeFolderFilter : undefined)}
                className="text-xs bg-purple-900/40 hover:bg-purple-900/80 border border-purple-500/40 text-purple-200 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                title={
                  activeFolderFilter !== 'All'
                    ? `New Chat in ${activeFolderFilter}`
                    : 'New Chat Session'
                }
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New</span>
              </button>
            </div>
          </div>

          {/* Inline Create Custom Folder Input */}
          {isCreatingFolder && (
            <form onSubmit={handleSubmitNewFolder} className="flex items-center gap-1.5 bg-[#090a0f] p-1.5 rounded-xl border border-emerald-500/40">
              <input
                type="text"
                autoFocus
                maxLength={36}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name (e.g. Research)"
                aria-label="New folder name"
                className="flex-1 min-w-0 bg-transparent text-xs text-white placeholder-gray-500 px-1.5 py-1 outline-none"
              />
              <button
                type="submit"
                disabled={!newFolderName.trim()}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-[11px] font-bold cursor-pointer shrink-0"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreatingFolder(false);
                  setNewFolderName('');
                }}
                className="p-1 text-gray-400 hover:text-white cursor-pointer"
                aria-label="Cancel folder creation"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </form>
          )}

          {/* Category / Folder Filter Bar */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
              <button
                type="button"
                onClick={() => setActiveFolderFilter('All')}
                className={`px-2 py-1 rounded-lg border text-[10px] font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                  activeFolderFilter === 'All'
                    ? 'bg-purple-600/40 border-purple-400/70 text-white shadow-sm'
                    : 'bg-[#090a0f]/80 border-[#232738] text-gray-400 hover:text-white'
                }`}
              >
                <span>All</span>
                <span className="opacity-75">({allSessions.length})</span>
              </button>

              {availableFolders.map((folder) => {
                const count = folderSessionCounts[folder] || 0;
                const isSelected = activeFolderFilter === folder;
                const meta = getFolderMeta(folder);
                return (
                  <button
                    key={`tab-${folder}`}
                    type="button"
                    onClick={() => setActiveFolderFilter(folder)}
                    className={`px-2 py-1 rounded-lg border text-[10px] font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                      isSelected
                        ? 'bg-purple-600/35 border-purple-400/70 text-white shadow-sm'
                        : 'bg-[#090a0f]/80 border-[#232738] text-gray-400 hover:text-white'
                    }`}
                  >
                    {meta.icon}
                    <span>{folder}</span>
                    <span className="opacity-70">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Full-Text & Date Session Drawer Search Bar */}
          <div className="space-y-1.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-purple-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={drawerSearchQuery}
                onChange={(e) => setDrawerSearchQuery(e.target.value)}
                placeholder="Search sessions by title or content..."
                aria-label="Search conversation sessions by title or content keywords"
                className="w-full bg-[#090a0f]/90 border border-[#232738] focus:border-purple-500 rounded-xl pl-8 pr-7 py-1.5 text-xs text-gray-200 placeholder-gray-500 outline-none"
              />
              {drawerSearchQuery && (
                <button
                  type="button"
                  onClick={() => setDrawerSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white cursor-pointer"
                  aria-label="Clear session keyword search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <div className="relative flex-1 flex items-center bg-[#090a0f]/75 border border-[#232738] focus-within:border-purple-500 rounded-xl px-2 py-1 text-[11px] text-gray-300">
                <Calendar className="w-3 h-3 text-purple-400 mr-1.5 shrink-0" />
                <input
                  type="date"
                  value={drawerDateFilter}
                  onChange={(e) => setDrawerDateFilter(e.target.value)}
                  aria-label="Filter conversations by date"
                  className="bg-transparent text-[11px] text-gray-200 outline-none w-full cursor-pointer [color-scheme:dark]"
                />
              </div>
              {(drawerSearchQuery || drawerDateFilter || activeFolderFilter !== 'All') && (
                <button
                  type="button"
                  onClick={() => {
                    setDrawerSearchQuery('');
                    setDrawerDateFilter('');
                    setActiveFolderFilter('All');
                  }}
                  className="px-2 py-1 rounded-xl bg-purple-950/60 hover:bg-purple-900/70 border border-purple-500/30 text-[10px] font-semibold text-purple-200 cursor-pointer shrink-0"
                >
                  Reset
                </button>
              )}
            </div>

            {(drawerSearchQuery || drawerDateFilter || activeFolderFilter !== 'All') && (
              <div className="text-[10px] text-purple-300 px-1 flex items-center justify-between">
                <span>
                  {folderFilteredSessions.length} of {allSessions.length}{' '}
                  {allSessions.length === 1 ? 'conversation' : 'conversations'} shown
                </span>
              </div>
            )}
          </div>

          {/* Session List (Grouped by Collapsible Folder when All selected & no search, or Direct Filtered List) */}
          <div className="overflow-y-auto space-y-2 flex-grow pr-1">
            {folderFilteredSessions.length === 0 && (
              <div className="p-4 rounded-xl bg-[#131520]/80 border border-purple-500/20 text-center space-y-2">
                <p className="text-xs text-gray-300 font-medium">
                  {activeFolderFilter !== 'All' && !drawerSearchQuery && !drawerDateFilter
                    ? `No conversations in "${activeFolderFilter}" yet.`
                    : 'No past conversations match your filter.'}
                </p>
                <div className="flex items-center justify-center gap-3">
                  {activeFolderFilter !== 'All' && (
                    <button
                      type="button"
                      onClick={() => onNewSession(activeFolderFilter)}
                      className="text-[11px] text-emerald-300 hover:text-white font-semibold underline cursor-pointer"
                    >
                      + Start chat here
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerSearchQuery('');
                      setDrawerDateFilter('');
                      setActiveFolderFilter('All');
                    }}
                    className="text-[11px] text-purple-300 hover:text-white underline cursor-pointer"
                  >
                    Show all
                  </button>
                </div>
              </div>
            )}

            {activeFolderFilter === 'All' && !trimmedDrawerQuery && !drawerDateFilter ? (
              availableFolders.map((folder) => {
                const items = folderFilteredSessions.filter(
                  ({ session: s }) => (s.category || 'General') === folder
                );
                const isCustomEmpty =
                  items.length === 0 && !DEFAULT_SESSION_CATEGORIES.includes(folder);
                if (items.length === 0 && !isCustomEmpty) return null;

                const isCollapsed = Boolean(collapsedFolders[folder]);
                const meta = getFolderMeta(folder);

                return (
                  <div key={`group-${folder}`} className="space-y-1">
                    <div className="flex items-center justify-between px-1.5 py-1 rounded-lg bg-[#0d0f1a]/80 border border-white/5">
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedFolders((prev) => ({ ...prev, [folder]: !prev[folder] }))
                        }
                        className="flex items-center gap-1.5 text-[11px] font-bold text-gray-200 hover:text-white cursor-pointer min-w-0 flex-1 text-left"
                      >
                        {isCollapsed ? (
                          <Folder className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        ) : (
                          <FolderOpen className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                        )}
                        <span className="truncate">{folder}</span>
                        <span className={`px-1.5 py-0.2 rounded text-[9px] border ${meta.badgeClass}`}>
                          {items.length}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onNewSession(folder)}
                        className="p-0.5 text-gray-400 hover:text-purple-200 cursor-pointer"
                        title={`New chat in ${folder}`}
                        aria-label={`Create new chat in ${folder}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {!isCollapsed && (
                      <div className="space-y-1.5 pl-1">
                        {items.length === 0 ? (
                          <div className="px-2.5 py-2 rounded-lg border border-dashed border-white/10 text-[10px] text-gray-500 flex items-center justify-between">
                            <span>Empty folder</span>
                            <button
                              type="button"
                              onClick={() => onNewSession(folder)}
                              className="text-purple-300 hover:text-white font-semibold cursor-pointer"
                            >
                              + Add Chat
                            </button>
                          </div>
                        ) : (
                          items.map((entry) => renderSessionRow(entry))
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              folderFilteredSessions.map((entry) => renderSessionRow(entry))
            )}
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
          className="fixed inset-0 bg-black/65 z-40 md:hidden backdrop-blur-xs"
        />
      )}

      {/* MAIN CHAT STREAM CONTAINER */}
      <div className="flex-1 min-w-0 flex flex-col h-full min-h-0 bg-transparent overflow-hidden relative">
        {/* Session Sub-Header Controls */}
        <div className="glass-nav px-3 sm:px-4 py-2 border-b border-[#232738] flex items-center justify-between gap-2 z-20">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setSessionsSidebarOpen(!sessionsSidebarOpen)}
              className="p-1.5 rounded-lg bg-[#131520] hover:bg-purple-900/40 border border-[#232738] text-gray-300 hover:text-white transition-colors cursor-pointer shrink-0"
              title={sessionsSidebarOpen ? 'Hide conversation history' : 'Show conversation history'}
            >
              <Layers className="w-4 h-4 text-purple-400" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <h2 className="text-xs sm:text-sm font-bold text-white truncate max-w-[130px] sm:max-w-[230px]">
                {currentSession.title}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setActiveFolderFilter(currentSession.category || 'General');
                  setSessionsSidebarOpen(true);
                }}
                title="Open conversation folders"
                className={`hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-semibold cursor-pointer shrink-0 hover:brightness-125 ${
                  getFolderMeta(currentSession.category || 'General').badgeClass
                }`}
              >
                {getFolderMeta(currentSession.category || 'General').icon}
                <span>{currentSession.category || 'General'}</span>
              </button>
              {isGeotaggedConversation && (
                <span
                  title={
                    activeConversationGeotagLocation?.name
                      ? `Active geotagged conversation context: ${activeConversationGeotagLocation.name}`
                      : 'Active geotagged conversation context'
                  }
                  className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-emerald-400/45 bg-emerald-950/60 text-emerald-200 text-[10px] font-bold uppercase tracking-wider shrink-0"
                >
                  <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>Context</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
            {/* Inline Conversation Session Search Bar (Filters existing sessions by title or content keywords) */}
            <div className="relative hidden md:block" ref={sessionSearchRef}>
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-purple-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={drawerSearchQuery}
                  onFocus={() => setSessionSearchDropdownOpen(true)}
                  onChange={(e) => {
                    setDrawerSearchQuery(e.target.value);
                    setSessionSearchDropdownOpen(true);
                  }}
                  placeholder="Search sessions by title or content..."
                  aria-label="Filter existing sessions by title or content keywords"
                  className="w-48 lg:w-60 bg-[#131520] border border-[#232738] focus:border-purple-500 rounded-xl pl-8 pr-7 py-1 text-xs text-gray-200 placeholder-gray-500 outline-none transition-all"
                />
                {drawerSearchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerSearchQuery('');
                      setSessionSearchDropdownOpen(false);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white cursor-pointer"
                    aria-label="Clear session search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {sessionSearchDropdownOpen && trimmedDrawerQuery && (
                <div
                  role="listbox"
                  aria-label="Matching conversation sessions"
                  className="absolute right-0 mt-2 w-80 max-w-[90vw] glass-card rounded-2xl border border-purple-500/45 shadow-2xl p-2 z-50 space-y-1.5"
                >
                  <div className="flex items-center justify-between px-2 py-1 border-b border-white/10 text-[10px] font-bold uppercase tracking-wider text-purple-300">
                    <span>Matching Sessions ({filteredSessions.length})</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSessionsSidebarOpen(true);
                        setSessionSearchDropdownOpen(false);
                      }}
                      className="text-gray-400 hover:text-white normal-case font-semibold cursor-pointer"
                    >
                      Open Logs
                    </button>
                  </div>

                  {filteredSessions.length === 0 ? (
                    <div className="py-4 px-3 text-center text-xs text-gray-400">
                      No sessions match "{trimmedDrawerQuery}"
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto space-y-1 pr-0.5">
                      {filteredSessions.slice(0, 8).map(({ session: s, matchCount, snippet }) => (
                        <button
                          key={`quick-session-${s.id}`}
                          type="button"
                          onClick={() => {
                            onSelectSession(s.id);
                            if (matchCount > 0 && onSearchChange) {
                              onSearchChange(trimmedDrawerQuery);
                            }
                            setSessionSearchDropdownOpen(false);
                          }}
                          className={`w-full text-left p-2 rounded-xl border transition-colors cursor-pointer space-y-0.5 ${
                            s.id === currentSession.id
                              ? 'bg-purple-900/45 border-purple-400/50 text-white'
                              : 'bg-[#131520]/80 hover:bg-white/10 border-white/5 text-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold truncate">
                              <HighlightText text={s.title} query={trimmedDrawerQuery} />
                            </span>
                            {matchCount > 0 && (
                              <span className="text-[10px] text-amber-300 font-semibold shrink-0">
                                {matchCount} {matchCount === 1 ? 'hit' : 'hits'}
                              </span>
                            )}
                          </div>
                          {snippet && (
                            <p className="text-[10px] text-purple-200/80 truncate">
                              <HighlightText text={snippet} query={trimmedDrawerQuery} />
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {onSearchChange && (
              <button
                type="button"
                onClick={() => setShowInlineSearch((prev) => !prev)}
                className={`md:hidden p-1.5 rounded-xl border transition-colors cursor-pointer ${
                  showInlineSearch || trimmedSearch || trimmedDrawerQuery
                    ? 'bg-amber-950/60 border-amber-500/50 text-amber-300'
                    : 'bg-[#131520] border-[#232738] text-gray-300 hover:text-white'
                }`}
                title="Search sessions and messages"
                aria-label="Toggle session and message search"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Quick Language Switcher Dropdown */}
            <div className="relative" ref={langSwitcherRef}>
              <button
                type="button"
                onClick={() => {
                  setLangSwitcherOpen((prev) => !prev);
                  setExportDropdownOpen(false);
                }}
                aria-haspopup="listbox"
                aria-expanded={langSwitcherOpen}
                aria-label="Quick Language Switcher"
                title="Quick Language Switcher: change active session target language"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs transition-all cursor-pointer shadow-sm ${
                  langSwitcherOpen
                    ? 'bg-purple-900/50 border-purple-400/70 text-white'
                    : 'bg-[#131520] hover:bg-purple-900/30 border-[#232738] hover:border-purple-500/40 text-purple-200'
                }`}
              >
                <Languages className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="text-[11px] text-gray-400 hidden lg:inline">Target:</span>
                <span className="text-sm leading-none">{targetLangObj.flag}</span>
                <span className="font-semibold text-xs truncate max-w-[82px] sm:max-w-[125px]">
                  {targetLangObj.name}
                </span>
                <ChevronDown
                  className={`w-3 h-3 text-gray-400 transition-transform duration-150 ${
                    langSwitcherOpen ? 'rotate-180 text-purple-300' : ''
                  }`}
                />
              </button>

              {langSwitcherOpen && (
                <div
                  role="listbox"
                  aria-label="Select active session target language"
                  className="absolute right-0 mt-2 w-72 sm:w-80 glass-card rounded-2xl border border-purple-500/45 shadow-2xl p-2.5 z-50 animate-in fade-in zoom-in-95 duration-150 space-y-2"
                >
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                      <Globe2 className="w-3.5 h-3.5 text-purple-400" />
                      <span>Quick Language Switcher</span>
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono uppercase">
                      {targetLangObj.code}
                    </span>
                  </div>

                  {/* Filter Input */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={langSearchInputRef}
                      type="text"
                      value={langSearchQuery}
                      onChange={(e) => setLangSearchQuery(e.target.value)}
                      placeholder="Filter language (Nepali, Spanish, ja...)"
                      aria-label="Filter target languages"
                      className="w-full bg-[#090a0f] border border-[#232738] focus:border-purple-500 rounded-xl pl-8 pr-7 py-1.5 text-xs text-white placeholder-gray-500 outline-none"
                    />
                    {langSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setLangSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white cursor-pointer"
                        aria-label="Clear language search"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Quick One-Tap Popular Picks */}
                  {!langSearchQuery.trim() && (
                    <div className="flex items-center gap-1 flex-wrap px-0.5">
                      {['en', 'ne', 'hi', 'es', 'ja', 'ar'].map((code) => {
                        const l = SUPPORTED_LANGUAGES.find((item) => item.code === code);
                        if (!l) return null;
                        const active = currentSession.targetLanguage === l.code;
                        return (
                          <button
                            key={`quick-${l.code}`}
                            type="button"
                            onClick={() => handleQuickSelectLanguage(l.code)}
                            className={`px-2 py-0.5 rounded-lg border text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                              active
                                ? 'bg-purple-600/45 border-purple-400 text-white'
                                : 'bg-[#090a0f] border-white/10 text-gray-300 hover:border-purple-400/50 hover:text-white'
                            }`}
                          >
                            <span>{l.flag}</span>
                            <span>{l.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Full Scrollable Language List */}
                  <div className="max-h-60 overflow-y-auto space-y-0.5 pr-1">
                    {quickSwitcherFilteredLangs.length === 0 ? (
                      <div className="py-4 text-center text-xs text-gray-400">
                        No languages match "{langSearchQuery}"
                      </div>
                    ) : (
                      quickSwitcherFilteredLangs.map((lang) => {
                        const isSelected = currentSession.targetLanguage === lang.code;
                        return (
                          <button
                            key={lang.code}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => handleQuickSelectLanguage(lang.code)}
                            className={`w-full px-2.5 py-2 rounded-xl text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-purple-600/35 border border-purple-400/50 text-white font-bold'
                                : 'hover:bg-white/10 text-gray-200 border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-base leading-none shrink-0">{lang.flag}</span>
                              <div className="min-w-0">
                                <div className="truncate flex items-center gap-1.5">
                                  <span>{lang.name}</span>
                                  <span className="text-[11px] text-purple-300/90 font-normal truncate">
                                    {lang.nativeName}
                                  </span>
                                </div>
                                <div className="text-[9px] text-gray-400 flex items-center gap-1.5">
                                  <span>{lang.region}</span>
                                  {lang.rtl && (
                                    <span className="px-1 rounded bg-amber-950/60 text-amber-300 border border-amber-500/30">
                                      RTL
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {isSelected && <Check className="w-3.5 h-3.5 text-purple-300 shrink-0" />}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
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

        {/* Inline Session & Message Search Input for Mobile Viewports */}
        {showInlineSearch && (
          <div className="md:hidden px-4 py-2 bg-[#0c0e17] border-b border-[#232738] space-y-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-purple-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                autoFocus
                value={drawerSearchQuery}
                onChange={(e) => {
                  setDrawerSearchQuery(e.target.value);
                  onSearchChange?.(e.target.value);
                }}
                placeholder="Search sessions by title or content..."
                aria-label="Search sessions by title or content keywords"
                className="w-full bg-[#131520] border border-[#232738] focus:border-purple-500 rounded-xl pl-8 pr-7 py-1.5 text-xs text-gray-200 placeholder-gray-500 outline-none"
              />
              {(drawerSearchQuery || searchFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setDrawerSearchQuery('');
                    onSearchChange?.('');
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {trimmedDrawerQuery && (
              <div className="max-h-40 overflow-y-auto space-y-1">
                {filteredSessions.length === 0 ? (
                  <p className="text-[11px] text-gray-400 px-1">
                    No sessions match "{trimmedDrawerQuery}"
                  </p>
                ) : (
                  filteredSessions.slice(0, 5).map(({ session: s, matchCount, snippet }) => (
                    <button
                      key={`mob-session-${s.id}`}
                      type="button"
                      onClick={() => {
                        onSelectSession(s.id);
                        setShowInlineSearch(false);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-xl bg-[#131520] hover:bg-purple-900/30 border border-white/10 text-xs flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-white truncate">
                          <HighlightText text={s.title} query={trimmedDrawerQuery} />
                        </div>
                        {snippet && (
                          <div className="text-[10px] text-purple-200/80 truncate">
                            <HighlightText text={snippet} query={trimmedDrawerQuery} />
                          </div>
                        )}
                      </div>
                      {matchCount > 0 && (
                        <span className="text-[10px] text-amber-300 font-semibold shrink-0">
                          {matchCount} hits
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Active History Search Status Banner */}
        {trimmedSearch && (
          <div className="px-4 py-2 bg-amber-950/35 border-b border-amber-500/30 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-amber-200 min-w-0">
              <Search className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">
                Highlighting <strong>{displayedMessages.length}</strong> matching{' '}
                {displayedMessages.length === 1 ? 'message' : 'messages'} for{' '}
                <span className="px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-200 font-semibold">
                  "{trimmedSearch}"
                </span>
              </span>
            </div>
            {onSearchChange && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="text-[11px] font-semibold text-amber-300 hover:text-white underline shrink-0 cursor-pointer"
              >
                Clear search
              </button>
            )}
          </div>
        )}

        {/* Persistent Sticky Pinned Messages Bar (Stays visible at top while scrolling) */}
        {pinnedMessages.length > 0 && (
          <div
            role="region"
            aria-label="Pinned messages"
            className="shrink-0 z-20 bg-[#0d101e]/95 backdrop-blur-xl border-b border-amber-500/35 px-3 sm:px-5 py-2 shadow-lg"
          >
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setPinnedCollapsed((prev) => !prev)}
                  className="flex items-center gap-2 text-xs font-bold text-amber-300 hover:text-amber-200 cursor-pointer"
                >
                  <Pin className="w-3.5 h-3.5 fill-amber-400/30 text-amber-400 shrink-0" />
                  <span>
                    Pinned Messages ({pinnedMessages.length})
                  </span>
                  {pinnedCollapsed ? (
                    <ChevronDown className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <ChevronUp className="w-3.5 h-3.5 text-amber-400" />
                  )}
                </button>
                <span className="text-[10px] text-gray-400 hidden sm:inline">
                  Click any pinned message to jump to it in history
                </span>
              </div>

              {!pinnedCollapsed && (
                <div className="mt-2 space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {pinnedMessages.map((pm) => {
                    const isPinAI = pm.role === 'model';
                    const isPinParticipant =
                      pm.role === 'participant' ||
                      (pm.role === 'user' && Boolean(pm.senderId && user?.id && pm.senderId !== user.id));
                    const isPinUser = !isPinAI && !isPinParticipant;
                    return (
                      <div
                        key={`pinned-${pm.id}`}
                        className="flex items-start justify-between gap-2.5 p-2 rounded-xl bg-[#14182b]/90 hover:bg-[#1a1f36] border border-amber-500/25 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => scrollToPinnedMessage(pm.id)}
                          className="flex-1 min-w-0 text-left flex items-start gap-2 cursor-pointer"
                          title="Jump to this message in chat"
                        >
                          <span
                            className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${
                              isPinUser
                                ? 'bg-purple-600/30 text-purple-200 border border-purple-400/30'
                                : isPinParticipant
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                            }`}
                          >
                            {isPinAI ? 'AI' : isPinParticipant ? pm.senderName || 'Member' : 'You'}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-100 line-clamp-2 leading-snug">
                              <HighlightText text={pm.content} query={trimmedSearch} />
                            </p>
                            {pm.translation && (
                              <p className="text-[11px] text-purple-300/90 line-clamp-1 mt-0.5">
                                🌐 <HighlightText text={pm.translation} query={trimmedSearch} />
                              </p>
                            )}
                          </div>
                        </button>

                        {onTogglePinMessage && (
                          <button
                            type="button"
                            onClick={() => onTogglePinMessage(pm.id)}
                            className="p-1 rounded-lg text-amber-300/80 hover:text-rose-300 hover:bg-rose-950/40 transition-colors shrink-0 cursor-pointer"
                            title="Unpin message"
                            aria-label="Unpin message"
                          >
                            <PinOff className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Message Feed */}
        <div className="flex-1 min-h-0 overflow-y-auto chat-feed-scroll px-2.5 sm:px-6 py-4 space-y-5">
          {/* No Search Results Empty State */}
          {trimmedSearch && displayedMessages.length === 0 && (
            <div className="glass-card rounded-2xl p-6 max-w-lg mx-auto text-center border border-amber-500/30 space-y-3">
              <Search className="w-6 h-6 text-amber-400 mx-auto" />
              <div className="text-sm font-bold text-white">
                No matching messages for "{trimmedSearch}"
              </div>
              <p className="text-xs text-gray-400">
                Try searching a different keyword or switch conversations from Conversation Logs.
              </p>
              {onSearchChange && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="px-3.5 py-1.5 rounded-xl bg-purple-900/50 hover:bg-purple-800/70 border border-purple-500/40 text-purple-200 text-xs font-semibold cursor-pointer"
                >
                  Clear Search Filter
                </button>
              )}
            </div>
          )}

          {/* Hero Welcome banner when starting */}
          {!trimmedSearch && displayedMessages.length <= 1 && (
            <div className="relative text-center py-4 sm:py-8 space-y-4 max-w-2xl mx-auto overflow-hidden">
              {/* Subtle 3D Spheres floating in background matching attached photo */}
              <div className="sphere-3d w-14 h-14 absolute -top-2 left-6 opacity-60 animate-float-slow" />
              <div className="sphere-3d w-20 h-20 absolute -top-4 right-10 opacity-70 animate-float-delayed" />
              <div className="sphere-3d w-8 h-8 absolute bottom-0 left-1/4 opacity-50 animate-pulse-glow" />

              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-950/60 border border-purple-500/30 text-purple-300 text-[11px] sm:text-xs font-semibold shadow-inner">
                <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span>Aadesh AI Global Hub • Worldwide Intelligence</span>
              </div>

              <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight px-1">
                Explore &amp; Learn with <span className="text-gradient">Aadesh AI</span>
              </h1>

              <p className="text-xs sm:text-sm text-gray-400 max-w-lg mx-auto px-2">
                Multilingual AI, photo &amp; document analysis, voice intelligence, and contextual reasoning across 20+ world languages.
              </p>

              {/* Quick Topic Starter Cards (Single column on mobile, 2 columns sm+) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 text-left">
                <button
                  onClick={() => handleSend('Design a scalable clean architecture for a modern full-stack web application with TypeScript')}
                  className="glass-card glass-card-hover p-3 rounded-xl border border-purple-500/25 text-left group cursor-pointer"
                >
                  <div className="text-xs font-bold text-white flex items-center justify-between">
                    <span>💻 Code & Software Architecture</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-purple-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1 line-clamp-1">TypeScript, system architecture, API design</p>
                </button>

                <button
                  onClick={() => handleSend('Provide a helpful comparison between Nepali and English phrasing for clear communication')}
                  className="glass-card glass-card-hover p-3 rounded-xl border border-purple-500/25 text-left group cursor-pointer"
                >
                  <div className="text-xs font-bold text-white flex items-center justify-between">
                    <span>🌐 Nepali & English Intelligence</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-purple-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1 line-clamp-1">Nepali & English suggestions + all-language translation</p>
                </button>

                <button
                  onClick={() => handleSend('What are the best practices for multimodal AI vision analysis on documents and architectural photos?')}
                  className="glass-card glass-card-hover p-3 rounded-xl border border-purple-500/25 text-left group cursor-pointer"
                >
                  <div className="text-xs font-bold text-white flex items-center justify-between">
                    <span>📸 Scene & Document Vision</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-purple-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1 line-clamp-1">Inspect photos, diagrams & visual text</p>
                </button>

                <button
                  onClick={() => handleSend('Start an interactive hands-free voice learning session on algorithmic thinking')}
                  className="glass-card glass-card-hover p-3 rounded-xl border border-purple-500/25 text-left group cursor-pointer"
                >
                  <div className="text-xs font-bold text-white flex items-center justify-between">
                    <span>🎙️ Real-Time Voice Conversation</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-purple-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1 line-clamp-1">Hands-free speech with emotional personas</p>
                </button>
              </div>
            </div>
          )}

          {/* Render Messages */}
          {displayedMessages.map((msg) => {
            const isAI = msg.role === 'model';
            const isOtherParticipant =
              msg.role === 'participant' ||
              (msg.role === 'user' && Boolean(msg.senderId && user?.id && msg.senderId !== user.id));
            const isUser = !isAI && !isOtherParticipant;
            const senderDisplayName = isAI
              ? 'Aadesh AI'
              : isOtherParticipant
              ? msg.senderName || 'Participant'
              : msg.senderName || user?.name || 'You';
            const senderAvatar = isOtherParticipant
              ? msg.senderAvatarUrl
              : isUser
              ? msg.senderAvatarUrl || user?.avatarUrl
              : undefined;
            const senderInitial = (senderDisplayName || 'U').trim().charAt(0).toUpperCase();
            const activeReactions = Object.entries(msg.reactions || {}).filter(
              ([, count]) => typeof count === 'number' && count > 0
            );
            const viewMode = translationViewModes[msg.id] || 'bilingual';
            const hasGeotagContext = Boolean(
              msg.location || (typeof msg.geotagInsights === 'string' && msg.geotagInsights.trim().length > 0)
            );
            const contextTooltip = msg.location?.name
              ? `Location context: ${msg.location.name}`
              : msg.geotagInsights
              ? 'Contains geotag regional insights'
              : 'Contains location metadata';

            return (
              <div
                key={msg.id}
                id={`chat-msg-${msg.id}`}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-2 max-w-3xl mx-auto w-full scroll-mt-6`}
              >
                {/* Geotag Location Pill Above Bubble */}
                {msg.location && (
                  <div
                    className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-purple-950/70 border border-purple-500/40 text-[11px] text-purple-300 font-medium ${
                      isUser ? 'mr-11 sm:mr-12' : 'ml-11 sm:ml-12'
                    }`}
                  >
                    <MapPin className="w-3 h-3 text-purple-400 shrink-0" />
                    <span>
                      <HighlightText text={msg.location.name} query={trimmedSearch} />
                    </span>
                  </div>
                )}

                {/* Avatar + Bubble Row */}
                <div
                  className={`flex items-start gap-2.5 sm:gap-3 w-full ${
                    isUser ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  {/* Distinct Role Avatar (AI, Other Group Participant, or Current User) */}
                  {isAI ? (
                    <div
                      className="w-8 h-8 sm:w-9 sm:h-9 rounded-full purple-glow-btn border border-purple-400/50 flex items-center justify-center shrink-0 shadow-lg mt-0.5 relative"
                      title="Aadesh AI Assistant"
                      aria-label="Aadesh AI Avatar"
                    >
                      <Bot className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-white" />
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0b0e1a]" />
                    </div>
                  ) : isOtherParticipant ? (
                    <div
                      className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-600 border border-emerald-400/50 flex items-center justify-center shrink-0 overflow-hidden shadow-md mt-0.5 text-white text-xs sm:text-sm font-black"
                      title={`${senderDisplayName} (Group Participant)`}
                      aria-label={`${senderDisplayName} Avatar`}
                    >
                      {senderAvatar ? (
                        <img
                          src={senderAvatar}
                          alt={senderDisplayName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>{senderInitial}</span>
                      )}
                    </div>
                  ) : (
                    <div
                      className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border flex items-center justify-center shrink-0 overflow-hidden shadow-md mt-0.5 text-white text-xs sm:text-sm font-black transition-all duration-300"
                      style={{
                        background: `linear-gradient(135deg, ${userAvatarTokens.primaryHex}, ${userAvatarTokens.secondaryHex})`,
                        borderColor: `rgba(${userAvatarTokens.lightRgb}, 0.7)`,
                        boxShadow: `0 4px 14px rgba(${userAvatarTokens.primaryRgb}, 0.38)`,
                      }}
                      title={`${senderDisplayName} (You)`}
                      aria-label="Your Avatar"
                    >
                      {senderAvatar ? (
                        <img
                          src={senderAvatar}
                          alt={senderDisplayName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>{senderInitial}</span>
                      )}
                    </div>
                  )}

                  {/* Main Message Bubble */}
                  <div
                    onMouseDown={(e) => {
                      if (isAI && e.button === 0) {
                        startQuickContextLongPress(msg, e.clientX, e.clientY, e.target);
                      }
                    }}
                    onMouseMove={(e) => {
                      if (isAI) handleQuickContextMove(e.clientX, e.clientY);
                    }}
                    onMouseUp={clearLongPressTimer}
                    onMouseLeave={clearLongPressTimer}
                    onTouchStart={(e) => {
                      if (isAI && e.touches[0]) {
                        startQuickContextLongPress(msg, e.touches[0].clientX, e.touches[0].clientY, e.target);
                      }
                    }}
                    onTouchMove={(e) => {
                      if (isAI && e.touches[0]) {
                        handleQuickContextMove(e.touches[0].clientX, e.touches[0].clientY);
                      }
                    }}
                    onTouchEnd={clearLongPressTimer}
                    onTouchCancel={clearLongPressTimer}
                    onContextMenu={(e) => {
                      if (isAI && justTriggeredQuickContextRef.current) {
                        e.preventDefault();
                      }
                    }}
                    aria-haspopup={isAI ? 'menu' : undefined}
                    className={`min-w-0 flex-1 max-w-[88%] sm:max-w-[82%] rounded-2xl p-4 sm:p-5 relative space-y-3.5 shadow-xl transition-all ${
                      isUser
                        ? 'bg-gradient-to-r from-purple-700/85 via-purple-600/85 to-indigo-700/85 text-white rounded-tr-xs border border-purple-400/40 shadow-purple-900/30'
                        : isOtherParticipant
                        ? 'glass-card text-gray-100 rounded-tl-xs border border-emerald-500/40 bg-emerald-950/20'
                        : msg.isError
                        ? 'glass-card text-rose-100 rounded-tl-xs border border-rose-500/50 bg-rose-950/25'
                        : hasGeotagContext
                        ? 'glass-card text-gray-100 rounded-tl-xs border border-emerald-400/50 shadow-[0_0_24px_rgba(16,185,129,0.12)]'
                        : 'glass-card text-gray-100 rounded-tl-xs border border-purple-500/30'
                    } ${
                      hasGeotagContext && isUser ? 'ring-1 ring-emerald-400/55 border-emerald-300/60' : ''
                    } ${
                      msg.isPinned ? 'ring-1 ring-amber-400/60 border-amber-400/50' : ''
                    } ${
                      quickContextMenu?.msgId === msg.id
                        ? 'ring-2 ring-purple-400 shadow-[0_0_24px_rgba(var(--theme-accent-rgb),0.4)]'
                        : ''
                    } ${
                      highlightedMsgId === msg.id ? 'ring-2 ring-amber-300 shadow-[0_0_25px_rgba(251,191,36,0.35)]' : ''
                    }`}
                  >
                    {/* User Identity Strip */}
                    {isUser && (
                      <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-1.5">
                        <span className="text-[11px] font-bold text-purple-100 truncate">
                          {senderDisplayName}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {hasGeotagContext && (
                            <span
                              data-context-badge="true"
                              title={contextTooltip}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-300/60 text-[10px] font-bold uppercase tracking-wider text-emerald-100 shadow-xs"
                            >
                              <MapPin className="w-2.5 h-2.5 text-emerald-300 shrink-0" />
                              <span>Context</span>
                            </span>
                          )}
                          <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-white/15 text-purple-100 border border-white/20 shrink-0">
                            You
                          </span>
                        </div>
                      </div>
                    )}

                    {/* AI Model / Group Participant Header */}
                    {!isUser && (
                      <div className="flex items-center justify-between border-b border-white/10 pb-2.5 gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <span className="text-xs font-bold text-white tracking-wide flex items-center gap-1.5 truncate">
                            {senderDisplayName}
                            {isAI ? (
                              <span className="text-[10px] text-purple-300 bg-purple-950 px-1.5 py-0.2 rounded font-normal border border-purple-500/30">
                                Assistant
                              </span>
                            ) : (
                              <span className="text-[10px] text-emerald-300 bg-emerald-950/80 px-1.5 py-0.2 rounded font-normal border border-emerald-500/30">
                                Participant
                              </span>
                            )}
                          </span>
                          {hasGeotagContext && (
                            <span
                              data-context-badge="true"
                              title={contextTooltip}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/90 border border-emerald-400/60 text-[10px] font-bold uppercase tracking-wider text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.22)] shrink-0"
                            >
                              <MapPin className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                              <span>Context</span>
                            </span>
                          )}
                        </div>

                        {/* View Mode Toggle Tabs & All-Language Response Translator */}
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {!msg.isError && onTranslateMessage && (
                          <div className="flex items-center gap-1 bg-[#090a0f] px-2 py-0.5 rounded-lg border border-[#232738] text-[10px]">
                            <Globe2 className="w-3 h-3 text-purple-400 shrink-0" />
                            <select
                              aria-label="Translate AI response to language"
                              value={msg.translationLanguage || ''}
                              disabled={translatingMsgId === msg.id}
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleInlineTranslate(msg.id, e.target.value);
                                }
                              }}
                              className="bg-transparent text-purple-300 font-medium outline-none cursor-pointer max-w-[115px]"
                            >
                              <option value="" className="bg-[#131520] text-gray-300">
                                {translatingMsgId === msg.id ? 'Translating...' : 'Translate All...'}
                              </option>
                              {SUPPORTED_LANGUAGES.map((lang) => (
                                <option key={lang.code} value={lang.code} className="bg-[#131520] text-gray-200">
                                  {lang.flag} {lang.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

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
                    </div>
                  )}

                  {/* Attached Image Preview (Click to open Full-Screen Lightbox) */}
                  {msg.imageUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxImage({
                          url: msg.imageUrl!,
                          alt: msg.attachmentName || 'Chat attached image',
                          senderName: senderDisplayName,
                          timestamp: msg.timestamp,
                          caption: msg.content,
                          locationName: msg.location?.name || activeConversationGeotagLocation?.name,
                        })
                      }
                      aria-label="View attached image in full screen"
                      title="Click to enlarge image"
                      className="group relative block rounded-xl overflow-hidden border border-white/15 hover:border-purple-400/70 max-h-72 max-w-md shadow-md cursor-zoom-in transition-all focus:outline-none focus:ring-2 focus:ring-purple-400"
                    >
                      <img
                        src={msg.imageUrl}
                        alt="Uploaded query"
                        className="w-full h-full max-h-72 object-cover group-hover:scale-[1.02] transition-transform duration-200"
                      />
                      {(msg.location || isGeotaggedConversation) && (
                        <span
                          title={
                            (msg.location?.name || activeConversationGeotagLocation?.name)
                              ? `Image in active geotagged conversation: ${msg.location?.name || activeConversationGeotagLocation?.name}`
                              : 'Image is part of an active geotagged conversation'
                          }
                          className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-950/85 backdrop-blur-sm border border-emerald-400/55 text-[10px] font-bold uppercase tracking-wider text-emerald-200 shadow-md"
                        >
                          <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                          <span>Context</span>
                          {(msg.location?.name || activeConversationGeotagLocation?.name) && (
                            <span className="font-medium normal-case tracking-normal text-emerald-100/90 truncate max-w-[130px]">
                              · {msg.location?.name || activeConversationGeotagLocation?.name}
                            </span>
                          )}
                        </span>
                      )}
                      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-black/70 backdrop-blur-sm border border-white/20 text-[10px] font-semibold text-white opacity-85 group-hover:opacity-100 transition-opacity">
                        <Maximize2 className="w-3 h-3 text-purple-300" />
                        <span>Expand</span>
                      </span>
                    </button>
                  )}

                  {/* Attached File Badge */}
                  {msg.attachmentName && (
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-950/60 border border-purple-400/35 text-xs text-purple-100">
                      <Paperclip className="w-3.5 h-3.5 text-purple-300" />
                      <span className="font-mono">
                        <HighlightText text={msg.attachmentName} query={trimmedSearch} />
                      </span>
                    </div>
                  )}

                  {/* Content View: Markdown + Syntax Code Copy + RTL detection + Search Highlight */}
                  {(viewMode === 'bilingual' || viewMode === 'original' || isUser) && (
                    isUser ? (
                      <div
                        dir={isRtlLanguage(msg.detectedLanguage, msg.content) ? 'rtl' : 'ltr'}
                        className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap text-gray-100"
                      >
                        <HighlightText text={msg.content} query={trimmedSearch} />
                      </div>
                    ) : (
                      <MarkdownRenderer
                        content={msg.content}
                        rtl={isRtlLanguage(msg.detectedLanguage, msg.content)}
                        highlightQuery={trimmedSearch}
                      />
                    )
                  )}

                  {/* Direct Retry Action for Failed Requests */}
                  {!isUser && msg.isError && (
                    <div className="pt-1 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => handleRegenerate(msg.id)}
                        disabled={isLoading}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/80 hover:bg-rose-500 text-white text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Retry Request</span>
                      </button>
                    </div>
                  )}

                  {/* Real-Time Translation Card (For AI Model responses) */}
                  {!isUser && msg.translation && (viewMode === 'bilingual' || viewMode === 'translated') && (() => {
                    const msgTransLangObj =
                      SUPPORTED_LANGUAGES.find((l) => l.code === msg.translationLanguage) || targetLangObj;
                    const transIsRtl = isRtlLanguage(msg.translationLanguage || msgTransLangObj.code, msg.translation);
                    return (
                      <div className="pt-2 border-t border-purple-500/20 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-purple-300 font-semibold">
                          <span className="flex items-center gap-1.5">
                            <Languages className="w-3.5 h-3.5 text-purple-400" />
                            <span>{msgTransLangObj.flag} {msgTransLangObj.name} Translation</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                handleSpeakMessage(
                                  `${msg.id}-trans`,
                                  msg.translation || '',
                                  msgTransLangObj.speechCode
                                )
                              }
                              className="inline-flex items-center gap-1 text-[10px] text-purple-300 hover:text-white bg-purple-950/60 px-2 py-0.5 rounded-md border border-purple-500/30 cursor-pointer"
                              title={`Listen to ${msgTransLangObj.name} translation`}
                            >
                              <Volume2 className="w-3 h-3" />
                              <span>Speak</span>
                            </button>
                            <span className="text-[10px] text-gray-400 font-normal">
                              Source: {msg.detectedLanguage?.toUpperCase() || 'Auto'}
                            </span>
                          </div>
                        </div>
                        <div
                          dir={transIsRtl ? 'rtl' : 'ltr'}
                          className="text-xs sm:text-sm text-purple-100 bg-[#090a0f]/75 p-3.5 rounded-xl border border-purple-500/25 leading-relaxed font-normal shadow-inner"
                        >
                          <MarkdownRenderer
                            content={msg.translation}
                            rtl={transIsRtl}
                            highlightQuery={trimmedSearch}
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Geotag Cultural / Regional Insights */}
                  {!isUser && msg.geotagInsights && (
                    <div className="text-xs bg-indigo-950/40 border border-indigo-500/30 text-indigo-200 p-3 rounded-xl flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="block text-indigo-300 font-semibold mb-0.5">Regional Context:</strong>
                        <span>
                          <HighlightText text={msg.geotagInsights} query={trimmedSearch} />
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Emoji Reactions Bar & Active Sentiment Counts */}
                  {(activeReactions.length > 0 || onReactMessage) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-white/10">
                      {/* Active Reaction Pills */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {activeReactions.map(([emoji, count]) => {
                          const hasReacted = Boolean(msg.userReactions?.includes(emoji));
                          return (
                            <button
                              key={`${msg.id}-react-${emoji}`}
                              type="button"
                              onClick={() => onReactMessage?.(msg.id, emoji)}
                              aria-pressed={hasReacted}
                              title={hasReacted ? `Remove ${emoji} reaction` : `React with ${emoji}`}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold transition-all cursor-pointer border ${
                                hasReacted
                                  ? 'bg-purple-500/35 border-purple-300/70 text-white shadow-sm'
                                  : isUser
                                  ? 'bg-white/10 hover:bg-white/20 border-white/20 text-purple-100'
                                  : 'bg-[#131626] hover:bg-purple-900/40 border-[#282d44] text-gray-200'
                              }`}
                            >
                              <span className="leading-none">{emoji}</span>
                              <span className="text-[11px] tabular-nums">{count}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Quick 1-Tap Emoji Picker */}
                      {onReactMessage && (
                        <div className="flex items-center gap-1 relative ml-auto">
                          {QUICK_REACTIONS.map((emoji) => {
                            const hasReacted = Boolean(msg.userReactions?.includes(emoji));
                            return (
                              <button
                                key={`${msg.id}-quick-${emoji}`}
                                type="button"
                                onClick={() => {
                                  onReactMessage(msg.id, emoji);
                                  setReactionPickerMsgId(null);
                                }}
                                aria-label={`React with ${emoji}`}
                                title={`React with ${emoji}`}
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all cursor-pointer hover:scale-115 ${
                                  hasReacted
                                    ? 'bg-purple-400/40 ring-1 ring-purple-200/80'
                                    : isUser
                                    ? 'hover:bg-white/20 opacity-80 hover:opacity-100'
                                    : 'hover:bg-purple-900/50 opacity-75 hover:opacity-100'
                                }`}
                              >
                                {emoji}
                              </button>
                            );
                          })}

                          <button
                            type="button"
                            onClick={() =>
                              setReactionPickerMsgId(reactionPickerMsgId === msg.id ? null : msg.id)
                            }
                            aria-label="More emoji reactions"
                            title="More reactions"
                            className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                              reactionPickerMsgId === msg.id
                                ? 'bg-purple-500/40 text-white'
                                : isUser
                                ? 'text-purple-100/80 hover:bg-white/20 hover:text-white'
                                : 'text-gray-400 hover:bg-purple-900/50 hover:text-purple-200'
                            }`}
                          >
                            <SmilePlus className="w-3.5 h-3.5" />
                          </button>

                          {reactionPickerMsgId === msg.id && (
                            <div className="absolute right-0 bottom-full mb-1.5 flex items-center gap-1 px-2 py-1 rounded-xl glass-card border border-purple-500/50 shadow-2xl z-40">
                              {[...QUICK_REACTIONS, ...EXTRA_REACTIONS].map((emoji) => {
                                const hasReacted = Boolean(msg.userReactions?.includes(emoji));
                                return (
                                  <button
                                    key={`${msg.id}-extra-${emoji}`}
                                    type="button"
                                    onClick={() => {
                                      onReactMessage(msg.id, emoji);
                                      setReactionPickerMsgId(null);
                                    }}
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-transform hover:scale-115 cursor-pointer ${
                                      hasReacted ? 'bg-purple-600/50 ring-1 ring-purple-300' : 'hover:bg-purple-900/50'
                                    }`}
                                    title={`React with ${emoji}`}
                                  >
                                    {emoji}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bubble Actions Toolbar */}
                  <div className="flex items-center justify-between pt-1 text-[11px] text-gray-400 border-t border-white/5">
                    <span className="text-[10px] flex items-center gap-1.5">
                      <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {msg.isPinned && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-400/40 text-amber-300 font-semibold">
                          <Pin className="w-2.5 h-2.5 fill-amber-400/40" />
                          <span>Pinned</span>
                        </span>
                      )}
                      {msg.isVoiceInput && <span>• 🎙️ Voice</span>}
                      {msg.isOffline && <span>• 💾 Local Engine</span>}
                    </span>

                    <div className="flex items-center space-x-2">
                      {/* Pin / Unpin message to top of session */}
                      {onTogglePinMessage && (
                        <button
                          type="button"
                          onClick={() => onTogglePinMessage(msg.id)}
                          aria-pressed={Boolean(msg.isPinned)}
                          className={`p-1 rounded transition-colors cursor-pointer ${
                            msg.isPinned
                              ? 'text-amber-300 bg-amber-950/60 border border-amber-500/40'
                              : 'hover:text-amber-300 text-gray-400'
                          }`}
                          title={msg.isPinned ? 'Unpin message from top' : 'Pin message to top of chat'}
                          aria-label={msg.isPinned ? 'Unpin message' : 'Pin message'}
                        >
                          <Pin className={`w-3.5 h-3.5 ${msg.isPinned ? 'fill-amber-400/40' : ''}`} />
                        </button>
                      )}

                      {/* Feedback: Thumbs Up / Thumbs Down */}
                      {!isUser && !msg.isError && onFeedbackMessage && (
                        <div className="flex items-center gap-0.5 mr-1 border-r border-white/10 pr-2">
                          <button
                            onClick={() => onFeedbackMessage(msg.id, 'up')}
                            className={`p-1 rounded transition-colors cursor-pointer ${
                              msg.feedback === 'up'
                                ? 'text-emerald-400 bg-emerald-950/50'
                                : 'hover:text-emerald-300 text-gray-400'
                            }`}
                            title="Helpful response"
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onFeedbackMessage(msg.id, 'down')}
                            className={`p-1 rounded transition-colors cursor-pointer ${
                              msg.feedback === 'down'
                                ? 'text-rose-400 bg-rose-950/50'
                                : 'hover:text-rose-300 text-gray-400'
                            }`}
                            title="Needs improvement"
                          >
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Copy */}
                      <button
                        onClick={() => handleCopy(msg.id, msg.translation ? `${msg.content}\n\nTranslation: ${msg.translation}` : msg.content)}
                        className="hover:text-white transition-colors p-1 cursor-pointer"
                        title="Copy to clipboard"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* Regenerate AI response */}
                      {!isUser && (
                        <button
                          onClick={() => handleRegenerate(msg.id)}
                          className="hover:text-purple-300 transition-colors p-1 cursor-pointer"
                          title="Regenerate this AI response"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Read Aloud (Web Speech API respecting active Voice Persona & Speed) */}
                      <button
                        type="button"
                        onClick={() => {
                          const msgTransLangObj =
                            SUPPORTED_LANGUAGES.find((l) => l.code === msg.translationLanguage) || targetLangObj;
                          const useTranslatedText = viewMode === 'translated' && Boolean(msg.translation);
                          const speechText = useTranslatedText
                            ? msg.translation || msg.content
                            : msg.content;
                          const speechLang = useTranslatedText
                            ? msgTransLangObj.speechCode
                            : resolveMessageSpeechCode(speechText, msg.detectedLanguage);
                          handleSpeakMessage(msg.id, speechText, speechLang);
                        }}
                        aria-pressed={speakingId === msg.id && playbackState.isSpeaking}
                        aria-label={
                          speakingId === msg.id && playbackState.isSpeaking
                            ? 'Stop reading aloud'
                            : 'Read aloud'
                        }
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
                          speakingId === msg.id && playbackState.isSpeaking
                            ? 'bg-purple-500/30 border-purple-400/70 text-purple-100 animate-pulse'
                            : isUser
                            ? 'bg-white/10 hover:bg-white/20 border-white/20 text-purple-100 hover:text-white'
                            : 'bg-[#131626] hover:bg-purple-900/40 border-[#282d44] text-gray-300 hover:text-purple-200'
                        }`}
                        title={`Read aloud (${settings.voicePersona || 'friendly'} persona · ${(settings.voiceSpeed ?? 1).toFixed(2)}x speed)`}
                      >
                        {speakingId === msg.id && playbackState.isSpeaking ? (
                          <>
                            <VolumeX className="w-3.5 h-3.5 text-purple-300" />
                            <span>Stop</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3.5 h-3.5" />
                            <span>Read Aloud</span>
                          </>
                        )}
                      </button>

                      {/* Social Media Sharing Button & Dropdown */}
                      <div className="relative">
                        <button
                          onClick={() => setSharePopoverMsgId(sharePopoverMsgId === msg.id ? null : msg.id)}
                          className={`hover:text-purple-300 transition-colors p-1 cursor-pointer ${
                            sharePopoverMsgId === msg.id ? 'text-purple-400' : ''
                          }`}
                          title="Share formatted snippet to social media"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Social Share Popover Dropdown */}
                        {sharePopoverMsgId === msg.id && (
                          <div className="absolute right-0 bottom-full mb-2 w-60 glass-card rounded-2xl p-2.5 border border-purple-500/40 shadow-2xl z-50 text-xs animate-in fade-in zoom-in-95 duration-150 space-y-1">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-purple-300 px-2 pb-1.5 border-b border-white/10 flex items-center justify-between">
                              <span>Share Response</span>
                              <span className="text-[9px] text-purple-300 font-semibold">🌐 Global Hub</span>
                            </div>

                            {/* 1. Copy Formatted Snippet */}
                            <button
                              onClick={() => handleCopyShareSnippet(msg)}
                              className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-purple-900/40 text-gray-200 hover:text-white flex items-center gap-2 cursor-pointer transition-colors"
                            >
                              <Copy className="w-3.5 h-3.5 text-purple-400" />
                              <span className="font-medium">Copy Formatted Snippet</span>
                            </button>

                            {/* 2. Share on X / Twitter */}
                            <a
                              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(getFormattedShareSnippet(msg))}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => setSharePopoverMsgId(null)}
                              className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-purple-900/40 text-gray-200 hover:text-white flex items-center gap-2 cursor-pointer transition-colors"
                            >
                              <span className="text-xs font-bold text-sky-400 w-3.5 text-center">𝕏</span>
                              <span>Post on X (Twitter)</span>
                            </a>

                            {/* 3. Share on WhatsApp */}
                            <a
                              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(getFormattedShareSnippet(msg))}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => setSharePopoverMsgId(null)}
                              className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-purple-900/40 text-gray-200 hover:text-white flex items-center gap-2 cursor-pointer transition-colors"
                            >
                              <span className="text-xs font-bold text-emerald-400 w-3.5 text-center">💬</span>
                              <span>Share on WhatsApp</span>
                            </a>

                            {/* 4. Share on Facebook */}
                            <a
                              href={`https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(getFormattedShareSnippet(msg))}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => setSharePopoverMsgId(null)}
                              className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-purple-900/40 text-gray-200 hover:text-white flex items-center gap-2 cursor-pointer transition-colors"
                            >
                              <span className="text-xs font-bold text-blue-500 w-3.5 text-center">f</span>
                              <span>Share on Facebook</span>
                            </a>

                            {/* 5. Share on LinkedIn */}
                            <a
                              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.origin)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => setSharePopoverMsgId(null)}
                              className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-purple-900/40 text-gray-200 hover:text-white flex items-center gap-2 cursor-pointer transition-colors"
                            >
                              <span className="text-xs font-bold text-blue-400 w-3.5 text-center">in</span>
                              <span>Share on LinkedIn</span>
                            </a>

                            {/* 6. Native Device Share */}
                            {typeof navigator !== 'undefined' && 'share' in navigator && (
                              <button
                                onClick={() => handleNativeShare(msg)}
                                className="w-full text-left px-2.5 py-1.5 rounded-xl bg-purple-950/60 hover:bg-purple-900/60 text-purple-200 hover:text-white flex items-center gap-2 cursor-pointer transition-colors border border-purple-500/30"
                              >
                                <Share2 className="w-3.5 h-3.5 text-purple-300" />
                                <span>Device Share Sheet</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                </div>

                {/* Message Timestamp Below Chat Bubble */}
                <div
                  className={`flex items-center gap-1.5 text-[11px] text-gray-400 px-1 ${
                    isUser ? 'justify-end pr-11 sm:pr-12' : 'justify-start pl-11 sm:pl-12'
                  }`}
                  title={new Date(msg.timestamp).toLocaleString()}
                >
                  <Clock className="w-3 h-3 text-purple-400/80 shrink-0" />
                  <time dateTime={new Date(msg.timestamp).toISOString()}>
                    {formatBubbleTimestamp(msg.timestamp)}
                  </time>
                  {msg.isVoiceInput && <span className="text-purple-300/80">• Voice</span>}
                  {msg.isOffline && <span className="text-amber-300/80">• Local</span>}
                </div>

                {/* INTERACTIVE CONTEXT-AWARE SUGGESTED REPLY CHIPS */}
                {!isUser && !msg.isError && msg.suggestedQuestions && msg.suggestedQuestions.length > 0 && (
                  <div className="space-y-1.5 pt-1 w-full max-w-[92%] sm:max-w-[85%] pl-10 sm:pl-12">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-purple-400 pl-1">
                      <Sparkles className="w-3 h-3 text-purple-400" />
                      <span>Suggested Replies</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {msg.suggestedQuestions.map((q, idx) => (
                        <button
                          key={idx}
                          type="button"
                          disabled={isLoading}
                          onClick={() => handleSend(q)}
                          className="smart-reply-chip text-xs text-purple-200 px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="flex items-start gap-2.5 sm:gap-3 max-w-3xl mx-auto w-full">
              <div
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full purple-glow-btn border border-purple-400/50 flex items-center justify-center shrink-0 shadow-lg mt-0.5"
                aria-hidden="true"
              >
                <Bot className="w-4 h-4 text-white animate-pulse" />
              </div>
              <div className="glass-card rounded-2xl rounded-tl-xs p-4 border border-purple-500/30 flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-purple-300 font-medium animate-pulse">
                  Aadesh AI is thinking...
                </span>
              </div>
            </div>
          )}

          {/* Live Voice Interim Speech Bubble */}
          {isRecording && voiceInterimTranscript && (
            <div className="flex justify-end max-w-3xl mx-auto w-full">
              <div className="glass-card rounded-2xl rounded-tr-xs p-3.5 border border-purple-500/50 text-xs text-purple-200 italic flex items-center gap-2">
                <Mic className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                <span>"{voiceInterimTranscript}"</span>
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* REAL-TIME VOICE VISUALIZER OVERLAY (Activates whenever VoiceAssistant is speaking) */}
        {playbackState.isSpeaking && (
          <div
            role="region"
            aria-label="Voice Visualizer"
            className="absolute top-14 left-1/2 -translate-x-1/2 z-30 w-[94%] max-w-2xl pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-200"
          >
            <div className="rounded-2xl bg-[#0b1020]/95 backdrop-blur-xl border border-purple-500/50 shadow-[0_12px_40px_rgba(91,33,182,0.45)] p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Real-time Audio Intensity Wave Bars using .wave-bar CSS classes */}
                <div
                  className="flex items-center justify-center gap-1 h-9 px-2.5 rounded-xl bg-[#070a14] border border-purple-500/30 shrink-0"
                  aria-hidden="true"
                >
                  {[0.55, 0.85, 0.65, 1.0, 0.72, 0.95, 0.6, 0.9, 0.75, 1.0, 0.68, 0.88, 0.58, 0.82].map(
                    (weight, idx) => {
                      const activeIntensity =
                        playbackState.isPaused || playbackState.isMuted ? 0.1 : playbackState.intensity;
                      const heightPx = Math.max(5, Math.round(5 + weight * activeIntensity * 26));
                      return (
                        <span
                          key={idx}
                          className="wave-bar wave-bar-live"
                          style={{
                            height: `${heightPx}px`,
                            opacity: playbackState.isMuted || playbackState.isPaused ? 0.35 : 0.55 + weight * activeIntensity * 0.45,
                          }}
                        />
                      );
                    }
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-white">
                    <span>
                      {playbackState.isMuted
                        ? 'Aadesh AI Voice (Muted)'
                        : playbackState.isPaused
                        ? 'Aadesh AI Voice Paused'
                        : 'Aadesh AI Speaking'}
                    </span>
                    <span className="text-[10px] font-mono tabular-nums text-purple-300">
                      {playbackState.currentLang} · {(playbackState.rate ?? 1).toFixed(2)}x · {Math.round(playbackState.intensity * 100)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-300 truncate mt-0.5">
                    {playbackState.currentText}
                  </p>
                </div>
              </div>

              {/* Playback Controls: Pause/Resume, Mute/Unmute, Stop */}
              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() =>
                    playbackState.isPaused ? voiceAssistant.resumeSpeaking() : voiceAssistant.pauseSpeaking()
                  }
                  className="px-2.5 py-1.5 rounded-xl bg-[#141a30] hover:bg-purple-900/50 border border-purple-500/30 text-purple-200 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                  title={playbackState.isPaused ? 'Resume voice playback' : 'Pause voice playback'}
                >
                  {playbackState.isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  <span>{playbackState.isPaused ? 'Resume' : 'Pause'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => voiceAssistant.setMuted(!playbackState.isMuted)}
                  className={`p-1.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                    playbackState.isMuted
                      ? 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                      : 'bg-[#141a30] hover:bg-purple-900/50 border-purple-500/30 text-purple-200'
                  }`}
                  title={playbackState.isMuted ? 'Unmute AI voice' : 'Mute AI voice'}
                >
                  {playbackState.isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>

                <button
                  type="button"
                  onClick={() => voiceAssistant.stopSpeaking()}
                  className="px-2.5 py-1.5 rounded-xl bg-rose-600/85 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                  title="Stop AI voice"
                >
                  <Square className="w-3 h-3 fill-white" />
                  <span>Stop</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VOICE RECOGNITION / SYNTHESIS ERROR BANNER */}
        {voiceError && (
          <div
            className={`absolute left-1/2 -translate-x-1/2 z-30 w-[92%] max-w-xl pointer-events-auto ${
              playbackState.isSpeaking ? 'top-36 sm:top-32' : 'top-14'
            }`}
          >
            <div className="rounded-xl bg-rose-950/90 border border-rose-500/50 text-rose-100 px-3.5 py-2.5 text-xs shadow-xl flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="truncate sm:whitespace-normal">{voiceError}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setVoiceError(null);
                  voiceAssistant.clearError();
                }}
                className="p-1 text-rose-300 hover:text-white shrink-0 cursor-pointer"
                title="Dismiss voice alert"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* CLEAN BOTTOM-ANCHORED CHATGPT-STYLE FLOATING COMPOSER */}
        <div
          className={`shrink-0 z-20 w-full px-2.5 sm:px-6 pt-2 bg-gradient-to-t from-[#090a0f]/95 via-[#090a0f]/75 to-transparent transition-[padding] duration-150 ${
            isKeyboardOpen
              ? 'pb-[max(0.5rem,env(safe-area-inset-bottom))]'
              : 'pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-4'
          }`}
        >
          <div className="max-w-3xl mx-auto w-full space-y-2">
            {/* Attached context chip (photo, file, or geotag) */}
            {(selectedImage || selectedFile || attachedLocation) && (
              <div className="glass-card rounded-2xl p-2 px-3 flex flex-wrap items-center justify-between gap-2 border border-purple-500/40 text-xs shadow-md">
                <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                  {selectedImage && (
                    <div className="relative w-11 h-11 rounded-xl overflow-hidden border border-purple-500/50 shrink-0">
                      <img src={selectedImage.base64} alt="Attached" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setSelectedImage(null)}
                        className="absolute top-0 right-0 bg-red-600/90 text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-bl-sm cursor-pointer"
                        aria-label="Remove attached image"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {selectedFile && (
                    <div className="flex items-center gap-1.5 bg-purple-950/60 border border-purple-500/40 px-2.5 py-1 rounded-lg text-purple-200 font-medium max-w-full">
                      <Paperclip className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span className="max-w-[150px] truncate font-mono">{selectedFile.name}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedFile(null)}
                        className="text-gray-400 hover:text-white text-xs ml-1 cursor-pointer"
                        aria-label="Remove attached file"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {attachedLocation && (
                    <div className="flex items-center gap-1.5 text-purple-300 font-semibold min-w-0">
                      <MapPin className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span className="truncate max-w-[150px]">{attachedLocation.name}</span>
                      <button
                        type="button"
                        onClick={() => setAttachedLocation(undefined)}
                        className="text-gray-400 hover:text-white text-xs ml-1 cursor-pointer"
                        aria-label="Remove geotag"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>

                <span className="text-[10px] text-gray-400 shrink-0">Attached</span>
              </div>
            )}

            {/* Main ChatGPT-Style Floating Rounded Composer */}
            <div className="glow-input-container">
              <div className="glow-input-inner px-3 sm:px-4 pt-2.5 pb-2 flex flex-col gap-1.5">
                {isRecording ? (
                  /* VISUAL AUDIO-WAVE ANIMATION & STOP BUTTON OVERLAY */
                  <div className="flex items-center justify-between gap-2 sm:gap-3 py-1 animate-in fade-in zoom-in-95 duration-150">
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
                          {voiceInterimTranscript ? `"${voiceInterimTranscript}"` : 'Speak now...'}
                        </span>
                      </div>
                    </div>

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

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          voiceAssistant.stopListening();
                          setIsRecording(false);
                          setVoiceInterimTranscript('');
                        }}
                        className="p-2 min-w-[38px] min-h-[38px] rounded-xl bg-gray-800/80 hover:bg-gray-700 text-gray-400 hover:text-white text-xs cursor-pointer transition-colors"
                        title="Cancel recording"
                      >
                        ✕
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          voiceAssistant.stopListening();
                          setIsRecording(false);
                          const finalSpeech = voiceInterimTranscript.trim() || inputText.trim();
                          if (finalSpeech) {
                            handleSend(finalSpeech, true);
                          }
                        }}
                        className="bg-gradient-to-r from-red-600 via-rose-600 to-red-500 hover:from-red-500 hover:to-rose-400 text-white font-bold py-2 px-3.5 min-h-[38px] rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-red-600/40 cursor-pointer transition-transform hover:scale-105 active:scale-95"
                        title="Stop recording and send message"
                      >
                        <Square className="w-3.5 h-3.5 fill-white text-white" />
                        <span>Stop</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Full-Width Multiline Auto-Expanding Textarea */}
                    <textarea
                      ref={textareaRef}
                      rows={1}
                      value={inputText}
                      dir={isRtlLanguage(settings.uiLanguage, inputText) ? 'rtl' : 'ltr'}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder={t.inputPlaceholder || 'Message Aadesh AI...'}
                      aria-label="Message Aadesh AI"
                      className="w-full bg-transparent text-gray-100 placeholder-gray-400 text-sm sm:text-[15px] py-1 px-0.5 outline-none font-medium resize-none min-h-[36px] max-h-40 overflow-y-auto leading-relaxed"
                    />

                    {/* Bottom Action Toolbar inside Composer */}
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      {/* Left: File Attachment, Image Upload, Geotag */}
                      <div className="flex items-center gap-1.5">
                        <input
                          type="file"
                          ref={docFileInputRef}
                          onChange={handleDocumentSelect}
                          accept=".txt,.md,.json,.csv,.js,.ts,.tsx,.py,.html,.css,.xml,.yaml,.yml,.log"
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => docFileInputRef.current?.click()}
                          className={`min-w-[38px] min-h-[38px] p-2 rounded-xl transition-all border cursor-pointer flex items-center justify-center ${
                            selectedFile
                              ? 'bg-purple-900/70 text-purple-200 border-purple-400 shadow-sm'
                              : 'bg-[#181a29]/80 text-gray-300 border-white/10 hover:text-purple-300 hover:border-purple-500/40'
                          }`}
                          title="Attach document or code file"
                          aria-label="Attach file"
                        >
                          <Paperclip className="w-4 h-4" />
                        </button>

                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handlePhotoSelect}
                          accept="image/*"
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className={`min-w-[38px] min-h-[38px] p-2 rounded-xl transition-all border cursor-pointer flex items-center justify-center ${
                            selectedImage
                              ? 'bg-purple-900/70 text-purple-200 border-purple-400 shadow-sm'
                              : 'bg-[#181a29]/80 text-gray-300 border-white/10 hover:text-purple-300 hover:border-purple-500/40'
                          }`}
                          title="Upload image"
                          aria-label="Upload image"
                        >
                          <ImageIcon className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowGeotagModal(true)}
                          className={`min-w-[38px] min-h-[38px] p-2 rounded-xl transition-all border cursor-pointer flex items-center justify-center ${
                            attachedLocation
                              ? 'bg-purple-900/70 text-purple-200 border-purple-400 shadow-sm'
                              : 'bg-[#181a29]/80 text-gray-300 border-white/10 hover:text-purple-300 hover:border-purple-500/40'
                          }`}
                          title="Attach Geotag Location"
                          aria-label="Attach location"
                        >
                          <MapPin className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Right: Microphone & Send */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={toggleVoiceRecording}
                          className="min-w-[38px] min-h-[38px] p-2 rounded-xl transition-all cursor-pointer bg-[#181a29]/80 text-purple-300 border border-purple-500/30 hover:border-purple-400 hover:bg-purple-900/30 flex items-center justify-center"
                          title="Voice Input (Tap to speak)"
                          aria-label="Voice input"
                        >
                          <Mic className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSend()}
                          disabled={isLoading || (!inputText.trim() && !selectedImage && !selectedFile)}
                          aria-label="Send message"
                          className="purple-glow-btn text-white font-semibold min-w-[40px] min-h-[40px] px-3 sm:px-4 rounded-full sm:rounded-2xl flex items-center justify-center gap-1.5 text-xs sm:text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0"
                        >
                          {isLoading ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <span className="hidden sm:inline">Send</span>
                              <Send className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
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

      {/* Full-Screen Image Lightbox Overlay */}
      <ImageLightbox
        image={lightboxImage}
        onClose={() => setLightboxImage(null)}
      />

      {/* Quick Context Long-Press Floating Menu (AI Messages) */}
      {quickContextMenu && (
        <div
          data-quick-context-menu="true"
          role="menu"
          aria-label="AI Message Quick Context"
          style={{ left: `${quickContextMenu.x}px`, top: `${quickContextMenu.y}px` }}
          className="fixed z-50 w-62 glass-card rounded-2xl border border-purple-400/50 shadow-2xl p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-white/10">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-purple-200 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Quick Context</span>
            </div>
            <button
              type="button"
              onClick={() => setQuickContextMenu(null)}
              aria-label="Close Quick Context menu"
              className="text-gray-400 hover:text-white p-0.5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={handleQuickContextCopy}
            className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-gray-100 hover:bg-white/10 flex items-center gap-2.5 transition-colors cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5 text-purple-300 shrink-0" />
            <span>Copy text</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={handleQuickContextSummarize}
            className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-gray-100 hover:bg-white/10 flex items-center gap-2.5 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
            <span>Summarize Message</span>
            <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 font-semibold">
              Gemini
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => handleQuickContextSearch()}
            className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-gray-100 hover:bg-white/10 flex items-center gap-2.5 transition-colors cursor-pointer"
          >
            <Search className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span>Search related terms</span>
          </button>

          {quickContextMenu.relatedTerms.length > 0 && (
            <div className="px-2.5 pt-1.5 pb-1 border-t border-white/10 space-y-1.5">
              <div className="text-[10px] text-gray-400 font-medium">Detected keywords:</div>
              <div className="flex flex-wrap gap-1">
                {quickContextMenu.relatedTerms.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => handleQuickContextSearch(term)}
                    className="px-2 py-0.5 rounded-lg bg-[#090a0f] hover:bg-purple-900/50 border border-white/15 hover:border-purple-400/50 text-[10px] text-purple-200 font-medium transition-colors cursor-pointer"
                  >
                    #{term}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Gemini API Concise Message Summary Dialog */}
      {messageSummary && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => setMessageSummary(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Gemini Message Summary"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg glass-card rounded-3xl border border-purple-400/50 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-white/10 bg-[#0b0d17]/90 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Concise Message Summary</span>
                    {messageSummary.modelUsed && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-950/80 border border-purple-500/35 text-purple-200">
                        {messageSummary.modelUsed}
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    Generated via Gemini API
                    {typeof messageSummary.latencyMs === 'number' ? ` · ${messageSummary.latencyMs} ms` : ''}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMessageSummary(null)}
                aria-label="Close message summary"
                className="p-1.5 rounded-xl bg-[#131520] hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {messageSummary.isLoading ? (
                <div className="py-8 flex flex-col items-center justify-center gap-3 text-center">
                  <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-white">
                      Synthesizing concise summary with Gemini...
                    </p>
                    <p className="text-[11px] text-gray-400 max-w-xs truncate">
                      "{messageSummary.originalContent.slice(0, 90)}"
                    </p>
                  </div>
                </div>
              ) : messageSummary.error ? (
                <div className="p-4 rounded-2xl bg-rose-950/50 border border-rose-500/40 text-rose-100 text-xs space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">{messageSummary.error}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      summarizeMessageWithGemini(messageSummary.msgId, messageSummary.originalContent)
                    }
                    className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry Gemini Summary</span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="p-4 rounded-2xl bg-[#090a0f]/95 border border-purple-500/30 space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                      Summary
                    </div>
                    <p className="text-xs sm:text-sm text-gray-100 leading-relaxed">
                      {messageSummary.summary}
                    </p>
                  </div>

                  {messageSummary.keyPoints.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-purple-300 pl-1">
                        Key Takeaways
                      </div>
                      <ul className="space-y-1.5">
                        {messageSummary.keyPoints.map((pt, idx) => (
                          <li
                            key={idx}
                            className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#0d101b] border border-white/10 text-xs text-gray-200 leading-relaxed"
                          >
                            <span className="w-5 h-5 rounded-lg bg-purple-500/20 border border-purple-400/40 text-purple-200 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <span>{pt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer Actions */}
            {!messageSummary.isLoading && !messageSummary.error && (
              <div className="px-5 py-3.5 border-t border-white/10 bg-[#0b0d17]/90 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const fullText =
                        messageSummary.keyPoints.length > 0
                          ? `${messageSummary.summary}\n\nKey Takeaways:\n${messageSummary.keyPoints
                              .map((p) => `• ${p}`)
                              .join('\n')}`
                          : messageSummary.summary;
                      navigator.clipboard.writeText(fullText);
                      setMessageSummary((prev) => (prev ? { ...prev, copied: true } : prev));
                      setTimeout(() => {
                        setMessageSummary((prev) => (prev ? { ...prev, copied: false } : prev));
                      }, 1800);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#131520] hover:bg-purple-900/40 border border-purple-500/35 text-xs font-semibold text-gray-100 flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    {messageSummary.copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-300">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-purple-300" />
                        <span>Copy Summary</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const summarySpeech = [
                        messageSummary.summary,
                        ...messageSummary.keyPoints,
                      ].join('. ');
                      const speechLang = resolveMessageSpeechCode(summarySpeech);
                      handleSpeakMessage(`summary-${messageSummary.msgId}`, summarySpeech, speechLang);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#131520] hover:bg-purple-900/40 border border-purple-500/35 text-xs font-semibold text-gray-100 flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-purple-300" />
                    <span>Read Aloud ({(settings.voiceSpeed ?? 1).toFixed(2)}x)</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setMessageSummary(null)}
                  className="purple-glow-btn px-4 py-1.5 rounded-xl text-xs font-bold text-white cursor-pointer"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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
