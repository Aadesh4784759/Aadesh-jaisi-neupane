import React, { useState } from 'react';
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
} from 'lucide-react';
import { AppSettings, LanguageOption, VoicePersona, VoicePersonaInfo } from '../types';
import { OFFLINE_PHRASEBOOK, SUPPORTED_LANGUAGES, UI_TRANSLATIONS, VOICE_PERSONAS } from '../data/languages';
import { voiceAssistant } from '../utils/speech';

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
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'voice' | 'accessibility' | 'offline' | 'phrasebook'>('general');
  const [phraseSearch, setPhraseSearch] = useState('');
  const [phraseLang, setPhraseLang] = useState<'spanish' | 'nepali' | 'japanese' | 'french' | 'chinese'>('spanish');
  const [testSpeechActive, setTestSpeechActive] = useState(false);

  if (!isOpen) return null;

  const t = UI_TRANSLATIONS[settings.uiLanguage] || UI_TRANSLATIONS.en;

  const activePersona =
    VOICE_PERSONAS.find((p) => p.id === (settings.voicePersona || 'friendly')) || VOICE_PERSONAS[3];

  const handleTestVoice = () => {
    setTestSpeechActive(true);
    const targetLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === settings.defaultTargetLanguage);
    const testText = `Hello! I am Aadesh AI speaking in the ${activePersona.name} persona at ${settings.voiceSpeed}x speed. Built by Aadesh Jaisi.`;
    voiceAssistant.speak(testText, targetLangObj?.speechCode || 'en-US', {
      rate: settings.voiceSpeed * activePersona.rate,
      pitch: settings.voicePitch * activePersona.pitch,
      onEnd: () => setTestSpeechActive(false),
      onError: () => setTestSpeechActive(false),
    });
  };

  const handlePreviewPersona = (persona: VoicePersonaInfo) => {
    setTestSpeechActive(true);
    const targetLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === settings.defaultTargetLanguage);
    voiceAssistant.speak(persona.sampleAudioText, targetLangObj?.speechCode || 'en-US', {
      rate: settings.voiceSpeed * persona.rate,
      pitch: settings.voicePitch * persona.pitch,
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
            { id: 'general', label: 'Languages', icon: Languages },
            { id: 'voice', label: 'Voice & Speech', icon: Mic },
            { id: 'accessibility', label: 'Accessibility', icon: SunMoon },
            { id: 'offline', label: 'Offline Mode', icon: WifiOff },
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

              {/* Voice Speed Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-gray-300">
                  <span>Voice Speech Rate (Multiplier)</span>
                  <span className="font-bold text-purple-300">{settings.voiceSpeed}x</span>
                </div>
                <input
                  type="range"
                  min="0.75"
                  max="1.5"
                  step="0.05"
                  value={settings.voiceSpeed}
                  onChange={(e) => onUpdateSettings({ voiceSpeed: parseFloat(e.target.value) })}
                  className="w-full accent-purple-500"
                />
              </div>

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
                            voiceAssistant.speak(targetTranslation, lObj?.speechCode || 'es-ES');
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
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            <span className="font-bold text-gray-200">Aadesh AI</span>
            <span className="text-gray-600">•</span>
            <span className="text-purple-300">AI Learning Platform</span>
          </div>
          <div className="flex items-center gap-1 text-gray-400">
            <span>Built by</span>
            <span className="text-purple-200 font-semibold">Aadesh Jaisi</span>
            <span className="text-gray-500 font-medium">(आदेश जैसी)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
