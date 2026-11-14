import React, { useState } from 'react';
import {
  Mic,
  Play,
  Square,
  Copy,
  Check,
  Trash2,
  Search,
  MessageSquare,
  Languages,
  Clock,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { VoiceHistoryEntry, AppSettings, UserProfile } from '../types';
import { voiceAssistant } from '../utils/speech';
import { SUPPORTED_LANGUAGES } from '../data/languages';

interface VoiceHistoryViewProps {
  entries: VoiceHistoryEntry[];
  onDeleteEntry: (id: string) => void;
  onClearAll: () => void;
  onSendToChat: (transcript: string) => void;
  settings: AppSettings;
  user: UserProfile;
  onAddNewVoiceInput?: (text: string, language: string) => void;
}

export const VoiceHistoryView: React.FC<VoiceHistoryViewProps> = ({
  entries,
  onDeleteEntry,
  onClearAll,
  onSendToChat,
  settings,
  user,
  onAddNewVoiceInput,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLang, setSelectedLang] = useState<string>('all');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTranscript, setRecordingTranscript] = useState('');

  // Filtering
  const filteredEntries = entries.filter((entry) => {
    const matchesSearch =
      entry.transcript.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (entry.targetTranslation && entry.targetTranslation.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesLang = selectedLang === 'all' || entry.language === selectedLang;
    return matchesSearch && matchesLang;
  });

  // Play audio of the transcript
  const handlePlayVoice = (entry: VoiceHistoryEntry) => {
    if (playingId === entry.id) {
      voiceAssistant.stopSpeaking();
      setPlayingId(null);
      return;
    }

    voiceAssistant.stopSpeaking();
    setPlayingId(entry.id);

    const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === entry.language);
    const speechCode = langObj?.speechCode || 'en-US';

    voiceAssistant.speak(entry.transcript, speechCode, {
      rate: settings.voiceSpeed ?? 1.0,
      pitch: settings.voicePitch ?? 1.0,
      volume: settings.voiceVolume ?? 1.0,
      onEnd: () => setPlayingId(null),
      onError: () => setPlayingId(null),
    });
  };

  // Copy transcript
  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Quick live voice recording directly in the history tab
  const handleToggleRecord = () => {
    if (isRecording) {
      voiceAssistant.stopListening();
      setIsRecording(false);
      if (recordingTranscript.trim() && onAddNewVoiceInput) {
        onAddNewVoiceInput(recordingTranscript.trim(), settings.uiLanguage || 'en');
        setRecordingTranscript('');
      }
      return;
    }

    setIsRecording(true);
    setRecordingTranscript('');
    const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === settings.uiLanguage) || SUPPORTED_LANGUAGES[0];

    voiceAssistant.startListening(langObj.speechCode, {
      onResult: (transcript, isFinal) => {
        setRecordingTranscript(transcript);
        if (isFinal) {
          setIsRecording(false);
          if (transcript.trim() && onAddNewVoiceInput) {
            onAddNewVoiceInput(transcript.trim(), settings.uiLanguage || 'en');
            setRecordingTranscript('');
          }
        }
      },
      onError: (err) => {
        console.warn('Voice recording error:', err);
        setIsRecording(false);
      },
      onEnd: () => {
        setIsRecording(false);
      },
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 space-y-6 pb-32">
      {/* Header Banner */}
      <div className="glass-card rounded-2xl p-4 sm:p-6 border border-purple-500/30 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-950/70 border border-purple-500/30 text-purple-300 text-xs font-semibold mb-1">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Voice-to-Text Transcription Vault</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white">Voice Input History</h2>
            <p className="text-xs sm:text-sm text-gray-400">
              Review, listen to, search, and transcribe your hands-free voice inputs across all sessions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Direct voice dictation trigger */}
            <button
              onClick={handleToggleRecord}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all shadow-lg cursor-pointer ${
                isRecording
                  ? 'bg-rose-600 text-white animate-pulse border border-rose-400'
                  : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white'
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>{isRecording ? 'Listening (Tap to stop)...' : 'Record New Voice'}</span>
            </button>

            {entries.length > 0 && (
              <button
                onClick={onClearAll}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
                title="Clear all voice logs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear All</span>
              </button>
            )}
          </div>
        </div>

        {/* Live recording transcript indicator */}
        {isRecording && (
          <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-500/30 text-purple-200 text-xs flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-4 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-6 bg-pink-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-4 bg-indigo-400 rounded-full animate-bounce" />
            </div>
            <p className="truncate italic">
              {recordingTranscript || 'Listening... Speak clearly into your microphone.'}
            </p>
          </div>
        )}

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-white/5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search previous voice recordings or transcripts..."
              className="w-full bg-[#131520] border border-[#232738] rounded-xl pl-9 pr-4 py-2 text-xs sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedLang}
              onChange={(e) => setSelectedLang(e.target.value)}
              className="bg-[#131520] border border-[#232738] rounded-xl px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-purple-500"
            >
              <option value="all">All Languages</option>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Voice Entries List */}
      {filteredEntries.length === 0 ? (
        <div className="text-center py-12 px-4 rounded-2xl bg-[#0e1017]/80 border border-dashed border-[#232738] space-y-3">
          <div className="w-12 h-12 rounded-full bg-purple-950/60 border border-purple-500/30 flex items-center justify-center mx-auto text-purple-400">
            <Mic className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">No voice recordings found</h3>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            {searchQuery
              ? 'No voice transcripts match your search term. Try a different query.'
              : 'Use the microphone in Chat & Vision or tap "Record New Voice" above to record and transcribe spoken thoughts.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-gray-400">
              Showing {filteredEntries.length} {filteredEntries.length === 1 ? 'recording' : 'recordings'}
            </span>
            <span className="text-xs text-purple-400/80">Account: {user.name}</span>
          </div>

          {filteredEntries.map((entry) => {
            const isPlaying = playingId === entry.id;
            const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === entry.language);

            return (
              <div
                key={entry.id}
                className="group p-4 rounded-xl bg-[#11131c] hover:bg-[#151824] border border-[#232738] hover:border-purple-500/30 transition-all shadow-md space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-950/60 border border-purple-500/20 text-purple-300 text-[11px] font-semibold">
                      <Languages className="w-3 h-3" />
                      <span>{langObj ? `${langObj.flag} ${langObj.name}` : entry.language.toUpperCase()}</span>
                    </span>

                    <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(entry.timestamp).toLocaleString()}</span>
                    </span>

                    {entry.durationSeconds && (
                      <span className="text-[11px] text-gray-500">
                        ~{entry.durationSeconds}s duration
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {/* Play/Listen */}
                    <button
                      onClick={() => handlePlayVoice(entry)}
                      className={`p-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        isPlaying
                          ? 'bg-purple-600 text-white ring-2 ring-purple-400'
                          : 'bg-[#1b1e2c] text-purple-300 hover:text-white hover:bg-purple-900/50'
                      }`}
                      title={isPlaying ? 'Stop voice playback' : 'Listen to transcription audio'}
                    >
                      {isPlaying ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                    </button>

                    {/* Copy */}
                    <button
                      onClick={() => handleCopy(entry.id, entry.transcript)}
                      className="p-1.5 rounded-lg bg-[#1b1e2c] text-gray-300 hover:text-white hover:bg-[#252a3d] transition-all cursor-pointer"
                      title="Copy transcript"
                    >
                      {copiedId === entry.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>

                    {/* Send to chat */}
                    <button
                      onClick={() => onSendToChat(entry.transcript)}
                      className="p-1.5 rounded-lg bg-[#1b1e2c] text-purple-300 hover:text-white hover:bg-purple-900/50 transition-all cursor-pointer"
                      title="Send this input into Chat with Aadesh AI"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => onDeleteEntry(entry.id)}
                      className="p-1.5 rounded-lg bg-[#1b1e2c] text-gray-400 hover:text-rose-400 hover:bg-rose-950/30 transition-all cursor-pointer"
                      title="Delete recording log"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Transcript text */}
                <div className="p-3 rounded-lg bg-[#0a0b10] border border-white/5">
                  <p className="text-xs sm:text-sm text-gray-200 leading-relaxed font-sans select-text">
                    "{entry.transcript}"
                  </p>
                </div>

                {/* Translated text if available */}
                {entry.targetTranslation && (
                  <div className="p-2.5 rounded-lg bg-purple-950/20 border border-purple-500/20">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-purple-400 block mb-1">
                      Translation Preview
                    </span>
                    <p className="text-xs text-purple-200 italic">
                      {entry.targetTranslation}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
