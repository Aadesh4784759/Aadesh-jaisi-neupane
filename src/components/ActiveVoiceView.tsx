import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Play,
  Pause,
  Square,
  Volume2,
  VolumeX,
  ArrowLeft,
  Radio,
  Sparkles,
  Globe2,
  AlertCircle,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';
import { AppSettings } from '../types';
import { SUPPORTED_LANGUAGES, VOICE_PERSONAS, isRtlLanguage } from '../data/languages';
import { voiceAssistant, VoicePlaybackState } from '../utils/speech';

interface VoiceTurn {
  id: string;
  role: 'user' | 'model';
  text: string;
  translation?: string;
  langCode: string;
  timestamp: number;
}

interface ActiveVoiceViewProps {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  isOnline: boolean;
  onReturnToChat: () => void;
  onSendVoiceMessage: (params: {
    text: string;
    isVoice: boolean;
    targetLanguage: string;
  }) => Promise<{ reply: string; translation?: string } | void>;
}

export const ActiveVoiceView: React.FC<ActiveVoiceViewProps> = ({
  settings,
  onUpdateSettings,
  isOnline,
  onReturnToChat,
  onSendVoiceMessage,
}) => {
  const [voiceLang, setVoiceLang] = useState<string>(settings.uiLanguage || 'en');
  const [targetLang, setTargetLang] = useState<string>(settings.defaultTargetLanguage || 'ne');
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [sessionActive, setSessionActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [playback, setPlayback] = useState<VoicePlaybackState>(() => voiceAssistant.getPlaybackState());

  const handsFreeRef = useRef<boolean>(settings.handsFreeMode);
  const sessionActiveRef = useRef<boolean>(false);
  const inFlightRef = useRef<boolean>(false);

  useEffect(() => {
    handsFreeRef.current = settings.handsFreeMode;
  }, [settings.handsFreeMode]);

  useEffect(() => {
    const refreshVoices = () => {
      const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === voiceLang) || SUPPORTED_LANGUAGES[0];
      const filtered = voiceAssistant.getAvailableVoices(langObj.speechCode);
      setAvailableVoices(filtered.length > 0 ? filtered : voiceAssistant.getAvailableVoices());
    };
    refreshVoices();
    const timer = setTimeout(refreshVoices, 400);
    return () => clearTimeout(timer);
  }, [voiceLang]);

  useEffect(() => {
    const unsub = voiceAssistant.subscribePlayback((state) => {
      setPlayback(state);
      if (state.lastError) setErrorMsg(state.lastError);
    });
    return () => {
      unsub();
      sessionActiveRef.current = false;
      voiceAssistant.stopListening();
      voiceAssistant.stopSpeaking();
    };
  }, []);

  const speechSupported = voiceAssistant.isSupported();
  const currentLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === voiceLang) || SUPPORTED_LANGUAGES[0];
  const activePersona = VOICE_PERSONAS.find((p) => p.id === (settings.voicePersona || 'friendly')) || VOICE_PERSONAS[3];

  const beginListeningTurn = () => {
    if (!sessionActiveRef.current || inFlightRef.current) return;
    setErrorMsg(null);

    // Allow interrupting AI speech cleanly
    if (playback.isSpeaking) {
      voiceAssistant.stopSpeaking();
    }

    const started = voiceAssistant.startListening(currentLangObj.speechCode, {
      onStart: () => {
        setIsListening(true);
        setInterimText('');
      },
      onResult: async (transcript, isFinal) => {
        setInterimText(transcript);
        if (isFinal && transcript.trim()) {
          setIsListening(false);
          await processSpokenTurn(transcript.trim());
        }
      },
      onError: (err) => {
        setIsListening(false);
        setErrorMsg(err);
      },
      onEnd: () => {
        setIsListening(false);
      },
    });

    if (!started) {
      setSessionActive(false);
      sessionActiveRef.current = false;
    }
  };

  const processSpokenTurn = async (userSpeech: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsThinking(true);
    setInterimText('');

    const userTurn: VoiceTurn = {
      id: `vt-u-${Date.now()}`,
      role: 'user',
      text: userSpeech,
      langCode: voiceLang,
      timestamp: Date.now(),
    };
    setTurns((prev) => [...prev, userTurn]);

    try {
      const result = await onSendVoiceMessage({
        text: userSpeech,
        isVoice: true,
        targetLanguage: targetLang,
      });

      const replyText = result?.reply || 'Response completed in chat.';
      const transText = result?.translation;

      const aiTurn: VoiceTurn = {
        id: `vt-m-${Date.now()}`,
        role: 'model',
        text: replyText,
        translation: transText,
        langCode: transText ? targetLang : voiceLang,
        timestamp: Date.now(),
      };
      setTurns((prev) => [...prev, aiTurn]);

      const speakLangObj =
        SUPPORTED_LANGUAGES.find((l) => l.code === (transText ? targetLang : voiceLang)) || currentLangObj;
      const textToSpeak = transText || replyText;

      voiceAssistant.speak(textToSpeak, speakLangObj.speechCode, {
        rate: Math.max(0.5, Math.min(2.0, settings.voiceSpeed ?? 1.0)),
        pitch: Math.max(0.5, Math.min(2.0, settings.voicePitch ?? activePersona.pitch)),
        volume: settings.voiceVolume ?? 1.0,
        voiceURI: selectedVoiceURI || undefined,
        onEnd: () => {
          // Only resume listening if BOTH user session is active AND hands-free mode remains enabled
          if (sessionActiveRef.current && handsFreeRef.current) {
            setTimeout(() => {
              if (sessionActiveRef.current && handsFreeRef.current) {
                beginListeningTurn();
              }
            }, 350);
          }
        },
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to process voice conversation.');
    } finally {
      inFlightRef.current = false;
      setIsThinking(false);
    }
  };

  const handleStartConversation = () => {
    setErrorMsg(null);
    sessionActiveRef.current = true;
    setSessionActive(true);
    beginListeningTurn();
  };

  const handleStopConversation = () => {
    sessionActiveRef.current = false;
    setSessionActive(false);
    setIsListening(false);
    setInterimText('');
    voiceAssistant.stopListening();
    voiceAssistant.stopSpeaking();
  };

  const handleMicPress = () => {
    if (playback.isSpeaking) {
      // Interrupt AI speech immediately to listen to user
      voiceAssistant.stopSpeaking();
    }
    if (isListening) {
      voiceAssistant.stopListening();
      setIsListening(false);
      return;
    }
    sessionActiveRef.current = true;
    setSessionActive(true);
    beginListeningTurn();
  };

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 space-y-5 pb-32 w-full">
      {/* Top Bar */}
      <div className="glass-card rounded-2xl p-4 sm:p-5 border border-purple-500/35 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-950/70 border border-purple-500/30 text-purple-300 text-xs font-semibold">
            <Radio className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
            <span>Active Voice Assistant Studio</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white">Hands-Free Voice Companion</h2>
          <p className="text-xs text-gray-400">
            Speak naturally in English, नेपाली, हिन्दी, or any supported language. Interrupt anytime while Aadesh AI is speaking.
          </p>
        </div>

        <button
          onClick={() => {
            handleStopConversation();
            onReturnToChat();
          }}
          className="bg-[#131520] hover:bg-purple-900/40 border border-[#232738] hover:border-purple-500/50 text-purple-200 text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Text Chat</span>
        </button>
      </div>

      {/* Unsupported Browser Notice */}
      {!speechSupported && (
        <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Speech recognition is limited in this browser</p>
            <p className="text-amber-300/80 mt-0.5">
              For full live microphone input on Chromebook or Android, use Google Chrome and allow microphone access. Text-to-speech playback and normal text chat remain fully available.
            </p>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-300 hover:text-white font-bold px-2">
            ✕
          </button>
        </div>
      )}

      {/* Main Stage Card */}
      <div className="glass-card rounded-3xl p-6 sm:p-8 border border-purple-500/40 shadow-2xl flex flex-col items-center space-y-6 relative overflow-hidden">
        {/* Controls Row: Spoken Language, Target Reply Language, Browser Voice, Hands-Free Toggle */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 z-10">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-gray-400 flex items-center gap-1">
              <Mic className="w-3 h-3 text-purple-400" />
              <span>Your Spoken Language</span>
            </label>
            <select
              value={voiceLang}
              onChange={(e) => setVoiceLang(e.target.value)}
              className="w-full bg-[#090a0f] border border-[#232738] focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.flag} {l.name} ({l.nativeName})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-gray-400 flex items-center gap-1">
              <Globe2 className="w-3 h-3 text-indigo-400" />
              <span>AI Spoken Reply Language</span>
            </label>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="w-full bg-[#090a0f] border border-[#232738] focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.flag} {l.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-gray-400 flex items-center gap-1">
              <Volume2 className="w-3 h-3 text-purple-400" />
              <span>Voice Engine</span>
            </label>
            <select
              value={selectedVoiceURI}
              onChange={(e) => setSelectedVoiceURI(e.target.value)}
              className="w-full bg-[#090a0f] border border-[#232738] focus:border-purple-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
            >
              <option value="">Auto Best Match ({currentLangObj.name})</option>
              {availableVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => onUpdateSettings({ handsFreeMode: !settings.handsFreeMode })}
              className={`w-full py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                settings.handsFreeMode
                  ? 'bg-purple-600/35 border-purple-400 text-purple-100 shadow-md'
                  : 'bg-[#090a0f] border-[#232738] text-gray-400 hover:text-white'
              }`}
            >
              <span>Hands-Free Loop</span>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] ${
                  settings.handsFreeMode ? 'bg-purple-500 text-white' : 'bg-[#181b2a] text-gray-400'
                }`}
              >
                {settings.handsFreeMode ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>
        </div>

        {/* Compact Read Aloud Speed Fine-Tuning Bar */}
        <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-2xl bg-[#090a0f]/90 border border-[#232738] z-10">
          <div className="flex items-center gap-2 text-xs text-gray-300 font-semibold shrink-0">
            <span>Read Aloud Speed</span>
            <span className="font-mono text-purple-300 bg-purple-950/70 border border-purple-500/30 px-2 py-0.5 rounded-lg">
              {(settings.voiceSpeed ?? 1.0).toFixed(2)}x
            </span>
          </div>
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <span className="text-[10px] font-mono text-gray-500">0.5x</span>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.05"
              value={Math.max(0.5, Math.min(2.0, settings.voiceSpeed ?? 1.0))}
              aria-label="Active Voice Read Aloud Speed"
              onChange={(e) => {
                const next = Number(parseFloat(e.target.value).toFixed(2));
                voiceAssistant.setPlaybackSpeed(next);
                onUpdateSettings({ voiceSpeed: next });
              }}
              className="w-full accent-purple-500 cursor-pointer"
            />
            <span className="text-[10px] font-mono text-gray-500">2.0x</span>
          </div>
        </div>

        {/* Center Animated Mic Orb & Live Audio Waveform */}
        <div className="py-4 flex flex-col items-center space-y-5 z-10">
          <div className="relative flex items-center justify-center">
            {(isListening || playback.isSpeaking) && (
              <span className="absolute w-36 h-36 rounded-full bg-purple-600/25 animate-ping" />
            )}
            <button
              type="button"
              onClick={handleMicPress}
              disabled={isThinking || !speechSupported}
              className={`relative w-28 h-28 rounded-full flex items-center justify-center transition-all shadow-2xl cursor-pointer border-2 ${
                isListening
                  ? 'bg-gradient-to-tr from-rose-600 to-purple-600 border-rose-300 scale-105 shadow-[0_0_45px_rgba(244,63,94,0.5)]'
                  : playback.isSpeaking
                    ? 'bg-gradient-to-tr from-indigo-600 to-purple-600 border-purple-300 shadow-[0_0_45px_rgba(139,92,246,0.55)]'
                    : 'purple-glow-btn border-purple-300/60'
              } disabled:opacity-50`}
              aria-label={isListening ? 'Stop listening' : 'Start listening'}
            >
              {isThinking ? (
                <RefreshCw className="w-10 h-10 text-white animate-spin" />
              ) : isListening ? (
                <Mic className="w-11 h-11 text-white animate-pulse" />
              ) : playback.isSpeaking ? (
                <Mic className="w-10 h-10 text-white" />
              ) : (
                <Mic className="w-11 h-11 text-white" />
              )}
            </button>
          </div>

          {/* Glowing Waveform Bars */}
          <div className="flex items-center justify-center gap-1.5 h-12 px-4 rounded-2xl bg-[#070912]/90 border border-purple-500/30">
            {[0.45, 0.85, 0.6, 1.0, 0.72, 0.95, 0.55, 0.9, 0.75, 1.0, 0.62, 0.88, 0.5, 0.8].map((w, i) => {
              const activeLevel = isListening
                ? 0.75
                : playback.isSpeaking && !playback.isPaused && !playback.isMuted
                  ? playback.intensity
                  : 0.08;
              const hPx = Math.max(6, Math.round(6 + w * activeLevel * 32));
              return (
                <span
                  key={i}
                  className={isListening ? 'wave-bar' : 'wave-bar wave-bar-live'}
                  style={{
                    height: isListening ? undefined : `${hPx}px`,
                    opacity: activeLevel > 0.1 ? 0.55 + w * activeLevel * 0.45 : 0.25,
                    animationDelay: `${(i % 5) * 0.12}s`,
                  }}
                />
              );
            })}
          </div>

          {/* Live Status Copy */}
          <div className="text-center space-y-1">
            <div className="text-sm font-bold text-white flex items-center justify-center gap-2">
              {isThinking ? (
                <span>Aadesh AI is thinking{!isOnline ? ' (Offline)' : ''}...</span>
              ) : isListening ? (
                <span className="text-rose-300">Listening in {currentLangObj.name}... Speak now</span>
              ) : playback.isSpeaking ? (
                <span className="text-purple-300">
                  {playback.isPaused ? 'Paused' : 'Speaking'} — tap microphone anytime to interrupt
                </span>
              ) : (
                <span>Tap microphone or Start Conversation to speak</span>
              )}
            </div>
            {interimText && (
              <p className="text-xs sm:text-sm text-purple-200 italic max-w-xl mx-auto">"{interimText}"</p>
            )}
          </div>

          {/* Primary Action Bar */}
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {!sessionActive ? (
              <button
                type="button"
                onClick={handleStartConversation}
                disabled={!speechSupported || isThinking}
                className="purple-glow-btn px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Mic className="w-4 h-4" />
                <span>Start Voice Conversation</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopConversation}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer shadow-lg"
              >
                <Square className="w-3.5 h-3.5 fill-white" />
                <span>Stop Conversation</span>
              </button>
            )}

            {playback.isSpeaking && (
              <button
                type="button"
                onClick={() =>
                  playback.isPaused ? voiceAssistant.resumeSpeaking() : voiceAssistant.pauseSpeaking()
                }
                className="px-4 py-2.5 rounded-xl bg-[#131520] hover:bg-purple-900/40 border border-purple-500/40 text-purple-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                {playback.isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                <span>{playback.isPaused ? 'Resume' : 'Pause'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => voiceAssistant.setMuted(!playback.isMuted)}
              className={`px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                playback.isMuted
                  ? 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                  : 'bg-[#131520] hover:bg-purple-900/40 border-[#232738] text-gray-200'
              }`}
            >
              {playback.isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              <span>{playback.isMuted ? 'Unmute' : 'Mute'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Voice Conversation Transcript */}
      <div className="glass-card rounded-2xl p-4 sm:p-5 border border-purple-500/25 space-y-3">
        <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
          <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-purple-400" />
            <span>Live Voice Transcript</span>
          </h3>
          {turns.length > 0 && (
            <button
              onClick={() => setTurns([])}
              className="text-[11px] text-gray-400 hover:text-white cursor-pointer"
            >
              Clear Transcript
            </button>
          )}
        </div>

        {turns.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">
            Your spoken questions and AI voice replies will appear here in real time.
          </p>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {turns.map((turn) => {
              const rtl = isRtlLanguage(turn.langCode, turn.translation || turn.text);
              return (
                <div
                  key={turn.id}
                  dir={rtl ? 'rtl' : 'ltr'}
                  className={`p-3.5 rounded-xl border text-xs sm:text-sm space-y-1.5 ${
                    turn.role === 'user'
                      ? 'bg-purple-900/35 border-purple-500/40 text-white ml-6'
                      : 'bg-[#090a0f] border-[#232738] text-gray-100 mr-6'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] text-purple-300 font-bold uppercase">
                    <span>{turn.role === 'user' ? 'You (Voice)' : '⚡ Aadesh AI'}</span>
                    <span>{new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="leading-relaxed">{turn.text}</p>
                  {turn.translation && (
                    <p className="text-purple-200 border-t border-purple-500/20 pt-1.5 italic">
                      {turn.translation}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
