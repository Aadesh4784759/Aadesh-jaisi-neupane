import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeftRight,
  Upload,
  Download,
  FileText,
  Image as ImageIcon,
  Share2,
  Send,
  Inbox,
  CheckCircle2,
  Info,
  Trash2,
  Sparkles,
  ShieldCheck,
  File as FileIcon,
  Radio,
  AlertCircle,
  Languages,
  Copy,
  Check,
  Volume2,
  Mic,
  MicOff,
  RefreshCw,
  Clock,
  MessageSquare,
} from 'lucide-react';
import { AppSettings, TransferHistoryEntry, TranslationHistoryEntry } from '../types';
import {
  getStoredTransferHistory,
  saveStoredTransferHistory,
  getStoredTranslationHistory,
  saveStoredTranslationHistory,
} from '../utils/storage';
import { SUPPORTED_LANGUAGES, isRtlLanguage } from '../data/languages';
import { voiceAssistant } from '../utils/speech';
import { getAuthHeaders } from '../utils/firebase';

interface QueuedFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  mimeType: string;
  lastModified: number;
  progress: number;
  status: 'reading' | 'ready' | 'shared' | 'error';
  sha256?: string;
  previewUrl?: string;
  textPreview?: string;
  arrayBuffer?: ArrayBuffer;
}

interface IncomingPeerFile {
  id: string;
  senderName: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  sha256?: string;
  buffer: ArrayBuffer;
  receivedAt: number;
}

interface TransferViewProps {
  userId: string;
  userName: string;
  settings?: AppSettings;
  isOnline?: boolean;
  onUpdateSettings?: (patch: Partial<AppSettings>) => void;
  onRecordTranslationMetric?: (sourceLang: string, targetLang: string, latencyMs: number) => void;
  onOpenInChat?: (text: string) => void;
  onAttachFileToChat?: (params: {
    name: string;
    mimeType: string;
    dataUrl?: string;
    textContent?: string;
  }) => void;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, idx);
  return `${value >= 10 || idx === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[idx]}`;
}

