// Speech Recognition & Synthesis utility for hands-free AI voice interaction

export interface SpeechRecognitionHandlers {
  onStart?: () => void;
  onResult: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

export class VoiceAssistant {
  private recognition: any = null;
  private isListening: boolean = false;
  private currentLanguage: string = 'en-US';

  constructor() {
    this.initRecognition();
  }

  private initRecognition(): boolean {
    if (typeof window === 'undefined') return false;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('Speech Recognition API not supported in this browser environment.');
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

  public startListening(
    langCode: string,
    handlers: SpeechRecognitionHandlers
  ): boolean {
    if (!this.recognition && !this.initRecognition()) {
      handlers.onError?.('Speech recognition is not supported in this browser.');
      return false;
    }

    if (this.isListening) {
      try {
        this.recognition.stop();
      } catch {}
    }

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
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      handlers.onResult(final || interim, Boolean(final));
    };

    this.recognition.onerror = (event: any) => {
      this.isListening = false;
      const errorMsg = event.error || 'Speech recognition encountered an issue.';
      handlers.onError?.(errorMsg);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      handlers.onEnd?.();
    };

    try {
      this.recognition.start();
      return true;
    } catch (err: any) {
      console.warn('Recognition start caught error:', err);
      handlers.onError?.(err?.message || 'Could not start microphone');
      return false;
    }
  }

  public stopListening(): void {
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

  // Text to Speech
  public speak(
    text: string,
    langCode: string = 'en-US',
    options?: {
      rate?: number;
      pitch?: number;
      onEnd?: () => void;
      onError?: (err: any) => void;
    }
  ): void {
    if (!this.isSpeechSynthesisSupported()) {
      options?.onEnd?.();
      return;
    }

    try {
      window.speechSynthesis.cancel(); // Cancel any existing speech

      const cleanText = text.replace(/[*#_`~\[\]]/g, '').trim();
      if (!cleanText) {
        options?.onEnd?.();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = langCode;
      utterance.rate = options?.rate ?? 1.0;
      utterance.pitch = options?.pitch ?? 1.0;

      // Select voice matching language if available
      const voices = window.speechSynthesis.getVoices();
      const matchingVoice = voices.find((v) => v.lang.startsWith(langCode.slice(0, 2)));
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }

      utterance.onend = () => {
        options?.onEnd?.();
      };

      utterance.onerror = (e) => {
        console.warn('Speech synthesis error:', e);
        options?.onError?.(e);
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error('Speech synthesis failure:', err);
      options?.onEnd?.();
    }
  }

  public stopSpeaking(): void {
    if (this.isSpeechSynthesisSupported()) {
      window.speechSynthesis.cancel();
    }
  }
}

export const voiceAssistant = new VoiceAssistant();
