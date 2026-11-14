// Speech Recognition & Synthesis utility for hands-free AI voice interaction

export interface SpeechRecognitionHandlers {
  onStart?: () => void;
  onResult: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

export interface VoicePlaybackState {
  isSpeaking: boolean;
  isPaused: boolean;
  isMuted: boolean;
  currentText: string;
  currentLang: string;
  rate: number;
  volume: number;
  intensity: number; // 0.0 to 1.0 real-time audio envelope
  lastError: string | null;
}

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  voiceURI?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
}

function mapRecognitionError(errorCode: string): string {
  switch (errorCode) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access was denied. Please allow microphone permissions in your browser and try again.';
    case 'no-speech':
      return 'No speech detected. Please speak closer to your microphone and try again.';
    case 'audio-capture':
      return 'No working microphone was detected on this device.';
    case 'network':
      return 'Speech recognition network error. Check your internet connection and retry.';
    case 'language-not-supported':
      return 'Selected speech recognition language is not supported by this browser. Try English (en-US).';
    default:
      return errorCode || 'Voice recognition encountered an issue.';
  }
}

function cleanTextForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*#_~>\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitIntoSpeechChunks(text: string, maxLength: number = 175): string[] {
  if (text.length <= maxLength) return [text];

  const sentences = text.match(/[^.!?।\n]+[.!?।\n]*/g) || [text];
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if ((current + ' ' + trimmed).trim().length <= maxLength) {
      current = (current + ' ' + trimmed).trim();
    } else {
      if (current) chunks.push(current);
      if (trimmed.length <= maxLength) {
        current = trimmed;
      } else {
        // Hard-split oversized sentence on word boundaries
        const words = trimmed.split(' ');
        let sub = '';
        for (const word of words) {
          if ((sub + ' ' + word).trim().length <= maxLength) {
            sub = (sub + ' ' + word).trim();
          } else {
            if (sub) chunks.push(sub);
            sub = word;
          }
        }
        current = sub;
      }
    }
  }

  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text];
}

export class VoiceAssistant {
  private recognition: any = null;
  private isListening: boolean = false;
  private manualStopRequested: boolean = false;
  private currentLanguage: string = 'en-US';
  private cachedVoices: SpeechSynthesisVoice[] = [];
  private speechToken: number = 0;
  private intensityTimer: ReturnType<typeof setInterval> | null = null;
  private boundaryBoostUntil: number = 0;
  private activeChunks: string[] = [];
  private activeChunkIndex: number = 0;
  private activeOptions: SpeakOptions | undefined;
  private activeLangCode: string = 'en-US';
  private defaultRate: number = 1.0;
  private defaultPitch: number = 1.0;
  private defaultVolume: number = 1.0;

  private playbackState: VoicePlaybackState = {
    isSpeaking: false,
    isPaused: false,
    isMuted: false,
    currentText: '',
    currentLang: 'en-US',
    rate: 1.0,
    volume: 1.0,
    intensity: 0,
    lastError: null,
  };

  private listeners = new Set<(state: VoicePlaybackState) => void>();

  constructor() {
    this.initRecognition();
    this.initVoices();
  }

  private initVoices(): void {
    if (!this.isSpeechSynthesisSupported()) return;
    try {
      this.cachedVoices = window.speechSynthesis.getVoices() || [];
      window.speechSynthesis.onvoiceschanged = () => {
        this.cachedVoices = window.speechSynthesis.getVoices() || [];
      };
    } catch {}
  }