async function computeSha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return 'unavailable';
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const TransferView: React.FC<TransferViewProps> = ({
  userId,
  userName,
  settings,
  isOnline = true,
  onRecordTranslationMetric,
  onOpenInChat,
  onAttachFileToChat,
}) => {
  const [activeMode, setActiveMode] = useState<'translate' | 'send' | 'receive' | 'history'>('translate');

  // Translation Workspace State
  const [sourceLang, setSourceLang] = useState<string>('auto');
  const [targetLang, setTargetLang] = useState<string>(settings?.defaultTargetLanguage || 'ne');
  const [sourceText, setSourceText] = useState<string>('');
  const [translatedText, setTranslatedText] = useState<string>('');
  const [detectedSourceLang, setDetectedSourceLang] = useState<string>('');
  const [pronunciation, setPronunciation] = useState<string>('');
  const [culturalNote, setCulturalNote] = useState<string>('');
  const [translationLatency, setTranslationLatency] = useState<number | null>(null);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [isVoiceListening, setIsVoiceListening] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [translationHistory, setTranslationHistory] = useState<TranslationHistoryEntry[]>(() =>
    getStoredTranslationHistory(userId)
  );

  // File Transfer State
  const [queuedFiles, setQueuedFiles] = useState<QueuedFileItem[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [incomingFiles, setIncomingFiles] = useState<IncomingPeerFile[]>([]);
  const [history, setHistory] = useState<TransferHistoryEntry[]>(() => getStoredTransferHistory(userId));
  const [statusNotice, setStatusNotice] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const anyFileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const receiveInputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const supportsWebShareFiles =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function';

  useEffect(() => {
    setHistory(getStoredTransferHistory(userId));
    setTranslationHistory(getStoredTranslationHistory(userId));
  }, [userId]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel('aadesh_ai_transfer_channel');
    channelRef.current = ch;

    ch.onmessage = (event) => {
      const msg = event.data;
      if (!msg || msg.type !== 'AADESH_FILE_TRANSFER' || !msg.buffer) return;
      const incoming: IncomingPeerFile = {
        id: msg.id || `rx-${Date.now()}`,
        senderName: msg.senderName || 'Another Aadesh AI Tab',
        fileName: msg.fileName || 'received-file',
        fileSize: msg.fileSize || msg.buffer.byteLength || 0,
        mimeType: msg.mimeType || 'application/octet-stream',
        sha256: msg.sha256,
        buffer: msg.buffer,
        receivedAt: Date.now(),
      };
      setIncomingFiles((prev) => [incoming, ...prev]);
      appendHistory({
        id: incoming.id,
        fileName: incoming.fileName,
        fileSize: incoming.fileSize,
        mimeType: incoming.mimeType,
        direction: 'received',
        method: 'Cross-Tab Channel',
        sha256: incoming.sha256,
        timestamp: Date.now(),
        status: 'completed',
      });
      setStatusNotice({
        type: 'success',
        text: `Received "${incoming.fileName}" from ${incoming.senderName}. Ready in Receive.`,
      });
    };

    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, [userId]);

  const appendHistory = (entry: TransferHistoryEntry) => {
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, 60);
      saveStoredTransferHistory(next, userId);
      return next;
    });
  };

  const handleRunTranslation = async (textOverride?: string, isVoice = false) => {
    const cleanText = (textOverride ?? sourceText).trim();
    if (!cleanText || isTranslating) return;

    if (!isOnline) {
      setStatusNotice({
        type: 'error',
        text: 'Translation requires an active internet connection for Gemini AI.',
      });
      return;
    }

    setIsTranslating(true);
    setStatusNotice(null);

    try {
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
        ...(settings?.customGeminiApiKey ? { 'x-gemini-api-key': settings.customGeminiApiKey } : {}),
      });

      const res = await fetch('/api/translate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: cleanText,
          sourceLang,
          targetLang,
          customApiKey: settings?.customGeminiApiKey,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Translation failed (HTTP ${res.status})`);
      }

      const resultText = String(data.translatedText || '').trim();
      const detected = String(data.detectedSourceLang || (sourceLang === 'auto' ? 'en' : sourceLang)).trim();
      const latencyMs = Number(data.latencyMs || 280);

      setTranslatedText(resultText);
      setDetectedSourceLang(detected);
      setPronunciation(String(data.pronunciation || ''));
      setCulturalNote(String(data.culturalNote || ''));
      setTranslationLatency(latencyMs);

      const historyEntry: TranslationHistoryEntry = {
        id: `tr-${Date.now()}`,
        sourceText: cleanText,
        translatedText: resultText,
        sourceLang,
        detectedSourceLang: detected,
        targetLang,
        pronunciation: data.pronunciation ? String(data.pronunciation) : undefined,
        culturalNote: data.culturalNote ? String(data.culturalNote) : undefined,
        timestamp: Date.now(),
        isVoice,
      };

      setTranslationHistory((prev) => {
        const next = [historyEntry, ...prev].slice(0, 80);
        saveStoredTranslationHistory(next, userId);
        return next;
      });

      onRecordTranslationMetric?.(detected, targetLang, latencyMs);

      if (isVoice && settings?.autoSpeakAIResponses && resultText) {
        const tgtObj = SUPPORTED_LANGUAGES.find((l) => l.code === targetLang) || SUPPORTED_LANGUAGES[0];
        voiceAssistant.speak(resultText, tgtObj.speechCode, {
          rate: settings?.voiceSpeed ?? 1.0,
          pitch: settings?.voicePitch ?? 1.0,
          volume: settings?.voiceVolume ?? 1.0,
        });
      }
    } catch (err: any) {
      setStatusNotice({
        type: 'error',
        text: err?.message || 'Unable to translate right now.',
      });
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSwapLanguages = () => {
    const resolvedSource =
      sourceLang === 'auto'
        ? detectedSourceLang || (targetLang === 'en' ? 'ne' : 'en')
        : sourceLang;
    const nextSource = targetLang;
    const nextTarget = resolvedSource;

    setSourceLang(nextSource);
    setTargetLang(nextTarget);
    if (translatedText.trim()) {
      setSourceText(translatedText);
      setTranslatedText(sourceText);
    }
    setDetectedSourceLang('');
  };

  const handleToggleVoiceTranslation = () => {
    if (isVoiceListening) {
      voiceAssistant.stopListening();
      setIsVoiceListening(false);
      return;
    }

    if (!voiceAssistant.isSupported()) {
      setStatusNotice({
        type: 'info',
        text: 'Browser speech recognition is unavailable here. Type text or use the Voice Studio audio recorder.',
      });
      return;
    }

    const activeSrcCode = sourceLang === 'auto' ? settings?.uiLanguage || 'en' : sourceLang;
    const srcLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === activeSrcCode) || SUPPORTED_LANGUAGES[0];

    const started = voiceAssistant.startListening(srcLangObj.speechCode, {
      onStart: () => setIsVoiceListening(true),
      onResult: (transcript, isFinal) => {
        setSourceText(transcript);
        if (isFinal && transcript.trim()) {
          setIsVoiceListening(false);
          void handleRunTranslation(transcript.trim(), true);
        }
      },
      onError: (err) => {
        setIsVoiceListening(false);
        setStatusNotice({ type: 'error', text: err });
      },
      onEnd: () => setIsVoiceListening(false),
    });

    if (!started) {
      setIsVoiceListening(false);
    }
  };

  const handleSpeakText = (text: string, langCode: string) => {
    if (!text.trim()) return;
    if (!voiceAssistant.isSpeechSynthesisSupported()) {
      setStatusNotice({
        type: 'info',
        text: 'Browser Text-to-Speech is not supported on this device.',
      });
      return;
    }
    const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === langCode) || SUPPORTED_LANGUAGES[0];
    voiceAssistant.speak(text, langObj.speechCode, {
      rate: settings?.voiceSpeed ?? 1.0,
      pitch: settings?.voicePitch ?? 1.0,
      volume: settings?.voiceVolume ?? 1.0,
    });
  };

  const handleCopy = (id: string, value: string) => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1600);
  };

  const processSelectedFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    files.forEach((file) => {
      const itemId = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const initialItem: QueuedFileItem = {
        id: itemId,
        file,
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        lastModified: file.lastModified || Date.now(),
        progress: 0,
        status: 'reading',
      };

      setQueuedFiles((prev) => [initialItem, ...prev]);
      setSelectedFileId(itemId);

      const reader = new FileReader();
      reader.onprogress = (ev) => {
        if (ev.lengthComputable && ev.total > 0) {
          const pct = Math.min(98, Math.round((ev.loaded / ev.total) * 100));
          setQueuedFiles((prev) =>
            prev.map((q) => (q.id === itemId ? { ...q, progress: pct } : q))
          );
        }
      };

      reader.onerror = () => {
        setQueuedFiles((prev) =>
          prev.map((q) => (q.id === itemId ? { ...q, status: 'error' } : q))
        );
      };

      reader.onload = async (ev) => {
        const buffer = ev.target?.result as ArrayBuffer;
        if (!buffer) return;
        const sha256 = await computeSha256Hex(buffer);

        let previewUrl: string | undefined;
        let textPreview: string | undefined;

        if (file.type.startsWith('image/') && file.size <= 8 * 1024 * 1024) {
          previewUrl = URL.createObjectURL(file);
        } else if (
          (file.type.startsWith('text/') ||
            /\.(txt|md|json|csv|ts|tsx|js|py|html|css|xml)$/i.test(file.name)) &&
          file.size <= 250 * 1024
        ) {
          try {
            textPreview = new TextDecoder().decode(buffer).slice(0, 6000);
          } catch {}
        }

        setQueuedFiles((prev) =>
          prev.map((q) =>
            q.id === itemId
              ? {
                  ...q,
                  progress: 100,
                  status: 'ready',
                  sha256,
                  previewUrl,
                  textPreview,
                  arrayBuffer: buffer,
                }
              : q
          )
        );
      };

      reader.readAsArrayBuffer(file);
    });
  };

  const selectedItem = queuedFiles.find((q) => q.id === selectedFileId) || queuedFiles[0] || null;

  const handleWebShare = async (item: QueuedFileItem) => {
    if (!supportsWebShareFiles) {
      setStatusNotice({
        type: 'info',
        text: 'Web Share Sheet with files is not supported in this browser. Use Save Copy or Cross-Tab Send.',
      });
      return;
    }

    try {
      const shareData = {
        files: [item.file],
        title: item.name,
        text: `Shared via Aadesh AI Transfer (${formatBytes(item.size)})`,
      };
      if (!navigator.canShare(shareData)) {
        setStatusNotice({
          type: 'info',
          text: 'Your device browser restricts sharing this specific file type via Web Share.',
        });
        return;
      }
      await navigator.share(shareData);
      setQueuedFiles((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: 'shared' } : q))
      );
      appendHistory({
        id: `sh-${Date.now()}`,
        fileName: item.name,
        fileSize: item.size,
        mimeType: item.mimeType,
        direction: 'shared',
        method: 'Device Web Share',
        sha256: item.sha256,
        timestamp: Date.now(),
        status: 'completed',
      });
      setStatusNotice({ type: 'success', text: `Shared "${item.name}" via device Share Sheet.` });
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setStatusNotice({ type: 'error', text: err?.message || 'Share cancelled or failed.' });
      }
    }
  };

  const handleBroadcastSend = (item: QueuedFileItem) => {
    if (!channelRef.current || !item.arrayBuffer) {
      setStatusNotice({
        type: 'error',
        text: 'Cross-tab peer channel is unavailable in this browser context.',
      });
      return;
    }
    channelRef.current.postMessage({
      type: 'AADESH_FILE_TRANSFER',
      id: `tx-${Date.now()}`,
      senderName: userName || 'Aadesh AI User',
      fileName: item.name,
      fileSize: item.size,
      mimeType: item.mimeType,
      sha256: item.sha256,
      buffer: item.arrayBuffer,
    });
    setQueuedFiles((prev) =>
      prev.map((q) => (q.id === item.id ? { ...q, status: 'shared' } : q))
    );
    appendHistory({
      id: `bc-${Date.now()}`,
      fileName: item.name,
      fileSize: item.size,
      mimeType: item.mimeType,
      direction: 'sent',
      method: 'Cross-Tab Channel',
      sha256: item.sha256,
      timestamp: Date.now(),
      status: 'completed',
    });
    setStatusNotice({
      type: 'success',
      text: `Broadcasted "${item.name}" to open Aadesh AI browser tabs.`,
    });
  };

  const handleDownloadFile = (
    name: string,
    mimeType: string,
    source: File | ArrayBuffer,
    size: number,
    sha256?: string
  ) => {
    const blob = source instanceof File ? source : new Blob([source], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);

    appendHistory({
      id: `dl-${Date.now()}`,
      fileName: name,
      fileSize: size,
      mimeType,
      direction: 'downloaded',
      method: 'Local Export',
      sha256,
      timestamp: Date.now(),
      status: 'completed',
    });
    setStatusNotice({ type: 'success', text: `Downloaded "${name}" to your device.` });
  };

  const handleImportReceiveFile = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    for (const file of Array.from(fileList)) {
      const buffer = await file.arrayBuffer();
      const sha256 = await computeSha256Hex(buffer);
      const item: IncomingPeerFile = {
        id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        senderName: 'Imported from Device',
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        sha256,
        buffer,
        receivedAt: Date.now(),
      };
      setIncomingFiles((prev) => [item, ...prev]);
      appendHistory({
        id: item.id,
        fileName: item.fileName,
        fileSize: item.fileSize,
        mimeType: item.mimeType,
        direction: 'received',
        method: 'Device Import',
        sha256,
        timestamp: Date.now(),
        status: 'completed',
      });
    }
    setStatusNotice({ type: 'success', text: 'Imported file(s) into Receive inbox & verified SHA-256.' });
  };

  const handleSendToAIChat = (item: QueuedFileItem) => {
    if (!onAttachFileToChat) return;
    if (item.file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        onAttachFileToChat({
          name: item.name,
          mimeType: item.mimeType,
          dataUrl: String(e.target?.result || ''),
        });
      };
      reader.readAsDataURL(item.file);
      return;
    }
    onAttachFileToChat({
      name: item.name,
      mimeType: item.mimeType,
      textContent:
        item.textPreview ||
        `File Metadata — Name: ${item.name}, Type: ${item.mimeType}, Size: ${formatBytes(item.size)}, SHA-256: ${item.sha256 || 'N/A'}`,
    });
  };

  const sourceLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === sourceLang);
  const targetLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === targetLang) || SUPPORTED_LANGUAGES[1];
  const detectedLangObj = detectedSourceLang
    ? SUPPORTED_LANGUAGES.find((l) => l.code === detectedSourceLang)
    : undefined;

  return (
    <div className="max-w-5xl mx-auto w-full px-3 sm:px-6 py-5 pb-32 space-y-5">
      {/* Transfer & Translation Header */}
      <div className="v2-neu-card rounded-3xl p-5 sm:p-6 border border-purple-400/30 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-300">
            <ArrowLeftRight className="w-4 h-4 text-sky-400" />
            <span>Aadesh AI · Language &amp; File Transfer</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white">Transfer Studio</h1>
          <p className="text-xs text-purple-200/75">
            Real-time text &amp; voice translation across global languages, plus SHA-256 verified file transfer.
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="inline-flex flex-wrap p-1 rounded-2xl v2-neu-inset gap-1 self-start lg:self-center">
          {(
            [
              { id: 'translate', label: 'AI Translator', icon: Languages },
              { id: 'send', label: 'Send Files', icon: Send },
              { id: 'receive', label: `Receive (${incomingFiles.length})`, icon: Inbox },
              { id: 'history', label: `File Log (${history.length})`, icon: Download },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveMode(tab.id)}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  active
                    ? 'electric-purple-btn text-white'
                    : 'text-purple-200/75 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Status Notice */}
      {statusNotice && (
        <div
          className={`rounded-2xl px-4 py-3 text-xs font-medium flex items-center justify-between gap-2 border ${
            statusNotice.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-400/40 text-emerald-100'
              : statusNotice.type === 'error'
              ? 'bg-rose-950/60 border-rose-400/40 text-rose-100'
              : 'bg-purple-950/70 border-purple-400/40 text-purple-100'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : statusNotice.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-sky-300 shrink-0" />
            )}
            <span>{statusNotice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="text-xs underline opacity-80 hover:opacity-100 cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Hidden File Pickers */}
      <input
        ref={anyFileInputRef}
        type="file"
        multiple
        onChange={(e) => {
          processSelectedFiles(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        ref={docInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,.xml,.yaml,.yml,.ts,.js,.py"
        onChange={(e) => {
          processSelectedFiles(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        ref={imageInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={(e) => {
          processSelectedFiles(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        ref={receiveInputRef}
        type="file"
        multiple
        onChange={(e) => {
          void handleImportReceiveFile(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* TRANSLATION WORKSPACE */}
      {activeMode === 'translate' && (
        <div className="space-y-5">
          <div className="v2-neu-card rounded-3xl p-5 sm:p-6 border border-sky-400/30 space-y-4">
            {/* Language Controls Row */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="flex-1 space-y-1">
                <label className="text-[11px] font-bold text-sky-200 uppercase tracking-wider pl-1">
                  Source Language
                </label>
                <select
                  aria-label="Source language"
                  value={sourceLang}
                  onChange={(e) => setSourceLang(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl v2-neu-inset text-xs sm:text-sm font-semibold text-white outline-none cursor-pointer"
                >
                  <option value="auto" className="bg-[#120e24]">
                    ✨ Auto-Detect Language
                  </option>
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code} className="bg-[#120e24]">
                      {l.flag} {l.name} ({l.nativeName})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end justify-center pt-1 sm:pt-5">
                <button
                  type="button"
                  onClick={handleSwapLanguages}
                  title="Swap languages"
                  aria-label="Swap source and target languages"
                  className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-600/35 to-sky-500/35 hover:from-purple-600/55 hover:to-sky-500/55 border border-sky-400/40 text-white flex items-center justify-center cursor-pointer transition-transform active:scale-95"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 space-y-1">
                <label className="text-[11px] font-bold text-purple-200 uppercase tracking-wider pl-1">
                  Target Language
                </label>
                <select
                  aria-label="Target language"
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl v2-neu-inset text-xs sm:text-sm font-semibold text-white outline-none cursor-pointer"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code} className="bg-[#120e24]">
                      {l.flag} {l.name} ({l.nativeName})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dual Translation Panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Source Panel */}
              <div className="v2-neu-inset rounded-2xl p-4 flex flex-col justify-between gap-3 border border-purple-400/20">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-purple-200 flex items-center gap-1.5">
                    <span>{sourceLang === 'auto' ? '✨' : sourceLangObj?.flag}</span>
                    <span>
                      {sourceLang === 'auto'
                        ? detectedLangObj
                          ? `Auto-Detected: ${detectedLangObj.flag} ${detectedLangObj.name}`
                          : 'Automatic Language Detection'
                        : sourceLangObj?.name}
                    </span>
                  </span>

                  {sourceText && (
                    <button
                      type="button"
                      onClick={() => {
                        setSourceText('');
                        setTranslatedText('');
                        setDetectedSourceLang('');
                        setPronunciation('');
                        setCulturalNote('');
                      }}
                      className="text-[11px] text-purple-300 hover:text-white cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <textarea
                  rows={5}
                  value={sourceText}
                  dir={isRtlLanguage(sourceLang === 'auto' ? detectedSourceLang : sourceLang, sourceText) ? 'rtl' : 'ltr'}
                  onChange={(e) => setSourceText(e.target.value)}
                  placeholder="Type, paste, or tap the microphone below to speak & translate..."
                  className="w-full bg-transparent text-sm sm:text-base text-white placeholder-purple-300/45 outline-none resize-none leading-relaxed"
                />

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleToggleVoiceTranslation}
                      className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border transition-all ${
                        isVoiceListening
                          ? 'bg-rose-600 border-rose-300 text-white animate-pulse'
                          : 'bg-white/5 hover:bg-white/10 border-purple-400/30 text-purple-100'
                      }`}
                    >
                      {isVoiceListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-sky-400" />}
                      <span>{isVoiceListening ? 'Listening...' : 'Voice Input'}</span>
                    </button>

                    {sourceText.trim() && (
                      <button
                        type="button"
                        onClick={() =>
                          handleSpeakText(
                            sourceText,
                            sourceLang === 'auto' ? detectedSourceLang || 'en' : sourceLang
                          )
                        }
                        title="Listen to source text"
                        className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-purple-200 cursor-pointer"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-purple-300/70 tabular-nums">
                      {sourceText.length} chars
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleRunTranslation()}
                      disabled={isTranslating || !sourceText.trim()}
                      className="electric-purple-btn min-h-[38px] px-4 py-1.5 rounded-xl text-xs font-extrabold text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-45"
                    >
                      {isTranslating ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      <span>{isTranslating ? 'Translating...' : 'Translate'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Translated Result Panel */}
              <div className="rounded-2xl p-4 bg-gradient-to-br from-indigo-950/60 via-purple-950/55 to-sky-950/55 border border-sky-400/30 flex flex-col justify-between gap-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-sky-200 flex items-center gap-1.5">
                    <span>{targetLangObj.flag}</span>
                    <span>{targetLangObj.name}</span>
                  </span>
                  {translationLatency !== null && translatedText && (
                    <span className="text-[10px] font-mono text-sky-300/80 tabular-nums">
                      {translationLatency} ms
                    </span>
                  )}
                </div>

                <div
                  dir={isRtlLanguage(targetLang, translatedText) ? 'rtl' : 'ltr'}
                  className="min-h-[120px] text-sm sm:text-base text-white leading-relaxed whitespace-pre-wrap"
                >
                  {isTranslating ? (
                    <div className="flex items-center gap-2 text-xs text-sky-200/80 py-6">
                      <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                      <span>Synthesizing natural translation with Gemini...</span>
                    </div>
                  ) : translatedText ? (
                    translatedText
                  ) : (
                    <span className="text-xs text-purple-200/50">
                      Your translation will appear here with pronunciation &amp; voice playback.
                    </span>
                  )}
                </div>

                {(pronunciation || culturalNote) && translatedText && (
                  <div className="space-y-1.5 pt-2 border-t border-white/10 text-[11px]">
                    {pronunciation && (
                      <div className="text-sky-200">
                        <strong className="text-sky-300">Pronunciation:</strong> {pronunciation}
                      </div>
                    )}
                    {culturalNote && (
                      <div className="text-purple-200/85">
                        <strong className="text-purple-300">Context Note:</strong> {culturalNote}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={!translatedText}
                      onClick={() => handleCopy('translated', translatedText)}
                      className="min-h-[36px] px-3 py-1 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                    >
                      {copiedId === 'translated' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-sky-300" />
                      )}
                      <span>{copiedId === 'translated' ? 'Copied' : 'Copy'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={!translatedText}
                      onClick={() => handleSpeakText(translatedText, targetLang)}
                      className="min-h-[36px] px-3 py-1 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                    >
                      <Volume2 className="w-3.5 h-3.5 text-sky-300" />
                      <span>Listen</span>
                    </button>
                  </div>

                  {onOpenInChat && translatedText && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenInChat(
                          `Please expand on this translation (${targetLangObj.name}):\n"${translatedText}"`
                        )
                      }
                      className="min-h-[36px] px-3 py-1 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400/35 text-xs font-bold text-purple-100 flex items-center gap-1.5 cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-sky-300" />
                      <span>Ask Chat</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Translation History */}
          <div className="v2-neu-card rounded-3xl p-5 border border-purple-400/25 space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm font-bold text-white">
                  Translation History ({translationHistory.length})
                </h2>
              </div>
              {translationHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setTranslationHistory([]);
                    saveStoredTranslationHistory([], userId);
                  }}
                  className="text-xs text-rose-300 hover:text-rose-200 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear History</span>
                </button>
              )}
            </div>

            {translationHistory.length === 0 ? (
              <p className="text-xs text-purple-200/65 text-center py-6">
                Completed text &amp; voice translations will be saved here automatically.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                <AnimatePresence>
                  {translationHistory.map((item) => {
                    const fromObj = SUPPORTED_LANGUAGES.find(
                      (l) => l.code === (item.detectedSourceLang || item.sourceLang)
                    );
                    const toObj = SUPPORTED_LANGUAGES.find((l) => l.code === item.targetLang);
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="p-3.5 rounded-2xl v2-neu-inset flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-sky-300">
                            <span>
                              {fromObj?.flag || '🌐'} {fromObj?.name || item.detectedSourceLang || 'Auto'} →{' '}
                              {toObj?.flag || '🌐'} {toObj?.name || item.targetLang}
                            </span>
                            {item.isVoice && (
                              <span className="px-1.5 py-0.5 rounded bg-purple-500/25 border border-purple-400/35 text-purple-200">
                                Voice
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-purple-200/80 truncate">{item.sourceText}</p>
                          <p
                            dir={isRtlLanguage(item.targetLang, item.translatedText) ? 'rtl' : 'ltr'}
                            className="text-xs sm:text-sm font-semibold text-white break-words"
                          >
                            {item.translatedText}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleSpeakText(item.translatedText, item.targetLang)}
                            title="Listen"
                            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-sky-300 cursor-pointer"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopy(item.id, item.translatedText)}
                            title="Copy translation"
                            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-purple-200 cursor-pointer"
                          >
                            {copiedId === item.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSourceLang(item.sourceLang || 'auto');
                              setTargetLang(item.targetLang);
                              setSourceText(item.sourceText);
                              setTranslatedText(item.translatedText);
                              setDetectedSourceLang(item.detectedSourceLang || '');
                              setPronunciation(item.pronunciation || '');
                              setCulturalNote(item.culturalNote || '');
                            }}
                            title="Load into translator"
                            className="px-2.5 py-1.5 rounded-xl bg-purple-600/25 hover:bg-purple-600/45 border border-purple-400/35 text-[11px] font-bold text-purple-100 cursor-pointer"
                          >
                            Load
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      )}

      {activeMode === 'send' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Dropzone + Quick Share Pickers + Progress Queue */}
          <div className="lg:col-span-7 space-y-4">
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => anyFileInputRef.current?.click()}
                className="v2-neu-card glass-card-hover min-h-[76px] p-3 rounded-2xl border border-purple-400/25 flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center"
              >
                <Upload className="w-5 h-5 text-sky-300" />
                <span className="text-xs font-bold text-white whitespace-nowrap">Upload Files</span>
              </button>

              <button
                type="button"
                onClick={() => docInputRef.current?.click()}
                className="v2-neu-card glass-card-hover min-h-[76px] p-3 rounded-2xl border border-purple-400/25 flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center"
              >
                <FileText className="w-5 h-5 text-purple-300" />
                <span className="text-xs font-bold text-white whitespace-nowrap">Share Docs</span>
              </button>

              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="v2-neu-card glass-card-hover min-h-[76px] p-3 rounded-2xl border border-purple-400/25 flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center"
              >
                <ImageIcon className="w-5 h-5 text-indigo-300" />
                <span className="text-xs font-bold text-white whitespace-nowrap">Share Images</span>
              </button>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                processSelectedFiles(e.dataTransfer.files);
              }}
              onClick={() => anyFileInputRef.current?.click()}
              className={`v2-neu-card rounded-3xl p-6 sm:p-8 border-2 border-dashed text-center cursor-pointer transition-all space-y-2 ${
                isDragging
                  ? 'border-sky-400 bg-purple-900/30 scale-[1.01]'
                  : 'border-purple-400/35 hover:border-sky-400/70'
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500/25 to-purple-500/25 border border-sky-400/40 flex items-center justify-center mx-auto">
                <Upload className="w-6 h-6 text-sky-300" />
              </div>
              <h2 className="text-sm sm:text-base font-bold text-white">
                Drop files here or tap to browse
              </h2>
              <p className="text-xs text-purple-200/70">
                Computes SHA-256 verification, shows real transfer progress, and prepares device sharing or cross-tab delivery.
              </p>
            </div>

            <div className="v2-neu-card rounded-3xl p-4 sm:p-5 border border-purple-400/25 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">
                  Transfer Progress ({queuedFiles.length})
                </h3>
                {queuedFiles.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      queuedFiles.forEach((f) => {
                        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
                      });
                      setQueuedFiles([]);
                      setSelectedFileId(null);
                    }}
                    className="text-xs text-purple-300 hover:text-white cursor-pointer"
                  >
                    Clear Queue
                  </button>
                )}
              </div>

              {queuedFiles.length === 0 ? (
                <p className="text-xs text-purple-200/60 py-4 text-center">
                  Select files above to inspect metadata, compute checksums, and transfer.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {queuedFiles.map((item) => {
                    const isSelected = selectedItem?.id === item.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedFileId(item.id)}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                          isSelected
                            ? 'bg-purple-900/35 border-sky-400/60'
                            : 'v2-neu-inset hover:border-purple-400/35'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {item.previewUrl ? (
                              <img
                                src={item.previewUrl}
                                alt={item.name}
                                className="w-9 h-9 rounded-xl object-cover border border-purple-400/30 shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center shrink-0">
                                <FileIcon className="w-4 h-4 text-sky-300" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white truncate">{item.name}</div>
                              <div className="text-[11px] text-purple-200/70 tabular-nums">
                                {formatBytes(item.size)} · {item.status.toUpperCase()}
                              </div>
                            </div>
                          </div>

                          <span className="text-xs font-mono font-bold text-sky-300 tabular-nums shrink-0">
                            {item.progress}%
                          </span>
                        </div>

                        <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                          <div
                            style={{ width: `${item.progress}%` }}
                            className={`h-full rounded-full transition-all duration-200 ${
                              item.status === 'error'
                                ? 'bg-rose-500'
                                : 'bg-gradient-to-r from-purple-500 via-indigo-400 to-sky-400'
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="v2-neu-card rounded-3xl p-5 border border-purple-400/30 space-y-4 sticky top-20">
              <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                <Info className="w-4 h-4 text-sky-300" />
                <h3 className="text-sm font-bold text-white">File Information &amp; Actions</h3>
              </div>

              {!selectedItem ? (
                <div className="py-10 text-center space-y-2 text-xs text-purple-200/65">
                  <ShieldCheck className="w-8 h-8 text-sky-400/60 mx-auto" />
                  <p>Select any uploaded file to view detailed metadata, SHA-256 fingerprint, and transfer options.</p>
                </div>
              ) : (
                <>
                  {selectedItem.previewUrl && (
                    <div className="rounded-2xl overflow-hidden border border-purple-400/30 bg-black/30 max-h-48 flex items-center justify-center">
                      <img
                        src={selectedItem.previewUrl}
                        alt={selectedItem.name}
                        className="max-h-48 w-full object-contain"
                      />
                    </div>
                  )}

                  {selectedItem.textPreview && (
                    <pre className="p-3 rounded-2xl bg-[#090614] border border-white/10 text-[11px] font-mono text-purple-100 max-h-36 overflow-auto whitespace-pre-wrap">
                      {selectedItem.textPreview}
                    </pre>
                  )}

                  <dl className="space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2 py-1 border-b border-white/5">
                      <dt className="text-purple-200/70">File Name</dt>
                      <dd className="font-semibold text-white truncate max-w-[200px]">{selectedItem.name}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 py-1 border-b border-white/5">
                      <dt className="text-purple-200/70">Size</dt>
                      <dd className="font-mono text-white tabular-nums">
                        {formatBytes(selectedItem.size)} ({selectedItem.size.toLocaleString()} B)
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 py-1 border-b border-white/5">
                      <dt className="text-purple-200/70">MIME Type</dt>
                      <dd className="font-mono text-purple-200 truncate max-w-[200px]">{selectedItem.mimeType}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 py-1 border-b border-white/5">
                      <dt className="text-purple-200/70">Modified</dt>
                      <dd className="text-purple-100 tabular-nums">
                        {new Date(selectedItem.lastModified).toLocaleString()}
                      </dd>
                    </div>
                    <div className="py-1 space-y-1">
                      <dt className="text-purple-200/70">SHA-256 Checksum</dt>
                      <dd className="font-mono text-[10px] text-sky-300 break-all bg-[#090614] p-2 rounded-xl border border-white/10">
                        {selectedItem.sha256 || 'Computing...'}
                      </dd>
                    </div>
                  </dl>

                  <div className="space-y-2 pt-2">
                    <button
                      type="button"
                      disabled={selectedItem.status !== 'ready' && selectedItem.status !== 'shared'}
                      onClick={() => handleWebShare(selectedItem)}
                      className="electric-purple-btn w-full min-h-[44px] px-4 py-2.5 rounded-2xl text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-45"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>
                        {supportsWebShareFiles ? 'Send via Device Share Sheet' : 'Device Share (Browser Limited)'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={selectedItem.status !== 'ready' && selectedItem.status !== 'shared'}
                      onClick={() => handleBroadcastSend(selectedItem)}
                      className="w-full min-h-[42px] px-4 py-2 rounded-2xl bg-purple-600/25 hover:bg-purple-600/45 border border-purple-400/40 text-purple-100 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-45"
                    >
                      <Radio className="w-4 h-4 text-sky-300" />
                      <span>Send to Open Aadesh AI Tab</span>
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleDownloadFile(
                            selectedItem.name,
                            selectedItem.mimeType,
                            selectedItem.file,
                            selectedItem.size,
                            selectedItem.sha256
                          )
                        }
                        className="min-h-[40px] px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-sky-300" />
                        <span>Save Copy</span>
                      </button>

                      {onAttachFileToChat && (
                        <button
                          type="button"
                          onClick={() => handleSendToAIChat(selectedItem)}
                          className="min-h-[40px] px-3 py-2 rounded-xl bg-white/5 hover:bg-purple-500/25 border border-white/15 hover:border-purple-400/45 text-xs font-semibold text-purple-200 flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                          <span>Ask AI</span>
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {activeMode === 'receive' && (
        <div className="v2-neu-card rounded-3xl p-5 sm:p-6 border border-purple-400/30 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <Inbox className="w-5 h-5 text-sky-400" />
                <span>Receive Files</span>
              </h2>
              <p className="text-xs text-purple-200/75 mt-0.5">
                Listening live for transfers from other open Aadesh AI browser tabs, or import local files to inspect and save.
              </p>
            </div>
            <button
              type="button"
              onClick={() => receiveInputRef.current?.click()}
              className="electric-purple-btn min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-2 cursor-pointer whitespace-nowrap self-start"
            >
              <Upload className="w-4 h-4" />
              <span>Import File to Verify</span>
            </button>
          </div>

          {incomingFiles.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Radio className="w-10 h-10 text-sky-400/60 mx-auto animate-pulse" />
              <div className="text-sm font-bold text-white">Ready to Receive</div>
              <p className="text-xs text-purple-200/70 max-w-md mx-auto">
                Open Aadesh AI in another tab/window and send a file via Cross-Tab Channel, or tap "Import File to Verify" above.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {incomingFiles.map((rx) => (
                <div
                  key={rx.id}
                  className="p-4 rounded-2xl v2-neu-inset border border-purple-400/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="text-sm font-bold text-white truncate">{rx.fileName}</div>
                    <div className="text-xs text-purple-200/75 tabular-nums">
                      From {rx.senderName} · {formatBytes(rx.fileSize)} · {new Date(rx.receivedAt).toLocaleTimeString()}
                    </div>
                    {rx.sha256 && (
                      <div className="text-[10px] font-mono text-sky-300/80 truncate">
                        SHA-256: {rx.sha256}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadFile(rx.fileName, rx.mimeType, rx.buffer, rx.fileSize, rx.sha256)
                    }
                    className="electric-purple-btn min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download File</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeMode === 'history' && (
        <div className="v2-neu-card rounded-3xl p-5 sm:p-6 border border-purple-400/30 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Download &amp; Transfer History</h2>
              <p className="text-xs text-purple-200/70">Saved locally for your account across sessions.</p>
            </div>
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setHistory([]);
                  saveStoredTransferHistory([], userId);
                }}
                className="px-3 py-1.5 rounded-xl bg-rose-950/50 hover:bg-rose-900/60 border border-rose-400/30 text-rose-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Log</span>
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="py-12 text-center text-xs text-purple-200/65">
              No transfers or downloads recorded yet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="p-3.5 rounded-2xl v2-neu-inset flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/35 text-purple-200">
                        {entry.direction}
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-white truncate">
                        {entry.fileName}
                      </span>
                    </div>
                    <div className="text-[11px] text-purple-200/70 mt-1 tabular-nums">
                      {formatBytes(entry.fileSize)} · {entry.method} ·{' '}
                      {new Date(entry.timestamp).toLocaleString()}
                    </div>
                  </div>

                  {entry.sha256 && (
                    <span className="text-[10px] font-mono text-sky-300/80 shrink-0">
                      #{entry.sha256.slice(0, 12)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
