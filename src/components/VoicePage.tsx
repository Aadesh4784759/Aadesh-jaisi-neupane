import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Play,
  Pause,
  Square,
  Volume2,
  VolumeX,
  Radio,
  MessageSquare,
  Languages,
  FileAudio,
  Sparkles,
  Copy,
  Check,
  Download,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  Send,
  Trash2,
  AudioLines,
} from 'lucide-react';
import { AppSettings } from '../types';
import { SUPPORTED_LANGUAGES, VOICE_PERSONAS, isRtlLanguage } from '../data/languages';
import { voiceAssistant, VoicePlaybackState } from '../utils/speech';
import { getAuthHeaders } from '../utils/firebase';

export type VoiceToolId =
  | 'assistant'
  | 'voice-chat'
  | 'translator'
  | 'stt'
  | 'tts'
  | 'generator';

interface VoiceTurn {
  id: string;
  role: 'user' | 'model';
  text: string;
  translation?: string;
  langCode: string;
  timestamp: number;
}

interface VoicePageProps {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  isOnline: boolean;
  onSendVoiceMessage: (params: {
    text: string;
    isVoice: boolean;
    targetLanguage: string;
  }) => Promise<{ reply: string; translation?: string } | void>;
  onOpenInChat: (text: string) => void;
}

const VOICE_TOOLS: Array<{
  id: VoiceToolId;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'assistant',
    title: 'Voice Assistant AI',
    subtitle: 'Ask naturally & hear spoken AI replies',
    icon: Sparkles,
  },
  {
    id: 'voice-chat',
    title: 'Voice Chat',
    subtitle: 'Two-way hands-free conversation',
    icon: MessageSquare,
  },
  {
    id: 'translator',
    title: 'Voice Translator',
    subtitle: 'Speak & play translated audio',
    icon: Languages,
  },
  {
    id: 'stt',
    title: 'Speech to Text',
    subtitle: 'Live mic or audio transcription',
    icon: FileAudio,
  },
  {
    id: 'tts',
    title: 'Text to Speech',
    subtitle: 'Speak written text aloud',
    icon: Volume2,
  },
  {
    id: 'generator',
    title: 'AI Voice Generator',
    subtitle: 'Generate downloadable WAV audio',
    icon: AudioLines,
  },
];

const GEMINI_AI_VOICES = [
  { id: 'Kore', label: 'Kore — Clear & Balanced' },
  { id: 'Puck', label: 'Puck — Warm & Expressive' },
  { id: 'Charon', label: 'Charon — Deep & Authoritative' },
  { id: 'Fenrir', label: 'Fenrir — Energetic & Crisp' },
  { id: 'Zephyr', label: 'Zephyr — Calm & Gentle' },
] as const;

