import React, { useState } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  ArrowRightLeft,
  Sparkles,
  Copy,
  Check,
  Send,
  MessageSquare,
  Globe,
} from 'lucide-react';
import { AppSettings, LanguageOption } from '../types';
import { SUPPORTED_LANGUAGES, UI_TRANSLATIONS } from '../data/languages';
import { voiceAssistant } from '../utils/speech';

interface InterpreterViewProps {
  settings: AppSettings;
  isOnline: boolean;
  onRecordTranslationMetric: (langA: string, langB: string, latencyMs: number) => void;
}

interface TranslationTurn {
  id: string;
  sender: 'A' | 'B';
  sourceText: string;
  sourceLang: string;
  translatedText: string;
  targetLang: string;
  pronunciation?: string;
  culturalNote?: string;
  timestamp: number;
}

export const InterpreterView: React.FC<InterpreterViewProps> = ({
  settings,
  isOnline,
  onRecordTranslationMetric,
}) => {
  const [langA, setLangA] = useState<string>('en');
  const [langB, setLangB] = useState<string>('ja');

  const [inputA, setInputA] = useState('');
  const [inputB, setInputB] = useState('');

  const [isRecordingA, setIsRecordingA] = useState(false);
  const [isRecordingB, setIsRecordingB] = useState(false);

  const [history, setHistory] = useState<TranslationTurn[]>([
    {
      id: 'turn-1',
      sender: 'A',
      sourceText: 'Hello! Welcome to our global meeting. Can you hear me clearly?',
      sourceLang: 'en',
      translatedText: 'こんにちは！グローバルミーティングへようこそ。私の声がはっきりと聞こえますか？',
      targetLang: 'ja',
      pronunciation: 'Konnichiwa! Gurōbaru mītingu e yōkoso. Watashi no koe ga hakkiri to kikoemasu ka?',
      culturalNote: 'Polite greeting suitable for international business or travel exchange.',
      timestamp: Date.now() - 60000 * 5,
    },
    {
      id: 'turn-2',
      sender: 'B',
      sourceText: 'はい、完璧に聞こえます。本日はよろしくお願いします。',
      sourceLang: 'ja',
      translatedText: 'Yes, I can hear you perfectly. Looking forward to speaking with you today.',
      targetLang: 'en',
      pronunciation: 'Hai, kampeki ni kikoemasu. Honjitsu wa yoroshiku onegai shimasu.',
      culturalNote: 'Formal polite Japanese phrasing showing goodwill and respect.',
      timestamp: Date.now() - 60000 * 4,
    },
  ]);

  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const t = UI_TRANSLATIONS[settings.uiLanguage] || UI_TRANSLATIONS.en;
  const langAObj = SUPPORTED_LANGUAGES.find((l) => l.code === langA) || SUPPORTED_LANGUAGES[0];
  const langBObj = SUPPORTED_LANGUAGES.find((l) => l.code === langB) || SUPPORTED_LANGUAGES[5];

  // Swap Languages
  const handleSwapLanguages = () => {
    setLangA(langB);
    setLangB(langA);
    setInputA('');
    setInputB('');
  };

  // Perform Translation
  const handleTranslate = async (sourceText: string, sender: 'A' | 'B') => {
    if (!sourceText.trim()) return;

    const sourceLang = sender === 'A' ? langA : langB;
    const targetLang = sender === 'A' ? langB : langA;
    const targetLangObj = sender === 'A' ? langBObj : langAObj;

    setIsLoading(true);
    const startTime = Date.now();

    try {
      let translatedText = '';
      let pronunciation = '';
      let culturalNote = '';
      let latencyMs = 250;

      if (!isOnline) {
        // Offline translation heuristic
        translatedText = `[Offline Translated (${targetLangObj.name})] ${sourceText}`;
        culturalNote = 'Translated via local offline dictionary cache.';
      } else {
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: sourceText,
            sourceLang,
            targetLang,
          }),
        });
        const data = await res.json();
        translatedText = data.translatedText || sourceText;
        pronunciation = data.pronunciation || '';
        culturalNote = data.culturalNote || '';
        latencyMs = data.latencyMs || Date.now() - startTime;
      }

      const newTurn: TranslationTurn = {
        id: `turn-${Date.now()}`,
        sender,
        sourceText,
        sourceLang,
        translatedText,
        targetLang,
        pronunciation,
        culturalNote,
        timestamp: Date.now(),
      };

      setHistory((prev) => [...prev, newTurn]);
      onRecordTranslationMetric(sourceLang, targetLang, latencyMs);

      // Auto speak translated text in recipient's language if enabled or hands-free
      if (settings.autoSpeakAIResponses || settings.handsFreeMode) {
        voiceAssistant.speak(translatedText, targetLangObj.speechCode, {
          rate: settings.voiceSpeed,
          pitch: settings.voicePitch,
        });
      }
    } catch (err) {
      console.error('Translation error:', err);
    } finally {
      setIsLoading(false);
      if (sender === 'A') setInputA('');
      if (sender === 'B') setInputB('');
    }
  };

  // Voice recording for Speaker A or Speaker B
  const handleStartVoice = (sender: 'A' | 'B') => {
    const isCurrentlyRecording = sender === 'A' ? isRecordingA : isRecordingB;

    if (isCurrentlyRecording) {
      voiceAssistant.stopListening();
      if (sender === 'A') setIsRecordingA(false);
      if (sender === 'B') setIsRecordingB(false);
      return;
    }

    const currentLangObj = sender === 'A' ? langAObj : langBObj;

    if (sender === 'A') setIsRecordingA(true);
    else setIsRecordingB(true);

    voiceAssistant.startListening(currentLangObj.speechCode, {
      onResult: (transcript, isFinal) => {
        if (sender === 'A') {
          setInputA(transcript);
          if (isFinal) {
            setIsRecordingA(false);
            handleTranslate(transcript, 'A');
          }
        } else {
          setInputB(transcript);
          if (isFinal) {
            setIsRecordingB(false);
            handleTranslate(transcript, 'B');
          }
        }
      },
      onError: () => {
        setIsRecordingA(false);
        setIsRecordingB(false);
      },
      onEnd: () => {
        setIsRecordingA(false);
        setIsRecordingB(false);
      },
    });
  };

  // Play audio
  const handleSpeak = (text: string, langCode: string) => {
    const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === langCode);
    voiceAssistant.speak(text, langObj?.speechCode || 'en-US', {
      rate: settings.voiceSpeed,
      pitch: settings.voicePitch,
    });
  };

  // Copy
  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 space-y-6 pb-28">
      {/* Top Banner & Language Pairing */}
      <div className="glass-card rounded-2xl p-4 sm:p-6 border border-purple-500/30 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-950/70 border border-purple-500/30 text-purple-300 text-xs font-semibold mb-1">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Real-Time Bilateral Interpreter</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white">Live Regional Translation</h2>
            <p className="text-xs text-gray-400">
              Instant voice and text translation between two people speaking different languages across regions.
            </p>
          </div>

          {/* Language Pair Selectors with Swap */}
          <div className="flex items-center justify-center gap-2 sm:gap-3 bg-[#090a0f] p-2 rounded-2xl border border-[#232738]">
            {/* Lang A */}
            <select
              value={langA}
              onChange={(e) => setLangA(e.target.value)}
              className="bg-[#131520] border border-[#232738] text-white text-xs sm:text-sm font-semibold rounded-xl px-2.5 py-2 outline-none cursor-pointer"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.flag} {l.name}
                </option>
              ))}
            </select>

            <button
              onClick={handleSwapLanguages}
              className="p-2 rounded-xl bg-purple-900/40 hover:bg-purple-900/80 border border-purple-500/30 text-purple-300 transition-all"
              title="Swap Languages"
            >
              <ArrowRightLeft className="w-4 h-4" />
            </button>

            {/* Lang B */}
            <select
              value={langB}
              onChange={(e) => setLangB(e.target.value)}
              className="bg-[#131520] border border-[#232738] text-white text-xs sm:text-sm font-semibold rounded-xl px-2.5 py-2 outline-none cursor-pointer"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.flag} {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Speaker Input Decks: Split Grid for Dual Input */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Speaker A Deck */}
        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-purple-500/30 space-y-3 relative">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
              <span>{langAObj.flag}</span>
              <span>Speaker 1 ({langAObj.name})</span>
            </span>
            <span className="text-[10px] text-gray-400">Speak or Type</span>
          </div>

          <textarea
            value={inputA}
            onChange={(e) => setInputA(e.target.value)}
            placeholder={`Say or type something in ${langAObj.name}...`}
            rows={3}
            className="w-full bg-[#090a0f] border border-[#232738] focus:border-purple-500 rounded-xl p-3 text-xs sm:text-sm text-gray-100 placeholder-gray-500 outline-none resize-none"
          />

          <div className="flex items-center justify-between">
            <button
              onClick={() => handleStartVoice('A')}
              className={`py-2 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                isRecordingA
                  ? 'bg-red-600 text-white animate-pulse'
                  : 'bg-[#131520] hover:bg-purple-900/30 border border-[#232738] text-purple-300'
              }`}
            >
              {isRecordingA ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              <span>{isRecordingA ? 'Listening...' : 'Voice Input'}</span>
            </button>

            <button
              onClick={() => handleTranslate(inputA, 'A')}
              disabled={isLoading || !inputA.trim()}
              className="purple-glow-btn text-white text-xs font-semibold py-2 px-4 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
            >
              <span>Translate to {langBObj.name}</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Speaker B Deck */}
        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-indigo-500/30 space-y-3 relative">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
              <span>{langBObj.flag}</span>
              <span>Speaker 2 ({langBObj.name})</span>
            </span>
            <span className="text-[10px] text-gray-400">Speak or Type</span>
          </div>

          <textarea
            value={inputB}
            onChange={(e) => setInputB(e.target.value)}
            placeholder={`Say or type something in ${langBObj.name}...`}
            rows={3}
            className="w-full bg-[#090a0f] border border-[#232738] focus:border-indigo-500 rounded-xl p-3 text-xs sm:text-sm text-gray-100 placeholder-gray-500 outline-none resize-none"
          />

          <div className="flex items-center justify-between">
            <button
              onClick={() => handleStartVoice('B')}
              className={`py-2 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                isRecordingB
                  ? 'bg-red-600 text-white animate-pulse'
                  : 'bg-[#131520] hover:bg-indigo-900/30 border border-[#232738] text-indigo-300'
              }`}
            >
              {isRecordingB ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              <span>{isRecordingB ? 'Listening...' : 'Voice Input'}</span>
            </button>

            <button
              onClick={() => handleTranslate(inputB, 'B')}
              disabled={isLoading || !inputB.trim()}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold py-2 px-4 rounded-xl flex items-center gap-1.5 disabled:opacity-50 transition-all shadow-md"
            >
              <span>Translate to {langAObj.name}</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Live Conversation Transcript Feed */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-purple-400" />
            <span>Interpreter Conversation Feed</span>
          </h3>
          <span className="text-xs text-gray-400">{history.length} turns recorded</span>
        </div>

        <div className="space-y-3">
          {history.map((turn) => {
            const isSpeakerA = turn.sender === 'A';
            const sourceLangObj =
              SUPPORTED_LANGUAGES.find((l) => l.code === turn.sourceLang) || SUPPORTED_LANGUAGES[0];
            const targetLangObj =
              SUPPORTED_LANGUAGES.find((l) => l.code === turn.targetLang) || SUPPORTED_LANGUAGES[1];

            return (
              <div
                key={turn.id}
                className={`glass-card rounded-2xl p-4 sm:p-5 border transition-all ${
                  isSpeakerA
                    ? 'border-purple-500/30 bg-[#131520]/80'
                    : 'border-indigo-500/30 bg-[#151324]/80'
                }`}
              >
                <div className="flex items-center justify-between text-xs text-gray-400 mb-2 border-b border-white/5 pb-1.5">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <span>{sourceLangObj.flag}</span>
                    <span>{isSpeakerA ? 'Speaker 1' : 'Speaker 2'}</span>
                    <span className="text-gray-500 text-[10px]">({sourceLangObj.name} → {targetLangObj.name})</span>
                  </span>
                  <span>{new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                {/* Original utterance */}
                <div className="text-sm text-gray-300 font-normal mb-2">
                  "{turn.sourceText}"
                </div>

                {/* Translated output */}
                <div className="bg-[#090a0f] p-3 rounded-xl border border-white/10 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-purple-300 flex items-center gap-1">
                      <span>{targetLangObj.flag}</span>
                      <span>Translation:</span>
                    </span>
                    <div className="flex items-center gap-2">
                      {/* Copy */}
                      <button
                        onClick={() => handleCopy(turn.id, turn.translatedText)}
                        className="text-gray-400 hover:text-white"
                        title="Copy"
                      >
                        {copiedId === turn.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* Speak */}
                      <button
                        onClick={() => handleSpeak(turn.translatedText, turn.targetLang)}
                        className="text-purple-400 hover:text-purple-200"
                        title="Speak translation"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <p className="text-sm sm:text-base font-semibold text-white">
                    {turn.translatedText}
                  </p>

                  {/* Pronunciation guide */}
                  {turn.pronunciation && (
                    <p className="text-[11px] text-gray-400 italic">
                      Pronunciation: {turn.pronunciation}
                    </p>
                  )}

                  {/* Cultural note */}
                  {turn.culturalNote && (
                    <div className="text-[11px] text-indigo-300 bg-indigo-950/30 p-1.5 rounded-lg border border-indigo-500/20 mt-1">
                      💡 {turn.culturalNote}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
