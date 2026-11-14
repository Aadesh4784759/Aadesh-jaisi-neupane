import React, { useState, useEffect } from 'react';
import {
  Settings,
  Languages,
  Mic,
  Volume2,
  SunMoon,
  Type,
  Wifi,
  WifiOff,
  Database,
  Trash2,
  BookOpen,
  X,
  Play,
  Check,
  Search,
  Sparkles,
  Wind,
  Zap,
  Briefcase,
  Smile,
  KeyRound,
  Cpu,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Download,
  FileJson,
  FileText,
  FileDown,
  FileSpreadsheet,
  Archive,
} from 'lucide-react';
import { AppSettings, ChatSession, GeotaggedMedia, VoicePersona, VoicePersonaInfo } from '../types';
import { OFFLINE_PHRASEBOOK, SUPPORTED_LANGUAGES, UI_TRANSLATIONS, VOICE_PERSONAS } from '../data/languages';
import { voiceAssistant } from '../utils/speech';
import {
  BulkExportFormat,
  ChatExportFormat,
  ChatExportScope,
  downloadBulkBackupFile,
  downloadChatHistoryFile,
} from '../utils/exportHistory';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  isOnline: boolean;
  onToggleForceOffline: () => void;
  onClearAllData: () => void;
  sessionCount: number;
  mediaCount: number;
  mediaItems?: GeotaggedMedia[];
  sessions: ChatSession[];
  currentSession: ChatSession;
  userName?: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  isOnline,
  onToggleForceOffline,
  onClearAllData,
  sessionCount,
  mediaCount,
  mediaItems = [],
  sessions,
  currentSession,
  userName,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'ai' | 'voice' | 'accessibility' | 'offline' | 'phrasebook'>('general');
  const [phraseSearch, setPhraseSearch] = useState('');
  const [phraseLang, setPhraseLang] = useState<'spanish' | 'nepali' | 'japanese' | 'french' | 'chinese'>('spanish');
  const [testSpeechActive, setTestSpeechActive] = useState(false);
  const [customKeyInput, setCustomKeyInput] = useState(settings.customGeminiApiKey || '');
  const [showKey, setShowKey] = useState(false);
  const [keyVerifyStatus, setKeyVerifyStatus] = useState<{ loading: boolean; success?: boolean; message?: string } | null>(null);
  const [activeModel, setActiveModel] = useState<string>('gemini-4-hydrogen');
  const [exportScope, setExportScope] = useState<ChatExportScope>('all');
  const [exportFormat, setExportFormat] = useState<ChatExportFormat>('json');
  const [bulkFormat, setBulkFormat] = useState<BulkExportFormat>('json');
  const [exportNotice, setExportNotice] = useState<{
    filename: string;
    detailLabel: string;
    kbLabel: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const headers: Record<string, string> = {};
    if (settings.customGeminiApiKey) {
      headers['x-gemini-api-key'] = settings.customGeminiApiKey;
    }
    fetch('/api/health', { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.model) setActiveModel(data.model);
      })
      .catch(() => {});
  }, [isOpen, settings.customGeminiApiKey]);

  if (!isOpen) return null;

  const t = UI_TRANSLATIONS[settings.uiLanguage] || UI_TRANSLATIONS.en;

  const handleVerifyGeminiKey = async () => {
    setKeyVerifyStatus({ loading: true });
    try {
      const res = await fetch('/api/gemini/verify-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-api-key': customKeyInput.trim(),
        },
        body: JSON.stringify({ apiKey: customKeyInput.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        onUpdateSettings({ customGeminiApiKey: customKeyInput.trim() });
        setKeyVerifyStatus({ loading: false, success: true, message: `Connected! Verified with model ${data.model}.` });
      } else {
        setKeyVerifyStatus({ loading: false, success: false, message: data.error || 'Failed to authenticate key' });
      }
    } catch (err: any) {
      setKeyVerifyStatus({ loading: false, success: false, message: err.message || 'Verification request failed' });
    }
  };

  const activePersona =
    VOICE_PERSONAS.find((p) => p.id === (settings.voicePersona || 'friendly')) || VOICE_PERSONAS[3];

  const handleTestVoice = () => {
    setTestSpeechActive(true);
    const targetLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === settings.defaultTargetLanguage);
    const resolvedSpeed = settings.voiceSpeed ?? 1.0;
    const testText = `Hello! I am Aadesh AI Global Hub speaking in the ${activePersona.name} persona at ${resolvedSpeed.toFixed(2)}x Read Aloud speed and ${Math.round((settings.voiceVolume ?? 1.0) * 100)}% volume. Ready to assist you worldwide.`;
    voiceAssistant.configure({
      rate: resolvedSpeed,
      pitch: settings.voicePitch ?? activePersona.pitch,
      volume: settings.voiceVolume ?? 1.0,
    });
    voiceAssistant.speak(testText, targetLangObj?.speechCode || 'en-US', {
      rate: resolvedSpeed,
      pitch: settings.voicePitch ?? activePersona.pitch,
      volume: settings.voiceVolume ?? 1.0,
      onEnd: () => setTestSpeechActive(false),
      onError: () => setTestSpeechActive(false),
    });
  };

  const handlePreviewPersona = (persona: VoicePersonaInfo) => {
    setTestSpeechActive(true);
    const targetLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === settings.defaultTargetLanguage);
    voiceAssistant.speak(persona.sampleAudioText, targetLangObj?.speechCode || 'en-US', {
      rate: persona.rate,
      pitch: persona.pitch,
      volume: settings.voiceVolume ?? 1.0,
      onEnd: () => setTestSpeechActive(false),
      onError: () => setTestSpeechActive(false),
    });
  };

  const filteredPhrases = OFFLINE_PHRASEBOOK.filter(
    (p) =>
      p.english.toLowerCase().includes(phraseSearch.toLowerCase()) ||
      p.category.toLowerCase().includes(phraseSearch.toLowerCase()) ||
      (p as any)[phraseLang]?.toLowerCase().includes(phraseSearch.toLowerCase())
  );

  const allSessionsList = sessions.length > 0 ? sessions : [currentSession];
  const allMessagesTotal = allSessionsList.reduce((acc, s) => acc + s.messages.length, 0);

  const handleDownloadChatHistory = (overrideFormat?: ChatExportFormat) => {
    const formatToUse = overrideFormat || exportFormat;
    const result = downloadChatHistoryFile({
      scope: exportScope,
      format: formatToUse,
      currentSession,
      allSessions: allSessionsList,
      userName,
    });
    const kbLabel =
      result.byteSize >= 1024
        ? `${(result.byteSize / 1024).toFixed(1)} KB`
        : `${result.byteSize} B`;
    setExportNotice({
      filename: result.filename,
      detailLabel: `${result.sessionCount} ${result.sessionCount === 1 ? 'session' : 'sessions'}, ${result.messageCount} msgs`,
      kbLabel,
    });
  };

  const handleBulkExportBackup = (overrideFormat?: BulkExportFormat) => {
    const formatToUse = overrideFormat || bulkFormat;
    const result = downloadBulkBackupFile({
      format: formatToUse,
      sessions: allSessionsList,
      mediaItems,
      userName,
    });
    const kbLabel =
      result.byteSize >= 1024
        ? `${(result.byteSize / 1024).toFixed(1)} KB`
        : `${result.byteSize} B`;
    setExportNotice({
      filename: result.filename,
      detailLabel: `${result.sessionCount} chats, ${result.messageCount} msgs, ${result.mediaCount} media`,
      kbLabel,
    });
  };

  const renderChatBackupSection = () => (
    <div className="glass-card rounded-2xl p-4 border border-purple-500/35 space-y-3.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
            <Download className="w-4 h-4 text-purple-400" />
            <span>Chat History Backup</span>
          </h4>
          <p className="text-[11px] text-gray-400">
            Save your current conversation or full history locally as JSON, plain text, or PDF
          </p>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-950/70 border border-purple-500/30 text-purple-300 font-semibold shrink-0">
          {allSessionsList.length} sessions
        </span>
      </div>

      {/* Scope Selector */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-gray-300 block">Export Scope</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setExportScope('current')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
              exportScope === 'current'
                ? 'bg-purple-950/60 border-purple-400 text-white shadow-sm'
                : 'bg-[#090a0f] border-[#232738] text-gray-300 hover:border-purple-500/40'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold">
              <span>Current Session</span>
              {exportScope === 'current' && <Check className="w-3.5 h-3.5 text-purple-300" />}
            </div>
            <p className="text-[10px] text-gray-400 truncate mt-0.5">
              {currentSession.title} ({currentSession.messages.length} msgs)
            </p>
          </button>

          <button
            type="button"
            onClick={() => setExportScope('all')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
              exportScope === 'all'
                ? 'bg-purple-950/60 border-purple-400 text-white shadow-sm'
                : 'bg-[#090a0f] border-[#232738] text-gray-300 hover:border-purple-500/40'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold">
              <span>All Conversations</span>
              {exportScope === 'all' && <Check className="w-3.5 h-3.5 text-purple-300" />}
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {allSessionsList.length} sessions ({allMessagesTotal} total msgs)
            </p>
          </button>
        </div>
      </div>

      {/* Format Selector */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-gray-300 block">Backup File Format</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setExportFormat('json')}
            className={`p-2.5 rounded-xl border flex items-center gap-2 text-left transition-all cursor-pointer ${
              exportFormat === 'json'
                ? 'bg-purple-950/60 border-purple-400 text-white'
                : 'bg-[#090a0f] border-[#232738] text-gray-300 hover:border-purple-500/40'
            }`}
          >
            <FileJson className="w-4 h-4 text-purple-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold">Formatted JSON</div>
              <div className="text-[10px] text-gray-400 truncate">Structured .json backup</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setExportFormat('txt')}
            className={`p-2.5 rounded-xl border flex items-center gap-2 text-left transition-all cursor-pointer ${
              exportFormat === 'txt'
                ? 'bg-purple-950/60 border-purple-400 text-white'
                : 'bg-[#090a0f] border-[#232738] text-gray-300 hover:border-purple-500/40'
            }`}
          >
            <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold">Plain Text</div>
              <div className="text-[10px] text-gray-400 truncate">Readable .txt transcript</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setExportFormat('pdf')}
            className={`p-2.5 rounded-xl border flex items-center gap-2 text-left transition-all cursor-pointer ${
              exportFormat === 'pdf'
                ? 'bg-purple-950/60 border-purple-400 text-white'
                : 'bg-[#090a0f] border-[#232738] text-gray-300 hover:border-purple-500/40'
            }`}
          >
            <FileDown className="w-4 h-4 text-rose-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold">PDF Document</div>
              <div className="text-[10px] text-gray-400 truncate">Formatted .pdf transcript</div>
            </div>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => handleDownloadChatHistory()}
          className="w-full py-2.5 px-4 rounded-xl purple-glow-btn text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Download Chat History</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setExportFormat('pdf');
            handleDownloadChatHistory('pdf');
          }}
          className="w-full py-2.5 px-4 rounded-xl bg-rose-950/50 hover:bg-rose-900/60 border border-rose-500/40 hover:border-rose-400 text-rose-100 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-all"
        >
          <FileDown className="w-4 h-4 text-rose-300" />
          <span>Download as PDF</span>
        </button>
      </div>

      {/* Full Bulk Export: All Chat History + Media Metadata (JSON or CSV) */}
      <div className="pt-3 border-t border-white/10 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h5 className="text-xs font-bold text-purple-200 flex items-center gap-1.5">
              <Archive className="w-3.5 h-3.5 text-purple-400" />
              <span>Bulk Export: All Chats & Media Metadata</span>
            </h5>
            <p className="text-[10px] text-gray-400">
              Compile every conversation ({allMessagesTotal} msgs) and geotagged media log ({mediaItems.length} items) into one file
            </p>
          </div>
          <div className="flex items-center gap-1 bg-[#090a0f] p-0.5 rounded-lg border border-[#232738] text-[10px] shrink-0">
            <button
              type="button"
              onClick={() => setBulkFormat('json')}
              className={`px-2 py-1 rounded-md font-bold cursor-pointer transition-colors flex items-center gap-1 ${
                bulkFormat === 'json'
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <FileJson className="w-3 h-3" />
              <span>JSON</span>
            </button>
            <button
              type="button"
              onClick={() => setBulkFormat('csv')}
              className={`px-2 py-1 rounded-md font-bold cursor-pointer transition-colors flex items-center gap-1 ${
                bulkFormat === 'csv'
                  ? 'bg-emerald-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-3 h-3" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleBulkExportBackup()}
          className="w-full py-2 px-4 rounded-xl bg-indigo-950/70 hover:bg-indigo-900/70 border border-indigo-400/40 text-indigo-100 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all"
        >
          <Archive className="w-3.5 h-3.5 text-indigo-300" />
          <span>Bulk Export All Chat & Media ({bulkFormat.toUpperCase()})</span>
        </button>
      </div>

      {exportNotice && (
        <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="truncate">
            Saved <strong>{exportNotice.filename}</strong> ({exportNotice.detailLabel} · {exportNotice.kbLabel})
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="glass-card rounded-3xl max-w-2xl w-full border border-purple-500/50 shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-900/40 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">Application Settings & Personalization</h3>
              <p className="text-xs text-gray-400">Languages, accessibility, voice synthesis & offline mode</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#131520] border border-[#232738] text-gray-400 hover:text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab navigation within modal */}
        <div className="flex border-b border-white/10 px-4 sm:px-6 overflow-x-auto gap-2 bg-[#090a0f]/40">
          {[
            { id: 'general', label: 'Languages & Backup', icon: Languages },
            { id: 'ai', label: 'Gemini Engine & API', icon: Cpu },
            { id: 'voice', label: 'Voice & Speech', icon: Mic },
            { id: 'accessibility', label: 'Accessibility', icon: SunMoon },
            { id: 'offline', label: 'Offline & Backup', icon: WifiOff },
            { id: 'phrasebook', label: 'Offline Phrases', icon: BookOpen },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3 px-3 text-xs sm:text-sm font-semibold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-purple-500 text-purple-300'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-grow">
          {/* TAB 1: GENERAL & LANGUAGES */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300">Interface Language</label>
                <p className="text-[11px] text-gray-400">Translates navigation buttons, headers, and UI text</p>
                <select
                  value={settings.uiLanguage}
                  onChange={(e) => onUpdateSettings({ uiLanguage: e.target.value })}
                  className="w-full bg-[#090a0f] border border-[#232738] focus:border-purple-500 rounded-xl p-2.5 text-xs sm:text-sm text-white outline-none"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.flag} {l.name} ({l.nativeName})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300">Default Target Translation Language</label>
                <p className="text-[11px] text-gray-400">Primary target language for dual-language cards and interpreter</p>
                <select
                  value={settings.defaultTargetLanguage}
                  onChange={(e) => onUpdateSettings({ defaultTargetLanguage: e.target.value })}
                  className="w-full bg-[#090a0f] border border-[#232738] focus:border-purple-500 rounded-xl p-2.5 text-xs sm:text-sm text-white outline-none"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.flag} {l.name}
                    </option>
                  ))}
                </select>
              </div>

              {renderChatBackupSection()}
            </div>
          )}

          {/* TAB: GEMINI AI ENGINE & API KEY */}
          {activeTab === 'ai' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#090a0f] border border-purple-500/40 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                      <Cpu className="w-4 h-4 text-purple-400" />
                      <span>Google Gemini Engine</span>
                    </h4>
                    <p className="text-[11px] text-gray-400">
                      Official Google GenAI SDK backend proxy
                    </p>
                  </div>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 font-semibold border border-emerald-500/30 font-mono">
                    {activeModel}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-500/20 text-xs text-purple-200 space-y-1">
                  <p className="font-semibold text-white flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span>NPR 0 Budget & Free Tier Limits</span>
                  </p>
                  <p className="text-[11px] text-gray-300 leading-relaxed">
                    Google Gemini Flash is free to use with up to 15 requests per minute via Google AI Studio. Your custom API key is routed through secure server-side proxy routes (<code className="text-purple-300">/api/*</code>) and is never exposed in client JavaScript.
                  </p>
                </div>

                {/* Custom API Key input */}
                <div className="space-y-2 pt-1">
                  <label className="text-xs font-semibold text-gray-200 flex items-center justify-between">
                    <span>Connect Your Gemini API Key</span>
                    <span className="text-[10px] text-gray-400">Optional: Overrides server default</span>
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={customKeyInput}
                      onChange={(e) => setCustomKeyInput(e.target.value)}
                      placeholder="Enter AIzaSy... or custom Gemini API Key"
                      className="w-full bg-[#131520] border border-[#232738] focus:border-purple-500 rounded-xl pl-9 pr-10 py-2.5 text-xs text-white outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white cursor-pointer"
                    >
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleVerifyGeminiKey}
                      disabled={keyVerifyStatus?.loading || !customKeyInput.trim()}
                      className="flex-1 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
                    >
                      {keyVerifyStatus?.loading ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>Verify & Connect Key</span>
                    </button>

                    {customKeyInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomKeyInput('');
                          onUpdateSettings({ customGeminiApiKey: '' });
                          setKeyVerifyStatus(null);
                        }}
                        className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#131520] hover:bg-rose-950/40 text-rose-400 border border-rose-500/20 cursor-pointer transition-colors"
                      >
                        Disconnect
                      </button>
                    )}
                  </div>

                  {keyVerifyStatus && (
                    <div
                      className={`p-2.5 rounded-xl text-xs flex items-center gap-2 animate-in fade-in ${
                        keyVerifyStatus.success
                          ? 'bg-emerald-950/40 border border-emerald-500/40 text-emerald-200'
                          : 'bg-rose-950/40 border border-rose-500/40 text-rose-200'
                      }`}
                    >
                      {keyVerifyStatus.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span>{keyVerifyStatus.message}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: VOICE & SPEECH */}
          {activeTab === 'voice' && (
            <div className="space-y-5">
              {/* AI Voice Persona Selection Dropdown & Cards */}
              <div className="p-4 rounded-2xl bg-[#090a0f] border border-purple-500/40 shadow-lg space-y-3.5">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <span>AI Voice Persona</span>
                    </h4>
                    <p className="text-[11px] text-gray-400">
                      Switch Aadesh AI’s vocal inflection, cadence, and learning personality
                    </p>
                  </div>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-purple-950/80 text-purple-300 font-semibold border border-purple-500/30 uppercase tracking-wider flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping" />
                    {activePersona.name} Active
                  </span>
                </div>

                {/* Dropdown Selector */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-300">
                    Voice Persona Dropdown
                  </label>
                  <select
                    value={settings.voicePersona || 'friendly'}
                    onChange={(e) => {
                      const personaId = e.target.value as VoicePersona;
                      const targetPersona = VOICE_PERSONAS.find((p) => p.id === personaId);
                      onUpdateSettings({
                        voicePersona: personaId,
                        voicePitch: targetPersona ? targetPersona.pitch : settings.voicePitch,
                        voiceSpeed: targetPersona ? targetPersona.rate : settings.voiceSpeed,
                      });
                    }}
                    className="w-full bg-[#131520] border border-[#232738] focus:border-purple-500 rounded-xl p-2.5 text-xs sm:text-sm text-white font-medium outline-none cursor-pointer"
                  >
                    {VOICE_PERSONAS.map((persona) => (
                      <option key={persona.id} value={persona.id}>
                        {persona.id === 'calm' && '🧘 '}
                        {persona.id === 'energetic' && '⚡ '}
                        {persona.id === 'professional' && '💼 '}
                        {persona.id === 'friendly' && '😊 '}
                        {persona.name} — {persona.tagline} ({persona.description})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Interactive Persona Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {VOICE_PERSONAS.map((persona) => {
                    const isSelected = (settings.voicePersona || 'friendly') === persona.id;
                    return (
                      <div
                        key={persona.id}
                        onClick={() =>
                          onUpdateSettings({
                            voicePersona: persona.id,
                            voicePitch: persona.pitch,
                            voiceSpeed: persona.rate,
                          })
                        }
                        className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-purple-950/70 border-purple-400 text-white shadow-md shadow-purple-900/30 ring-1 ring-purple-400/50'
                            : 'bg-[#131520]/70 border-[#232738] text-gray-400 hover:text-gray-200 hover:border-purple-500/30'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold flex items-center gap-1.5 text-white">
                            {persona.id === 'calm' && <Wind className="w-3.5 h-3.5 text-sky-400" />}
                            {persona.id === 'energetic' && <Zap className="w-3.5 h-3.5 text-amber-400" />}
                            {persona.id === 'professional' && <Briefcase className="w-3.5 h-3.5 text-indigo-400" />}
                            {persona.id === 'friendly' && <Smile className="w-3.5 h-3.5 text-emerald-400" />}
                            <span>{persona.name}</span>
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-purple-400" />}
                        </div>
                        <div className="text-[10px] text-purple-300 font-semibold mt-0.5">{persona.tagline}</div>
                        <p className="text-[10px] text-gray-400 mt-1 leading-snug">
                          {persona.description}
                        </p>
                        <div className="flex items-center justify-between mt-2 pt-1 border-t border-white/5">
                          <span className="text-[9px] text-gray-500">
                            Pitch: {persona.pitch}x • Rate: {persona.rate}x
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePreviewPersona(persona);
                            }}
                            disabled={testSpeechActive}
                            className="text-[10px] font-semibold text-purple-300 hover:text-white flex items-center gap-1 bg-[#090a0f] hover:bg-purple-900/40 px-2 py-0.5 rounded-lg border border-purple-500/30 transition-all cursor-pointer"
                            title={`Preview ${persona.name} voice`}
                          >
                            <Play className="w-2.5 h-2.5 fill-purple-400 text-purple-400" />
                            <span>Preview</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Hands-Free Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#090a0f] border border-[#232738]">
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-white">Hands-Free Continuous Voice Mode</h4>
                  <p className="text-[11px] text-gray-400">Automatically sends after speech finishes & speaks reply</p>
                </div>
                <button
                  onClick={() => onUpdateSettings({ handsFreeMode: !settings.handsFreeMode })}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    settings.handsFreeMode ? 'bg-purple-600' : 'bg-gray-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      settings.handsFreeMode ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>

              {/* Auto Speak Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#090a0f] border border-[#232738]">
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-white">Auto-Speak AI Responses</h4>
                  <p className="text-[11px] text-gray-400">Reads new translations and chat answers aloud automatically</p>
                </div>
                <button
                  onClick={() => onUpdateSettings({ autoSpeakAIResponses: !settings.autoSpeakAIResponses })}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    settings.autoSpeakAIResponses ? 'bg-purple-600' : 'bg-gray-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      settings.autoSpeakAIResponses ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>

              {/* Visual Read Aloud Playback Speed Slider */}
              {(() => {
                const currentSpeed = Math.max(0.5, Math.min(2.0, settings.voiceSpeed ?? 1.0));
                const speedPercent = ((currentSpeed - 0.5) / 1.5) * 100;
                const speedLabel =
                  currentSpeed < 0.75
                    ? 'Slow & Clear'
                    : currentSpeed < 0.95
                    ? 'Relaxed'
                    : currentSpeed <= 1.08
                    ? 'Normal'
                    : currentSpeed <= 1.4
                    ? 'Brisk'
                    : currentSpeed <= 1.7
                    ? 'Fast'
                    : 'Rapid';

                const applySpeed = (nextRaw: number) => {
                  const clamped = Math.max(0.5, Math.min(2.0, Number(nextRaw.toFixed(2))));
                  voiceAssistant.setPlaybackSpeed(clamped);
                  onUpdateSettings({ voiceSpeed: clamped });
                };

                return (
                  <div className="p-4 rounded-2xl bg-[#090a0f] border border-purple-500/35 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <label
                          htmlFor="read-aloud-speed-slider"
                          className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5"
                        >
                          <Zap className="w-3.5 h-3.5 text-purple-400" />
                          <span>Read Aloud Playback Speed</span>
                        </label>
                        <p className="text-[11px] text-gray-400">
                          Fine-tune speech rate across Read Aloud buttons & voice replies
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-950/80 border border-purple-500/30 text-purple-200 font-semibold">
                          {speedLabel}
                        </span>
                        <span className="text-xs font-mono font-bold tabular-nums px-2.5 py-1 rounded-xl bg-purple-600/25 border border-purple-400/50 text-white">
                          {currentSpeed.toFixed(2)}x
                        </span>
                      </div>
                    </div>

                    {/* Visual Track + Step Controls */}
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => applySpeed(currentSpeed - 0.05)}
                        disabled={currentSpeed <= 0.5}
                        aria-label="Decrease Read Aloud speed"
                        className="w-7 h-7 rounded-lg bg-[#131520] hover:bg-purple-900/50 border border-[#232738] text-gray-200 font-bold text-sm flex items-center justify-center cursor-pointer disabled:opacity-40"
                      >
                        -
                      </button>

                      <div className="relative flex-1 py-2">
                        <div className="h-2 w-full rounded-full bg-[#181b2a] border border-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 transition-all duration-150"
                            style={{ width: `${speedPercent}%` }}
                          />
                        </div>
                        <input
                          id="read-aloud-speed-slider"
                          type="range"
                          min="0.5"
                          max="2.0"
                          step="0.05"
                          value={currentSpeed}
                          aria-label="Read Aloud Playback Speed"
                          onChange={(e) => applySpeed(parseFloat(e.target.value))}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div
                          className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.8)] transition-all duration-150"
                          style={{ left: `${speedPercent}%` }}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => applySpeed(currentSpeed + 0.05)}
                        disabled={currentSpeed >= 2.0}
                        aria-label="Increase Read Aloud speed"
                        className="w-7 h-7 rounded-lg bg-[#131520] hover:bg-purple-900/50 border border-[#232738] text-gray-200 font-bold text-sm flex items-center justify-center cursor-pointer disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>

                    {/* Visual Tick Scale + Quick Speed Presets */}
                    <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5">
                      <span className="text-[10px] text-gray-500 font-mono">0.50x</span>
                      <div className="flex flex-wrap items-center gap-1">
                        {[0.75, 1.0, 1.25, 1.5, 1.75].map((preset) => {
                          const isActive = Math.abs(currentSpeed - preset) < 0.025;
                          return (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => applySpeed(preset)}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-semibold border transition-all cursor-pointer ${
                                isActive
                                  ? 'bg-purple-600 text-white border-purple-400 shadow-sm'
                                  : 'bg-[#131520] text-gray-300 border-[#232738] hover:border-purple-500/40 hover:text-white'
                              }`}
                            >
                              {preset === 1.0 ? '1.0x Normal' : `${preset}x`}
                            </button>
                          );
                        })}
                      </div>
                      <span className="text-[10px] text-gray-500 font-mono">2.00x</span>
                    </div>
                  </div>
                );
              })()}

              {/* Pitch Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-gray-300">
                  <span>Voice Pitch (Multiplier)</span>
                  <span className="font-bold text-purple-300">{settings.voicePitch}x</span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="1.2"
                  step="0.05"
                  value={settings.voicePitch}
                  onChange={(e) => onUpdateSettings({ voicePitch: parseFloat(e.target.value) })}
                  className="w-full accent-purple-500"
                />
              </div>

              {/* Voice Volume Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-gray-300">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                    <span>Voice Output Volume (Intensity)</span>
                  </span>
                  <span className="font-bold text-purple-300">
                    {Math.round((settings.voiceVolume ?? 1.0) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.voiceVolume ?? 1.0}
                  onChange={(e) => onUpdateSettings({ voiceVolume: parseFloat(e.target.value) })}
                  className="w-full accent-purple-500"
                />
              </div>

              {/* Voice Test Action */}
              <button
                onClick={handleTestVoice}
                disabled={testSpeechActive}
                className="purple-glow-btn text-white text-xs font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 w-full transition-all"
              >
                <Play className="w-3.5 h-3.5" />
                <span>
                  {testSpeechActive
                    ? `Playing ${activePersona.name} Persona Sample...`
                    : `Test AI Voice Audio (${activePersona.name} Persona)`}
                </span>
              </button>
            </div>
          )}

          {/* TAB 3: ACCESSIBILITY */}
          {activeTab === 'accessibility' && (
            <div className="space-y-5">
              {/* Font Size */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                  <Type className="w-4 h-4 text-purple-400" />
                  <span>Text Scaling for Diverse Users</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'normal', label: 'Default', desc: '16px standard' },
                    { id: 'large', label: 'Large', desc: '18px increased' },
                    { id: 'xlarge', label: 'Extra Large', desc: '20px enhanced' },
                  ].map((size) => (
                    <button
                      key={size.id}
                      onClick={() => onUpdateSettings({ fontSize: size.id as any })}
                      className={`p-3 rounded-xl border text-center transition-all ${
                        settings.fontSize === size.id
                          ? 'bg-purple-900/40 border-purple-400 text-white shadow-md'
                          : 'bg-[#090a0f] border-[#232738] text-gray-400 hover:text-white'
                      }`}
                    >
                      <div className="text-xs font-bold">{size.label}</div>
                      <div className="text-[10px] text-gray-500">{size.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* High Contrast Mode */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#090a0f] border border-[#232738]">
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-white flex items-center gap-1.5">
                    <SunMoon className="w-4 h-4 text-purple-400" />
                    <span>High Contrast Mode</span>
                  </h4>
                  <p className="text-[11px] text-gray-400">Deep blacks, high border contrast, and enhanced text readability</p>
                </div>
                <button
                  onClick={() => onUpdateSettings({ highContrast: !settings.highContrast })}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    settings.highContrast ? 'bg-purple-600' : 'bg-gray-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      settings.highContrast ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>

              {/* Screen Reader Voice Announcement */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#090a0f] border border-[#232738]">
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-white">Screen Reader Optimization</h4>
                  <p className="text-[11px] text-gray-400">ARIA live regions & announced status transitions</p>
                </div>
                <button
                  onClick={() => onUpdateSettings({ screenReaderAnnounce: !settings.screenReaderAnnounce })}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    settings.screenReaderAnnounce ? 'bg-purple-600' : 'bg-gray-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      settings.screenReaderAnnounce ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: OFFLINE MODE & LOCAL CACHE */}
          {activeTab === 'offline' && (
            <div className="space-y-5">
              {/* Online / Offline Simulator */}
              <div className="p-4 rounded-2xl bg-[#090a0f] border border-[#232738] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isOnline ? 'bg-emerald-950 border border-emerald-500/40 text-emerald-400' : 'bg-amber-950 border border-amber-500/40 text-amber-400'}`}>
                    {isOnline ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      Current Network: {isOnline ? 'Connected (Live AI Active)' : 'Offline Mode (Local Engine Active)'}
                    </h4>
                    <p className="text-xs text-gray-400">
                      {isOnline
                        ? 'All queries use live multimodal Gemini reasoning & cloud translation.'
                        : 'Using cached offline translations and locally persisted conversation history.'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={onToggleForceOffline}
                  className={`text-xs px-3 py-1.5 rounded-xl border font-semibold transition-all ${
                    !isOnline
                      ? 'bg-amber-900/40 border-amber-500 text-amber-200'
                      : 'bg-[#131520] border-[#232738] text-gray-300 hover:text-white'
                  }`}
                >
                  {!isOnline ? 'Reconnect' : 'Simulate Offline'}
                </button>
              </div>

              {/* Download Chat History Backup */}
              {renderChatBackupSection()}

              {/* Local Storage Stats */}
              <div className="glass-card rounded-2xl p-4 border border-purple-500/30 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-white">
                  <Database className="w-4 h-4 text-purple-400" />
                  <span>Local Offline Storage Cache</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-[#090a0f] p-3 rounded-xl border border-[#232738]">
                    <span className="text-gray-400 block text-[10px]">Saved Chat Sessions</span>
                    <span className="text-lg font-bold text-white">{sessionCount} Sessions</span>
                  </div>
                  <div className="bg-[#090a0f] p-3 rounded-xl border border-[#232738]">
                    <span className="text-gray-400 block text-[10px]">Geotagged Media Logs</span>
                    <span className="text-lg font-bold text-white">{mediaCount} Media items</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (confirm('Are you sure you want to reset all local storage data?')) {
                      onClearAllData();
                    }
                  }}
                  className="w-full text-center text-xs py-2 px-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 hover:bg-red-900/60 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All Local Storage & Cache</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 5: OFFLINE EMERGENCY PHRASEBOOK */}
          {activeTab === 'phrasebook' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-2 justify-between">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={phraseSearch}
                    onChange={(e) => setPhraseSearch(e.target.value)}
                    placeholder="Search emergency phrases..."
                    className="w-full bg-[#090a0f] border border-[#232738] rounded-xl pl-9 pr-3 py-2 text-xs text-white outline-none"
                  />
                </div>

                {/* Target language selector for phrases */}
                <select
                  value={phraseLang}
                  onChange={(e) => setPhraseLang(e.target.value as any)}
                  className="bg-[#090a0f] border border-[#232738] rounded-xl px-3 py-2 text-xs text-purple-300 font-semibold outline-none cursor-pointer"
                >
                  <option value="spanish">🇪🇸 Spanish</option>
                  <option value="nepali">🇳🇵 Nepali</option>
                  <option value="japanese">🇯🇵 Japanese</option>
                  <option value="french">🇫🇷 French</option>
                  <option value="chinese">🇨🇳 Chinese</option>
                </select>
              </div>

              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {filteredPhrases.map((phrase, idx) => {
                  const targetTranslation = (phrase as any)[phraseLang];
                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-[#090a0f] border border-[#232738] space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-500/20">
                          {phrase.category}
                        </span>
                        <button
                          onClick={() => {
                            const lObj = SUPPORTED_LANGUAGES.find((l) => l.name.toLowerCase() === phraseLang);
                            voiceAssistant.speak(targetTranslation, lObj?.speechCode || 'es-ES', {
                              rate: settings.voiceSpeed,
                              pitch: settings.voicePitch,
                              volume: settings.voiceVolume ?? 1.0,
                            });
                          }}
                          className="text-xs text-purple-400 hover:text-purple-200"
                          title="Speak phrase"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-xs sm:text-sm font-semibold text-white">{phrase.english}</p>
                      <p className="text-xs sm:text-sm text-purple-300 italic font-medium bg-[#131520] p-2 rounded-lg border border-purple-500/20">
                        {targetTranslation}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Branding Attribution */}
        <div className="px-5 py-3 border-t border-white/10 bg-[#090a0f]/80 flex items-center justify-between text-[11px] text-gray-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="font-bold text-gray-200">Aadesh AI Global Hub</span>
            <span className="text-gray-600">•</span>
            <span className="text-purple-300">Worldwide Multimodal Intelligence</span>
          </div>
          <div className="flex items-center gap-1 text-gray-400">
            <span>v2.5.0 Universal Enterprise</span>
          </div>
        </div>
      </div>
    </div>
  );
};