  private initRecognition(): boolean {
    if (typeof window === 'undefined') return false;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return false;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;
      return true;
    } catch (e) {
      console.error('Error creating SpeechRecognition:', e);
      return false;
    }
  }

  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return Boolean(
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    );
  }

  public isSpeechSynthesisSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return 'speechSynthesis' in window;
  }

  public getAvailableVoices(langCode?: string): SpeechSynthesisVoice[] {
    if (!this.isSpeechSynthesisSupported()) return [];
    const voices = window.speechSynthesis.getVoices() || this.cachedVoices;
    if (voices.length > 0) this.cachedVoices = voices;
    if (!langCode) return voices;
    const prefix = langCode.slice(0, 2).toLowerCase();
    return voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  }

  public getPlaybackState(): VoicePlaybackState {
    return { ...this.playbackState };
  }

  public subscribePlayback(listener: (state: VoicePlaybackState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getPlaybackState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private updateState(patch: Partial<VoicePlaybackState>): void {
    this.playbackState = { ...this.playbackState, ...patch };
    const snapshot = this.getPlaybackState();
    this.listeners.forEach((fn) => fn(snapshot));
  }

  private startIntensityLoop(): void {
    this.stopIntensityLoop();
    let tick = 0;
    this.intensityTimer = setInterval(() => {
      tick += 1;
      if (!this.playbackState.isSpeaking || this.playbackState.isPaused || this.playbackState.isMuted) {
        this.updateState({ intensity: 0 });
        return;
      }

      const now = Date.now();
      const baseWave = 0.42 + 0.25 * Math.sin(tick * 0.75) + 0.15 * Math.cos(tick * 1.45);
      const boost = now < this.boundaryBoostUntil ? 0.28 : 0;
      const vol = Math.max(0.1, this.playbackState.volume);
      const nextIntensity = Math.min(1, Math.max(0.12, (baseWave + boost) * vol));
      this.updateState({ intensity: nextIntensity });
    }, 95);
  }

  private stopIntensityLoop(): void {
    if (this.intensityTimer) {
      clearInterval(this.intensityTimer);
      this.intensityTimer = null;
    }
  }

  public startListening(
    langCode: string,
    handlers: SpeechRecognitionHandlers
  ): boolean {
    if (!this.recognition && !this.initRecognition()) {
      const msg = 'Voice recognition is not supported in this browser. Try Chrome on desktop or Android, or type your message.';
      this.updateState({ lastError: msg });
      handlers.onError?.(msg);
      return false;
    }

    // Stop AI playback to prevent acoustic feedback / self-listening
    if (this.playbackState.isSpeaking) {
      this.stopSpeaking();
    }

    if (this.isListening) {
      try {
        this.manualStopRequested = true;
        this.recognition.stop();
      } catch {}
    }

    this.manualStopRequested = false;
    this.updateState({ lastError: null });
    this.currentLanguage = langCode || 'en-US';
    this.recognition.lang = this.currentLanguage;

    this.recognition.onstart = () => {
      this.isListening = true;
      handlers.onStart?.();
    };

    this.recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      handlers.onResult(final || interim, Boolean(final));
    };

    this.recognition.onerror = (event: any) => {
      this.isListening = false;
      const errCode = event?.error || '';
      if (errCode === 'aborted' && this.manualStopRequested) {
        return;
      }
      const friendlyMsg = mapRecognitionError(errCode);
      this.updateState({ lastError: friendlyMsg });
      handlers.onError?.(friendlyMsg);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      handlers.onEnd?.();
    };

    try {
      this.recognition.start();
      return true;
    } catch (err: any) {
      const friendlyMsg = err?.message || 'Could not start microphone.';
      this.updateState({ lastError: friendlyMsg });
      handlers.onError?.(friendlyMsg);
      return false;
    }
  }

  public stopListening(): void {
    this.manualStopRequested = true;
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {}
      this.isListening = false;
    }
  }

  public getIsListening(): boolean {
    return this.isListening;
  }

  private resolveVoice(langCode: string, voiceURI?: string): SpeechSynthesisVoice | undefined {
    const voices = window.speechSynthesis.getVoices() || this.cachedVoices;
    if (voices.length > 0) this.cachedVoices = voices;
    if (!voices.length) return undefined;

    if (voiceURI) {
      const explicit = voices.find((v) => v.voiceURI === voiceURI);
      if (explicit) return explicit;
    }

    const lowerLang = (langCode || 'en-US').toLowerCase();
    const prefix = lowerLang.slice(0, 2);

    const exact = voices.find((v) => v.lang.toLowerCase() === lowerLang);
    if (exact) return exact;

    const prefixMatch = voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
    if (prefixMatch) return prefixMatch;

    // Devanagari script compatibility fallback if browser lacks dedicated ne-NP TTS voice
    if (prefix === 'ne') {
      return voices.find((v) => v.lang.toLowerCase().startsWith('hi'));
    }

    return undefined;
  }

  private speakChunkAtIndex(index: number, token: number): void {
    if (token !== this.speechToken) return;
    if (index >= this.activeChunks.length) {
      this.stopIntensityLoop();
      this.updateState({
        isSpeaking: false,
        isPaused: false,
        intensity: 0,
      });
      this.activeOptions?.onEnd?.();
      return;
    }

    this.activeChunkIndex = index;
    const chunkText = this.activeChunks[index];
    const utterance = new SpeechSynthesisUtterance(chunkText);
    utterance.lang = this.activeLangCode;
    utterance.rate = Math.max(0.5, Math.min(2.0, this.activeOptions?.rate ?? this.defaultRate));
    utterance.pitch = Math.max(0.5, Math.min(2.0, this.activeOptions?.pitch ?? this.defaultPitch));

    const targetVolume = Math.max(
      0,
      Math.min(1, this.activeOptions?.volume ?? this.defaultVolume ?? this.playbackState.volume)
    );
    utterance.volume = this.playbackState.isMuted ? 0 : targetVolume;

    const matchedVoice = this.resolveVoice(this.activeLangCode, this.activeOptions?.voiceURI);
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }

    utterance.onboundary = () => {
      if (token !== this.speechToken) return;
      this.boundaryBoostUntil = Date.now() + 260;
    };

    utterance.onend = () => {
      if (token !== this.speechToken) return;
      this.speakChunkAtIndex(index + 1, token);
    };

    utterance.onerror = (e: any) => {
      if (token !== this.speechToken) return;
      const errType = e?.error || '';
      if (errType === 'canceled' || errType === 'interrupted') {
        return;
      }
      this.stopIntensityLoop();
      const friendlyErr = 'Voice synthesis playback was interrupted by the browser.';
      this.updateState({
        isSpeaking: false,
        isPaused: false,
        intensity: 0,
        lastError: friendlyErr,
      });
      this.activeOptions?.onError?.(e);
    };

    window.speechSynthesis.speak(utterance);
  }

  // Text to Speech (chunked for desktop & Android Chrome reliability)
  public speak(
    text: string,
    langCode: string = 'en-US',
    options?: SpeakOptions
  ): void {
    if (!this.isSpeechSynthesisSupported()) {
      const msg = 'Text-to-speech is not supported in this browser.';
      this.updateState({ lastError: msg });
      options?.onEnd?.();
      return;
    }

    try {
      this.speechToken += 1;
      const token = this.speechToken;
      window.speechSynthesis.cancel();

      const cleanText = cleanTextForSpeech(text);
      if (!cleanText) {
        this.stopIntensityLoop();
        this.updateState({ isSpeaking: false, isPaused: false, intensity: 0 });
        options?.onEnd?.();
        return;
      }

      const effectiveRate = Math.max(0.5, Math.min(2.0, options?.rate ?? this.defaultRate));
      const effectiveVolume = Math.max(
        0,
        Math.min(1, options?.volume ?? this.defaultVolume ?? this.playbackState.volume ?? 1.0)
      );
      this.activeChunks = splitIntoSpeechChunks(cleanText, 175);
      this.activeChunkIndex = 0;
      this.activeOptions = options;
      this.activeLangCode = langCode || 'en-US';

      this.updateState({
        isSpeaking: true,
        isPaused: false,
        currentText: cleanText,
        currentLang: this.activeLangCode,
        rate: effectiveRate,
        volume: effectiveVolume,
        intensity: this.playbackState.isMuted ? 0 : 0.45 * effectiveVolume,
        lastError: null,
      });

      options?.onStart?.();
      this.startIntensityLoop();
      this.speakChunkAtIndex(0, token);
    } catch (err) {
      console.error('Speech synthesis failure:', err);
      this.stopIntensityLoop();
      this.updateState({ isSpeaking: false, isPaused: false, intensity: 0 });
      options?.onEnd?.();
    }
  }

  public pauseSpeaking(): void {
    if (!this.isSpeechSynthesisSupported() || !this.playbackState.isSpeaking) return;
    try {
      window.speechSynthesis.pause();
      this.updateState({ isPaused: true, intensity: 0 });
    } catch {}
  }

  public resumeSpeaking(): void {
    if (!this.isSpeechSynthesisSupported() || !this.playbackState.isSpeaking) return;
    try {
      window.speechSynthesis.resume();
      this.updateState({ isPaused: false });
    } catch {}
  }

  public setMuted(muted: boolean): void {
    const wasSpeaking = this.playbackState.isSpeaking;
    const isPaused = this.playbackState.isPaused;
    this.updateState({ isMuted: muted, intensity: muted ? 0 : this.playbackState.intensity });

    // Re-apply volume on remaining queued chunks immediately if speaking
    if (wasSpeaking && !isPaused && this.isSpeechSynthesisSupported()) {
      const remaining = this.activeChunks.slice(this.activeChunkIndex).join(' ');
      if (remaining) {
        this.speechToken += 1;
        const token = this.speechToken;
        window.speechSynthesis.cancel();
        this.activeChunks = splitIntoSpeechChunks(remaining, 175);
        this.activeChunkIndex = 0;
        this.speakChunkAtIndex(0, token);
      }
    }
  }

  public configure(config: { rate?: number; pitch?: number; volume?: number }): void {
    let rateChanged = false;
    if (typeof config.rate === 'number' && !Number.isNaN(config.rate)) {
      const clampedRate = Math.max(0.5, Math.min(2.0, Number(config.rate.toFixed(2))));
      if (clampedRate !== this.defaultRate) {
        this.defaultRate = clampedRate;
        rateChanged = true;
      }
    }
    if (typeof config.pitch === 'number' && !Number.isNaN(config.pitch)) {
      this.defaultPitch = Math.max(0.5, Math.min(2.0, Number(config.pitch.toFixed(2))));
    }
    if (typeof config.volume === 'number' && !Number.isNaN(config.volume)) {
      this.defaultVolume = Math.max(0, Math.min(1, Number(config.volume.toFixed(2))));
    }

    this.updateState({
      rate: this.defaultRate,
      volume: this.defaultVolume,
    });

    if (rateChanged && this.activeOptions && typeof this.activeOptions.rate === 'number') {
      this.activeOptions = { ...this.activeOptions, rate: this.defaultRate };
    }

    // Re-apply updated rate on remaining queued chunks immediately if actively speaking
    if (
      rateChanged &&
      this.playbackState.isSpeaking &&
      !this.playbackState.isPaused &&
      this.isSpeechSynthesisSupported()
    ) {
      const remaining = this.activeChunks.slice(this.activeChunkIndex).join(' ');
      if (remaining) {
        this.speechToken += 1;
        const token = this.speechToken;
        window.speechSynthesis.cancel();
        this.activeChunks = splitIntoSpeechChunks(remaining, 175);
        this.activeChunkIndex = 0;
        this.speakChunkAtIndex(0, token);
      }
    }
  }

  public setPlaybackSpeed(rate: number): void {
    this.configure({ rate });
  }

  public getDefaultConfig(): { rate: number; pitch: number; volume: number } {
    return {
      rate: this.defaultRate,
      pitch: this.defaultPitch,
      volume: this.defaultVolume,
    };
  }

  public clearError(): void {
    this.updateState({ lastError: null });
  }

  public stopSpeaking(): void {
    this.speechToken += 1;
    this.stopIntensityLoop();
    if (this.isSpeechSynthesisSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    this.updateState({
      isSpeaking: false,
      isPaused: false,
      intensity: 0,
    });
  }
}

export const voiceAssistant = new VoiceAssistant();