export const VoicePage: React.FC<VoicePageProps> = ({
  settings,
  onUpdateSettings,
  isOnline,
  onSendVoiceMessage,
  onOpenInChat,
}) => {
  const [activeTool, setActiveTool] = useState<VoiceToolId>('assistant');
  const [sourceLang, setSourceLang] = useState<string>(settings.uiLanguage || 'en');
  const [targetLang, setTargetLang] = useState<string>(settings.defaultTargetLanguage || 'ne');
  const [selectedBrowserVoiceURI, setSelectedBrowserVoiceURI] = useState<string>('');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [geminiVoice, setGeminiVoice] = useState<string>('Kore');
  const [voiceStyle, setVoiceStyle] = useState<string>('Natural, warm, and articulate');

  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied' | 'unsupported'>('prompt');
  const [isListening, setIsListening] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [handsFreeLoop, setHandsFreeLoop] = useState<boolean>(true);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [playback, setPlayback] = useState<VoicePlaybackState>(() => voiceAssistant.getPlaybackState());

  // Tool-specific inputs & outputs
  const [textInput, setTextInput] = useState('');
  const [sttTranscript, setSttTranscript] = useState('');
  const [translatedOutput, setTranslatedOutput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // AI Voice Generator (.wav) state
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [generatedAudioMeta, setGeneratedAudioMeta] = useState<{
    voiceName: string;
    modelUsed: string;
    latencyMs?: number;
  } | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);

  const sessionActiveRef = useRef(false);
  const inFlightRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const activeToolRef = useRef<VoiceToolId>(activeTool);
  const handsFreeRef = useRef<boolean>(handsFreeLoop);

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    handsFreeRef.current = handsFreeLoop;
  }, [handsFreeLoop]);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((perm) => {
          setMicPermission(
            perm.state === 'granted' ? 'granted' : perm.state === 'denied' ? 'denied' : 'prompt'
          );
          perm.onchange = () => {
            setMicPermission(
              perm.state === 'granted' ? 'granted' : perm.state === 'denied' ? 'denied' : 'prompt'
            );
          };
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    const refreshVoices = () => {
      const langObj =
        SUPPORTED_LANGUAGES.find((l) => l.code === (activeTool === 'translator' ? targetLang : sourceLang)) ||
        SUPPORTED_LANGUAGES[0];
      const matched = voiceAssistant.getAvailableVoices(langObj.speechCode);
      setAvailableVoices(matched.length > 0 ? matched : voiceAssistant.getAvailableVoices());
    };
    refreshVoices();
    const timer = window.setTimeout(refreshVoices, 350);
    return () => window.clearTimeout(timer);
  }, [sourceLang, targetLang, activeTool]);

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
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (generatedAudioUrl) URL.revokeObjectURL(generatedAudioUrl);
    };
  }, [generatedAudioUrl]);

  const speechRecSupported = voiceAssistant.isSupported();
  const ttsSupported = voiceAssistant.isSpeechSynthesisSupported();
  const mediaRecordSupported = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  const sourceLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === sourceLang) || SUPPORTED_LANGUAGES[0];
  const targetLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === targetLang) || SUPPORTED_LANGUAGES[1];
  const activePersona =
    VOICE_PERSONAS.find((p) => p.id === (settings.voicePersona || 'friendly')) || VOICE_PERSONAS[3];

  const requestMicrophoneAccess = async (): Promise<boolean> => {
    setErrorMsg(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      if (speechRecSupported) return true;
      setMicPermission('unsupported');
      setErrorMsg('Microphone capture is not supported in this browser.');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicPermission('granted');
      return true;
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setMicPermission('denied');
        setErrorMsg(
          'Microphone permission was denied. Please enable microphone access in your browser site settings and retry.'
        );
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        setMicPermission('unsupported');
        setErrorMsg('No working microphone was found on this device.');
      } else {
        setErrorMsg('Unable to access microphone right now.');
      }
      return false;
    }
  };

  const speakTextWithConfig = (text: string, langSpeechCode: string, onDone?: () => void) => {
    if (!ttsSupported) {
      setErrorMsg('Browser Text-to-Speech is unavailable. You can still use AI Voice Generator (WAV).');
      onDone?.();
      return;
    }

    const rate = Math.max(0.5, Math.min(2.0, settings.voiceSpeed ?? 1.0));
    const vol = Math.max(0, Math.min(1, settings.voiceVolume ?? 1.0));
    const pitch = Math.max(0.5, Math.min(2.0, settings.voicePitch ?? activePersona.pitch));

    voiceAssistant.configure({ rate, pitch, volume: vol });
    voiceAssistant.speak(text, langSpeechCode, {
      rate,
      pitch,
      volume: vol,
      voiceURI: selectedBrowserVoiceURI || undefined,
      onEnd: onDone,
      onError: () => onDone?.(),
    });
  };

  const handleSpokenResult = async (spokenText: string) => {
    const clean = spokenText.trim();
    if (!clean || inFlightRef.current) return;
    const mode = activeToolRef.current;

    if (mode === 'stt') {
      setSttTranscript((prev) => (prev ? `${prev} ${clean}` : clean));
      return;
    }

    inFlightRef.current = true;
    setIsProcessing(true);
    setInterimTranscript('');

    const userTurn: VoiceTurn = {
      id: `v-u-${Date.now()}`,
      role: 'user',
      text: clean,
      langCode: sourceLang,
      timestamp: Date.now(),
    };
    setTurns((prev) => [...prev, userTurn]);

    try {
      if (mode === 'translator') {
        if (!isOnline) {
          throw new Error('Voice translation requires an internet connection.');
        }
        const headers = await getAuthHeaders({
          'Content-Type': 'application/json',
          ...(settings.customGeminiApiKey ? { 'x-gemini-api-key': settings.customGeminiApiKey } : {}),
        });
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            text: clean,
            sourceLang,
            targetLang,
            customApiKey: settings.customGeminiApiKey,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Translation failed (${res.status})`);
        const translated = data.translatedText || clean;
        setTranslatedOutput(translated);

        const aiTurn: VoiceTurn = {
          id: `v-t-${Date.now()}`,
          role: 'model',
          text: translated,
          langCode: targetLang,
          timestamp: Date.now(),
        };
        setTurns((prev) => [...prev, aiTurn]);
        speakTextWithConfig(translated, targetLangObj.speechCode);
        return;
      }

      // Voice Assistant AI or Voice Chat (two-way)
      const result = await onSendVoiceMessage({
        text: clean,
        isVoice: true,
        targetLanguage: targetLang,
      });

      const replyText = result?.reply || 'Response completed.';
      const transText = result?.translation;
      const spokenReply = transText || replyText;
      const replyLangObj =
        SUPPORTED_LANGUAGES.find((l) => l.code === (transText ? targetLang : sourceLang)) || sourceLangObj;

      const aiTurn: VoiceTurn = {
        id: `v-m-${Date.now()}`,
        role: 'model',
        text: replyText,
        translation: transText,
        langCode: replyLangObj.code,
        timestamp: Date.now(),
      };
      setTurns((prev) => [...prev, aiTurn]);

      speakTextWithConfig(spokenReply, replyLangObj.speechCode, () => {
        if (
          activeToolRef.current === 'voice-chat' &&
          sessionActiveRef.current &&
          handsFreeRef.current
        ) {
          window.setTimeout(() => {
            if (activeToolRef.current === 'voice-chat' && sessionActiveRef.current) {
              void beginListening();
            }
          }, 350);
        }
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to process voice request.');
    } finally {
      inFlightRef.current = false;
      setIsProcessing(false);
    }
  };

  const beginListening = async () => {
    if (inFlightRef.current) return;
    const allowed = await requestMicrophoneAccess();
    if (!allowed) {
      sessionActiveRef.current = false;
      return;
    }

    if (playback.isSpeaking) {
      voiceAssistant.stopSpeaking();
    }

    if (!speechRecSupported) {
      setErrorMsg('Live browser SpeechRecognition is unavailable; use "Record Audio (Gemini Transcribe)" below.');
      sessionActiveRef.current = false;
      return;
    }

    const started = voiceAssistant.startListening(sourceLangObj.speechCode, {
      onStart: () => {
        setIsListening(true);
        setInterimTranscript('');
      },
      onResult: (transcript, isFinal) => {
        setInterimTranscript(transcript);
        if (isFinal && transcript.trim()) {
          setIsListening(false);
          void handleSpokenResult(transcript.trim());
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
      sessionActiveRef.current = false;
    }
  };

  const handleStartAction = () => {
    setErrorMsg(null);
    if (activeTool === 'tts') {
      const content = textInput.trim();
      if (!content) {
        setErrorMsg('Enter text below to convert to spoken audio.');
        return;
      }
      speakTextWithConfig(content, sourceLangObj.speechCode);
      return;
    }

    if (activeTool === 'generator') {
      void handleGenerateAiVoiceAudio();
      return;
    }

    if (isListening) {
      sessionActiveRef.current = false;
      voiceAssistant.stopListening();
      setIsListening(false);
      return;
    }

    sessionActiveRef.current = activeTool === 'voice-chat';
    void beginListening();
  };

  const handleStopAll = () => {
    sessionActiveRef.current = false;
    setIsListening(false);
    setInterimTranscript('');
    voiceAssistant.stopListening();
    voiceAssistant.stopSpeaking();
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
    }
  };

  // High-Accuracy Gemini Audio Recorder fallback / STT enhancement
  const handleToggleAudioRecording = async () => {
    setErrorMsg(null);
    if (isRecordingAudio && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecordingAudio(false);
      return;
    }

    if (!mediaRecordSupported) {
      setErrorMsg('Audio recording is not supported on this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermission('granted');
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = async () => {
          const base64Audio = String(reader.result || '');
          if (!base64Audio) return;
          setIsProcessing(true);
          try {
            const headers = await getAuthHeaders({
              'Content-Type': 'application/json',
              ...(settings.customGeminiApiKey ? { 'x-gemini-api-key': settings.customGeminiApiKey } : {}),
            });
            const res = await fetch('/api/voice/transcribe', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                audioData: base64Audio,
                mimeType: blob.type || 'audio/webm',
                languageHint: sourceLang,
                customApiKey: settings.customGeminiApiKey,
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Audio transcription failed (${res.status})`);
            const text = String(data.transcript || '').trim();
            if (!text) throw new Error('No speech was detected in the recorded audio.');
            if (activeToolRef.current === 'stt') {
              setSttTranscript((prev) => (prev ? `${prev} ${text}` : text));
            } else {
              inFlightRef.current = false;
              await handleSpokenResult(text);
            }
          } catch (err: any) {
            setErrorMsg(err?.message || 'Unable to transcribe recorded audio.');
          } finally {
            setIsProcessing(false);
          }
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      setIsRecordingAudio(true);
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        setMicPermission('denied');
        setErrorMsg('Microphone access denied.');
      } else {
        setErrorMsg('Could not start audio recorder.');
      }
    }
  };

  // AI Voice Generator: Calls Gemini Neural TTS (/api/voice/tts) to synthesize downloadable WAV
  const handleGenerateAiVoiceAudio = async () => {
    const clean = textInput.trim();
    if (!clean) {
      setErrorMsg('Enter the text you want to turn into generated AI speech.');
      return;
    }
    if (!isOnline) {
      setErrorMsg('AI Voice Generator requires an internet connection. Use Text to Speech offline fallback instead.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
        ...(settings.customGeminiApiKey ? { 'x-gemini-api-key': settings.customGeminiApiKey } : {}),
      });
      const res = await fetch('/api/voice/tts', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: clean,
          voiceName: geminiVoice,
          style: voiceStyle,
          languageName: sourceLangObj.name,
          customApiKey: settings.customGeminiApiKey,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.audioBase64) {
        throw new Error(data.error || `AI Voice Generator returned ${res.status}`);
      }

      const binary = atob(data.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const wavBlob = new Blob([bytes], { type: data.mimeType || 'audio/wav' });
      const url = URL.createObjectURL(wavBlob);

      if (generatedAudioUrl) URL.revokeObjectURL(generatedAudioUrl);
      setGeneratedAudioUrl(url);
      setGeneratedAudioMeta({
        voiceName: data.voiceName || geminiVoice,
        modelUsed: data.modelUsed || 'gemini-3.8-flash-lite-tts',
        latencyMs: data.latencyMs,
      });
    } catch (err: any) {
      setErrorMsg(
        `${err?.message || 'Gemini TTS failed.'} Tip: Click "Play via Browser TTS" to listen immediately.`
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyText = (id: string, text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="max-w-5xl mx-auto w-full px-3 sm:px-6 py-5 pb-32 space-y-5">
      {/* Header Banner */}
      <div className="glass-card rounded-3xl p-5 sm:p-6 border border-purple-400/35 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-purple-300">
            <Radio className="w-4 h-4 text-purple-400" />
            <span>Aadesh AI Voice Suite</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white">Voice Studio &amp; Speech Tools</h1>
          <p className="text-xs sm:text-sm text-purple-200/75">
            Speak, translate, transcribe, listen, and generate AI speech across global languages.
          </p>
        </div>

        {/* Microphone Permission Status + Request Button */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void requestMicrophoneAccess()}
            className={`min-h-[40px] px-3.5 py-2 rounded-2xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition-all ${
              micPermission === 'granted'
                ? 'bg-emerald-500/20 border-emerald-400/45 text-emerald-200'
                : micPermission === 'denied'
                ? 'bg-rose-500/20 border-rose-400/45 text-rose-200'
                : 'bg-purple-950/70 hover:bg-purple-900/70 border-purple-400/40 text-purple-100'
            }`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>
              {micPermission === 'granted'
                ? 'Microphone Allowed'
                : micPermission === 'denied'
                ? 'Microphone Blocked (Retry)'
                : micPermission === 'unsupported'
                ? 'Mic Unavailable'
                : 'Enable Microphone'}
            </span>
          </button>
        </div>
      </div>

      {/* 6 Voice Tools Selector Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {VOICE_TOOLS.map((tool) => {
          const ToolIcon = tool.icon;
          const isSelected = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => {
                handleStopAll();
                setErrorMsg(null);
                setActiveTool(tool.id);
              }}
              className={`min-h-[82px] p-3 rounded-2xl border text-left flex flex-col justify-between gap-2 transition-all cursor-pointer ${
                isSelected
                  ? 'purple-glow-btn text-white border-purple-300/60 shadow-lg'
                  : 'glass-card border-purple-400/25 hover:border-purple-400/55 text-purple-100'
              }`}
            >
              <ToolIcon className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-purple-300'}`} />
              <div>
                <div className="text-xs font-bold leading-tight">{tool.title}</div>
                <div
                  className={`text-[10px] leading-snug mt-0.5 line-clamp-2 ${
                    isSelected ? 'text-purple-100/90' : 'text-purple-200/70'
                  }`}
                >
                  {tool.subtitle}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Error Notice */}
      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-rose-950/70 border border-rose-400/45 text-rose-100 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-200 hover:text-white font-bold px-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Voice Stage */}
      <div className="glass-card rounded-3xl p-5 sm:p-7 border border-purple-400/35 space-y-6">
        {/* Language, Voice, Speed & Volume Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-purple-200">
              {activeTool === 'translator' ? 'Spoken Language' : 'Language'}
            </label>
            <select
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#0c081a] border border-purple-400/30 text-xs text-white outline-none"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.flag} {l.name} ({l.nativeName})
                </option>
              ))}
            </select>
          </div>

          {(activeTool === 'assistant' || activeTool === 'voice-chat' || activeTool === 'translator') && (
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-purple-200">
                {activeTool === 'translator' ? 'Translate To Language' : 'AI Reply Language'}
              </label>
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#0c081a] border border-purple-400/30 text-xs text-white outline-none"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.flag} {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {activeTool === 'generator' ? (
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-purple-200">Gemini AI Voice</label>
              <select
                value={geminiVoice}
                onChange={(e) => setGeminiVoice(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#0c081a] border border-purple-400/30 text-xs text-white outline-none"
              >
                {GEMINI_AI_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-purple-200">Speech Voice</label>
              <select
                value={selectedBrowserVoiceURI}
                onChange={(e) => setSelectedBrowserVoiceURI(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#0c081a] border border-purple-400/30 text-xs text-white outline-none"
              >
                <option value="">Auto Match ({sourceLangObj.name})</option>
                {availableVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-purple-200 flex items-center justify-between">
              <span>Speed</span>
              <span className="font-mono tabular-nums text-purple-300">
                {(settings.voiceSpeed ?? 1.0).toFixed(2)}x
              </span>
            </label>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.05"
              value={Math.max(0.5, Math.min(2.0, settings.voiceSpeed ?? 1.0))}
              onChange={(e) => {
                const next = Number(parseFloat(e.target.value).toFixed(2));
                voiceAssistant.setPlaybackSpeed(next);
                onUpdateSettings({ voiceSpeed: next });
              }}
              aria-label="Speech Speed"
              className="w-full accent-purple-500 cursor-pointer mt-2"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-purple-200 flex items-center justify-between">
              <span>Volume</span>
              <span className="font-mono tabular-nums text-purple-300">
                {Math.round((settings.voiceVolume ?? 1.0) * 100)}%
              </span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={Math.max(0, Math.min(1, settings.voiceVolume ?? 1.0))}
              onChange={(e) => {
                const next = Number(parseFloat(e.target.value).toFixed(2));
                voiceAssistant.configure({ volume: next });
                if (audioPlayerRef.current) {
                  audioPlayerRef.current.volume = next;
                }
                onUpdateSettings({ voiceVolume: next });
              }}
              aria-label="Speech Volume"
              className="w-full accent-purple-500 cursor-pointer mt-2"
            />
          </div>
        </div>

        {/* Center Large Animated Microphone & Sound-Wave Visualizer */}
        <div className="py-3 flex flex-col items-center space-y-5">
          <div className="relative flex items-center justify-center">
            {(isListening || isRecordingAudio || playback.isSpeaking) && (
              <span className="absolute w-36 h-36 rounded-full bg-purple-500/25 animate-ping" />
            )}
            <button
              type="button"
              onClick={handleStartAction}
              disabled={isProcessing}
              aria-label={isListening ? 'Stop listening' : 'Activate voice tool'}
              className={`relative w-28 h-28 rounded-full flex items-center justify-center transition-all shadow-2xl cursor-pointer border-2 ${
                isListening || isRecordingAudio
                  ? 'bg-gradient-to-tr from-rose-600 to-purple-600 border-rose-300 scale-105 shadow-[0_0_45px_rgba(244,63,94,0.5)]'
                  : playback.isSpeaking
                  ? 'bg-gradient-to-tr from-indigo-600 to-purple-600 border-purple-300 shadow-[0_0_45px_rgba(139,92,246,0.55)]'
                  : 'purple-glow-btn border-purple-300/60'
              } disabled:opacity-50`}
            >
              {isProcessing ? (
                <RefreshCw className="w-10 h-10 text-white animate-spin" />
              ) : isListening || isRecordingAudio ? (
                <Mic className="w-11 h-11 text-white animate-pulse" />
              ) : playback.isSpeaking ? (
                <Volume2 className="w-10 h-10 text-white" />
              ) : (
                <Mic className="w-11 h-11 text-white" />
              )}
            </button>
          </div>

          {/* Sound-Wave Visualization */}
          <div className="flex items-center justify-center gap-1.5 h-12 px-5 rounded-2xl bg-[#0b0718]/90 border border-purple-400/30">
            {[0.45, 0.85, 0.6, 1.0, 0.72, 0.95, 0.55, 0.9, 0.75, 1.0, 0.62, 0.88, 0.5, 0.8].map(
              (w, i) => {
                const active = isListening || isRecordingAudio;
                const level = active
                  ? 0.82
                  : playback.isSpeaking && !playback.isPaused && !playback.isMuted
                  ? playback.intensity
                  : 0.09;
                const hPx = Math.max(6, Math.round(6 + w * level * 32));
                return (
                  <span
                    key={i}
                    className={active ? 'wave-bar' : 'wave-bar wave-bar-live'}
                    style={{
                      height: active ? undefined : `${hPx}px`,
                      opacity: level > 0.1 ? 0.55 + w * level * 0.45 : 0.25,
                      animationDelay: `${(i % 5) * 0.12}s`,
                    }}
                  />
                );
              }
            )}
          </div>

          {/* Live Indicators */}
          <div className="text-center space-y-1">
            <div className="text-sm font-bold text-white">
              {isProcessing
                ? 'Processing with Gemini AI...'
                : isRecordingAudio
                ? 'Recording audio clip... Tap Stop Recorder when finished'
                : isListening
                ? `Listening (${sourceLangObj.name})... Speak now`
                : playback.isSpeaking
                ? playback.isPaused
                  ? 'Playback Paused'
                  : 'Speaking AI Audio'
                : VOICE_TOOLS.find((t) => t.id === activeTool)?.title}
            </div>
            {interimTranscript && (
              <p className="text-xs sm:text-sm text-purple-200 italic max-w-xl mx-auto">
                "{interimTranscript}"
              </p>
            )}
          </div>

          {/* Start / Stop / Pause / Resume / Mute / Record Audio Controls */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {activeTool !== 'tts' && activeTool !== 'generator' && (
              <>
                <button
                  type="button"
                  onClick={handleStartAction}
                  disabled={isProcessing}
                  className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer ${
                    isListening
                      ? 'bg-rose-600 hover:bg-rose-500 text-white'
                      : 'purple-glow-btn text-white'
                  }`}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  <span>
                    {isListening
                      ? 'Stop Listening'
                      : activeTool === 'voice-chat'
                      ? 'Start Voice Chat'
                      : 'Start Listening'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleToggleAudioRecording()}
                  disabled={isProcessing}
                  className={`min-h-[42px] px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                    isRecordingAudio
                      ? 'bg-rose-600/80 border-rose-400 text-white'
                      : 'bg-purple-950/60 hover:bg-purple-900/70 border-purple-400/35 text-purple-100'
                  }`}
                  title="Record microphone audio and transcribe using Gemini Audio"
                >
                  <FileAudio className="w-3.5 h-3.5" />
                  <span>{isRecordingAudio ? 'Stop & Transcribe' : 'Record Audio (Gemini)'}</span>
                </button>
              </>
            )}

            {activeTool === 'voice-chat' && (
              <button
                type="button"
                onClick={() => setHandsFreeLoop((prev) => !prev)}
                className={`min-h-[42px] px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                  handsFreeLoop
                    ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                    : 'bg-purple-950/60 border-white/15 text-purple-200'
                }`}
              >
                <span>Hands-Free Loop: {handsFreeLoop ? 'ON' : 'OFF'}</span>
              </button>
            )}

            {playback.isSpeaking && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    playback.isPaused ? voiceAssistant.resumeSpeaking() : voiceAssistant.pauseSpeaking()
                  }
                  className="min-h-[42px] px-3.5 py-2 rounded-xl bg-purple-950/70 hover:bg-purple-900/70 border border-purple-400/40 text-purple-100 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  {playback.isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  <span>{playback.isPaused ? 'Resume' : 'Pause'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleStopAll}
                  className="min-h-[42px] px-3.5 py-2 rounded-xl bg-rose-600/80 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-white" />
                  <span>Stop</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => voiceAssistant.setMuted(!playback.isMuted)}
              className={`min-h-[42px] px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                playback.isMuted
                  ? 'bg-amber-950/60 border-amber-400/40 text-amber-300'
                  : 'bg-purple-950/60 hover:bg-purple-900/70 border-purple-400/35 text-purple-100'
              }`}
            >
              {playback.isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              <span>{playback.isMuted ? 'Muted' : 'Audio On'}</span>
            </button>
          </div>
        </div>

        {/* Tool-Specific Interactive Panels */}
        {(activeTool === 'tts' || activeTool === 'generator') && (
          <div className="space-y-3 pt-2 border-t border-white/10">
            {activeTool === 'generator' && (
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-purple-200">
                  Voice Delivery Style (Optional)
                </label>
                <input
                  type="text"
                  value={voiceStyle}
                  onChange={(e) => setVoiceStyle(e.target.value)}
                  placeholder="e.g. Warm, confident narrator, energetic host..."
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[#0c081a] border border-purple-400/30 text-xs text-white outline-none"
                />
              </div>
            )}

            <textarea
              rows={4}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={
                activeTool === 'generator'
                  ? 'Enter text to generate downloadable Gemini AI speech audio...'
                  : 'Enter or paste text to read aloud...'
              }
              className="w-full p-3.5 rounded-2xl bg-[#0c081a] border border-purple-400/30 focus:border-purple-400 text-sm text-white placeholder-purple-300/45 outline-none"
            />

            <div className="flex flex-wrap items-center gap-2.5">
              {activeTool === 'tts' ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!textInput.trim()) {
                      setErrorMsg('Enter text first.');
                      return;
                    }
                    speakTextWithConfig(textInput.trim(), sourceLangObj.speechCode);
                  }}
                  className="purple-glow-btn min-h-[42px] px-5 py-2 rounded-xl text-xs sm:text-sm font-bold text-white flex items-center gap-2 cursor-pointer"
                >
                  <Play className="w-4 h-4" />
                  <span>Speak Text</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void handleGenerateAiVoiceAudio()}
                    disabled={isProcessing}
                    className="purple-glow-btn min-h-[42px] px-5 py-2 rounded-xl text-xs sm:text-sm font-bold text-white flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <AudioLines className="w-4 h-4" />
                    )}
                    <span>{isProcessing ? 'Generating WAV...' : 'Generate AI Voice (.wav)'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!textInput.trim()) {
                        setErrorMsg('Enter text first.');
                        return;
                      }
                      speakTextWithConfig(textInput.trim(), sourceLangObj.speechCode);
                    }}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-purple-950/70 hover:bg-purple-900/70 border border-purple-400/35 text-xs font-bold text-purple-100 flex items-center gap-2 cursor-pointer"
                  >
                    <Volume2 className="w-4 h-4" />
                    <span>Play via Browser TTS</span>
                  </button>
                </>
              )}
            </div>

            {activeTool === 'generator' && generatedAudioUrl && (
              <div className="p-4 rounded-2xl bg-[#0c081a] border border-purple-400/35 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-purple-200">
                  <span className="font-bold">
                    Generated Voice: {generatedAudioMeta?.voiceName} · {generatedAudioMeta?.modelUsed}
                  </span>
                  <a
                    href={generatedAudioUrl}
                    download={`aadesh-ai-voice-${Date.now()}.wav`}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600/80 hover:bg-emerald-500 text-white font-bold inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download WAV</span>
                  </a>
                </div>
                <audio ref={audioPlayerRef} controls src={generatedAudioUrl} className="w-full" />
              </div>
            )}
          </div>
        )}

        {activeTool === 'stt' && (
          <div className="space-y-3 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-purple-200">Speech-to-Text Output</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyText('stt', sttTranscript)}
                  disabled={!sttTranscript}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-purple-100 flex items-center gap-1 cursor-pointer disabled:opacity-40"
                >
                  {copiedId === 'stt' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId === 'stt' ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSttTranscript('')}
                  disabled={!sttTranscript}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-rose-500/20 text-xs text-purple-200 flex items-center gap-1 cursor-pointer disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              </div>
            </div>
            <textarea
              rows={4}
              value={sttTranscript}
              onChange={(e) => setSttTranscript(e.target.value)}
              placeholder="Your spoken speech will appear here in real time..."
              className="w-full p-3.5 rounded-2xl bg-[#0c081a] border border-purple-400/30 text-sm text-white placeholder-purple-300/45 outline-none"
            />
            {sttTranscript.trim() && (
              <button
                type="button"
                onClick={() => onOpenInChat(sttTranscript.trim())}
                className="purple-glow-btn min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Transcript to Chat</span>
              </button>
            )}
          </div>
        )}

        {activeTool === 'translator' && (
          <div className="space-y-3 pt-2 border-t border-white/10">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && textInput.trim()) {
                    void handleSpokenResult(textInput.trim());
                    setTextInput('');
                  }
                }}
                placeholder={`Speak with the mic or type in ${sourceLangObj.name} to translate & speak in ${targetLangObj.name}...`}
                className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl bg-[#0c081a] border border-purple-400/30 text-xs sm:text-sm text-white placeholder-purple-300/45 outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (!textInput.trim()) return;
                  const val = textInput.trim();
                  setTextInput('');
                  void handleSpokenResult(val);
                }}
                disabled={isProcessing || !textInput.trim()}
                className="purple-glow-btn min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold text-white cursor-pointer disabled:opacity-45 shrink-0"
              >
                Translate &amp; Speak
              </button>
            </div>

            {translatedOutput && (
              <div className="p-4 rounded-2xl bg-[#0c081a] border border-purple-400/35 flex items-center justify-between gap-3">
                <p
                  dir={isRtlLanguage(targetLang, translatedOutput) ? 'rtl' : 'ltr'}
                  className="text-sm text-purple-100 leading-relaxed"
                >
                  {translatedOutput}
                </p>
                <button
                  type="button"
                  onClick={() => speakTextWithConfig(translatedOutput, targetLangObj.speechCode)}
                  className="min-w-[40px] min-h-[40px] rounded-xl bg-purple-600/40 hover:bg-purple-600/60 text-white flex items-center justify-center shrink-0 cursor-pointer"
                  aria-label="Play translated speech"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {(activeTool === 'assistant' || activeTool === 'voice-chat') && (
          <div className="flex gap-2 pt-2 border-t border-white/10">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && textInput.trim()) {
                  const val = textInput.trim();
                  setTextInput('');
                  void handleSpokenResult(val);
                }
              }}
              placeholder="Or type a prompt here to hear Aadesh AI respond aloud..."
              className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl bg-[#0c081a] border border-purple-400/30 text-xs sm:text-sm text-white placeholder-purple-300/45 outline-none"
            />
            <button
              type="button"
              onClick={() => {
                if (!textInput.trim()) return;
                const val = textInput.trim();
                setTextInput('');
                void handleSpokenResult(val);
              }}
              disabled={isProcessing || !textInput.trim()}
              className="purple-glow-btn min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-45 shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Ask</span>
            </button>
          </div>
        )}
      </div>

      {/* Live Voice Conversation & Transcript Display */}
      <div className="glass-card rounded-3xl p-4 sm:p-5 border border-purple-400/25 space-y-3">
        <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
          <h2 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-purple-400" />
            <span>Voice Conversation &amp; Transcript</span>
          </h2>
          {turns.length > 0 && (
            <button
              type="button"
              onClick={() => setTurns([])}
              className="text-xs text-purple-300 hover:text-white cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {turns.length === 0 ? (
          <p className="text-xs text-purple-200/70 text-center py-6">
            Your spoken conversations and translations will appear here with instant replay.
          </p>
        ) : (
          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {turns.map((turn) => {
              const rtl = isRtlLanguage(turn.langCode, turn.translation || turn.text);
              const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === turn.langCode) || sourceLangObj;
              return (
                <div
                  key={turn.id}
                  dir={rtl ? 'rtl' : 'ltr'}
                  className={`p-3.5 rounded-2xl border text-xs sm:text-sm space-y-1.5 ${
                    turn.role === 'user'
                      ? 'bg-purple-900/35 border-purple-400/40 text-white ml-4 sm:ml-10'
                      : 'bg-[#0c081a] border-purple-400/25 text-gray-100 mr-4 sm:mr-10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[10px] text-purple-300 font-bold uppercase">
                    <span>{turn.role === 'user' ? 'You (Voice)' : 'Aadesh AI'}</span>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums">
                        {new Date(turn.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          speakTextWithConfig(turn.translation || turn.text, langObj.speechCode)
                        }
                        className="p-1 rounded hover:bg-white/10 text-purple-200 cursor-pointer"
                        title="Replay aloud"
                        aria-label="Replay spoken message"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
