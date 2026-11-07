import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { AppSettings, ChatMessage, ChatSession, EngagementMetrics, GeotaggedMedia, LocationData } from './types';
import {
  DEFAULT_SETTINGS,
  getStoredMedia,
  getStoredMetrics,
  getStoredSessions,
  getStoredSettings,
  recordMetricEvent,
  saveStoredMedia,
  saveStoredMetrics,
  saveStoredSessions,
  saveStoredSettings,
} from './utils/storage';
import { SUPPORTED_LANGUAGES, VOICE_PERSONAS } from './data/languages';
import { Header } from './components/Header';
import { NavigationDock } from './components/NavigationDock';
import { ChatView } from './components/ChatView';
import { InterpreterView } from './components/InterpreterView';
import { GeotagGalleryView } from './components/GeotagGalleryView';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { SettingsModal } from './components/SettingsModal';
import { voiceAssistant } from './utils/speech';

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(getStoredSettings());
  const [sessions, setSessions] = useState<ChatSession[]>(getStoredSessions());
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    const stored = getStoredSessions();
    return stored[0]?.id || 'session-default-welcome';
  });
  const [mediaItems, setMediaItems] = useState<GeotaggedMedia[]>(getStoredMedia());
  const [metrics, setMetrics] = useState<EngagementMetrics>(getStoredMetrics());
  const [activeTab, setActiveTab] = useState<string>('chat');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isBrowserOnline, setIsBrowserOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Computed online status considering user forced offline setting
  const isOnline = isBrowserOnline && !settings.offlineModeForce;

  // Listen for browser online / offline events
  useEffect(() => {
    const handleOnline = () => setIsBrowserOnline(true);
    const handleOffline = () => setIsBrowserOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial setup of font size and high contrast classes on body
    saveStoredSettings(settings);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Update settings helper
  const handleUpdateSettings = (newSettings: Partial<AppSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    saveStoredSettings(updated);
  };

  // Toggle force offline simulation
  const handleToggleForceOffline = () => {
    handleUpdateSettings({ offlineModeForce: !settings.offlineModeForce });
  };

  // Current session object
  const currentSession =
    sessions.find((s) => s.id === currentSessionId) || sessions[0] || {
      id: 'session-default-welcome',
      title: 'Global Travel & Translation',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      targetLanguage: settings.defaultTargetLanguage,
      messages: [],
    };

  // Send message in Chat View
  const handleSendMessage = async (params: {
    text: string;
    imageData?: string;
    imageMimeType?: string;
    location?: LocationData;
    isVoice?: boolean;
    targetLanguage: string;
  }) => {
    const userMsgId = `usr-${Date.now()}`;
    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: params.text || (params.imageData ? 'Shared a photograph for visual analysis' : ''),
      timestamp: Date.now(),
      imageUrl: params.imageData,
      location: params.location,
      isVoiceInput: params.isVoice,
    };

    const updatedMessages = [...currentSession.messages, userMessage];

    // Auto-generate title if this is the first user message
    let sessionTitle = currentSession.title;
    if (currentSession.messages.length <= 1 && params.text) {
      sessionTitle = params.text.slice(0, 32) + (params.text.length > 32 ? '...' : '');
    }

    const updatedSession: ChatSession = {
      ...currentSession,
      title: sessionTitle,
      updatedAt: Date.now(),
      messages: updatedMessages,
    };

    const updatedSessions = sessions.map((s) => (s.id === currentSession.id ? updatedSession : s));
    setSessions(updatedSessions);
    saveStoredSessions(updatedSessions);

    // Call AI Backend or Offline Engine
    setIsLoading(true);
    const startTime = Date.now();

    try {
      let reply = '';
      let translation = '';
      let detectedLanguage = 'en';
      let sentiment: 'positive' | 'curious' | 'inquiry' | 'urgent' | 'neutral' = 'positive';
      let suggestedQuestions: string[] = [];
      let geotagInsights: string | undefined = undefined;
      let latencyMs = 280;

      if (!isOnline) {
        // Offline heuristic engine
        latencyMs = 120;
        const targetLangObj =
          SUPPORTED_LANGUAGES.find((l) => l.code === params.targetLanguage) || SUPPORTED_LANGUAGES[0];

        if (params.imageData) {
          reply = `[Offline Local Engine] I registered your photo${params.location ? ` tagged at ${params.location.name}` : ''}. Stored in your local offline gallery.`;
          translation = `[${targetLangObj.name} Offline] Imagen registrada y guardada localmente.`;
        } else {
          reply = `[Offline Mode] Your inquiry "${params.text}" has been logged. Using local phrasebook & cached regional translation engine for ${targetLangObj.name}.`;
          translation = `[${targetLangObj.name} Translation] Mensaje procesado sin conexión.`;
        }
        sentiment = 'neutral';
        suggestedQuestions = ['Browse offline phrasebook', 'Check emergency phrases'];
      } else {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
            currentMessage: params.text,
            imageData: params.imageData,
            imageMimeType: params.imageMimeType,
            targetLanguage: params.targetLanguage,
            userLanguage: settings.uiLanguage,
            voicePersona: settings.voicePersona || 'friendly',
            location: params.location,
            mode: 'chat',
          }),
        });

        const data = await res.json();
        reply = data.reply || 'Response received.';
        translation = data.translation || '';
        detectedLanguage = data.detectedLanguage || 'en';
        sentiment = data.sentiment || 'positive';
        suggestedQuestions = data.suggestedQuestions || [];
        geotagInsights = data.geotagInsights;
        latencyMs = data.latencyMs || Date.now() - startTime;
      }

      const modelMessage: ChatMessage = {
        id: `mod-${Date.now()}`,
        role: 'model',
        content: reply,
        translation,
        detectedLanguage,
        sentiment,
        suggestedQuestions,
        geotagInsights,
        timestamp: Date.now(),
        isOffline: !isOnline,
      };

      const finalSession: ChatSession = {
        ...updatedSession,
        messages: [...updatedMessages, modelMessage],
      };

      const finalSessions = sessions.map((s) => (s.id === currentSession.id ? finalSession : s));
      setSessions(finalSessions);
      saveStoredSessions(finalSessions);

      // Record engagement metrics
      recordMetricEvent({
        isVoice: params.isVoice,
        isImage: Boolean(params.imageData),
        isTranslation: Boolean(translation),
        language: params.targetLanguage,
        locationName: params.location?.name,
        latencyMs,
        sentiment,
      });
      setMetrics(getStoredMetrics());

      // Read aloud if setting or hands-free is enabled
      if (settings.autoSpeakAIResponses || settings.handsFreeMode) {
        const targetLangObj =
          SUPPORTED_LANGUAGES.find((l) => l.code === params.targetLanguage) || SUPPORTED_LANGUAGES[0];
        const activePersonaObj =
          VOICE_PERSONAS.find((p) => p.id === (settings.voicePersona || 'friendly')) || VOICE_PERSONAS[3];
        voiceAssistant.speak(translation || reply, targetLangObj.speechCode, {
          rate: settings.voiceSpeed * activePersonaObj.rate,
          pitch: settings.voicePitch * activePersonaObj.pitch,
        });
      }
    } catch (err) {
      console.error('Chat error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Create new session
  const handleNewSession = () => {
    const newSession: ChatSession = {
      id: `session-${Date.now()}`,
      title: `Conversation ${sessions.length + 1}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      targetLanguage: settings.defaultTargetLanguage,
      messages: [],
    };
    const updated = [newSession, ...sessions];
    setSessions(updated);
    setCurrentSessionId(newSession.id);
    saveStoredSessions(updated);
  };

  // Delete session
  const handleDeleteSession = (id: string) => {
    const remaining = sessions.filter((s) => s.id !== id);
    if (remaining.length === 0) {
      handleNewSession();
      return;
    }
    setSessions(remaining);
    saveStoredSessions(remaining);
    if (currentSessionId === id) {
      setCurrentSessionId(remaining[0].id);
    }
  };

  // Clear current session messages
  const handleClearCurrentSession = () => {
    const updated = sessions.map((s) => (s.id === currentSession.id ? { ...s, messages: [] } : s));
    setSessions(updated);
    saveStoredSessions(updated);
  };

  // Update target language for current session
  const handleUpdateSessionTargetLang = (lang: string) => {
    const updated = sessions.map((s) => (s.id === currentSession.id ? { ...s, targetLanguage: lang } : s));
    setSessions(updated);
    saveStoredSessions(updated);
  };

  // Add media to Geotag gallery
  const handleAddMedia = (media: GeotaggedMedia) => {
    const updated = [media, ...mediaItems];
    setMediaItems(updated);
    saveStoredMedia(updated);

    recordMetricEvent({
      isImage: true,
      locationName: media.location.name,
      sentiment: 'curious',
    });
    setMetrics(getStoredMetrics());

    // Trigger joyful celebration confetti
    try {
      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.7 },
      });
    } catch {}
  };

  // Delete media
  const handleDeleteMedia = (id: string) => {
    const updated = mediaItems.filter((m) => m.id !== id);
    setMediaItems(updated);
    saveStoredMedia(updated);
  };

  // Record translation metric from interpreter
  const handleRecordTranslationMetric = (langA: string, langB: string, latencyMs: number) => {
    recordMetricEvent({
      isTranslation: true,
      language: langB,
      latencyMs,
      sentiment: 'positive',
    });
    setMetrics(getStoredMetrics());
  };

  // Reset all local storage data
  const handleClearAllData = () => {
    localStorage.clear();
    setSettings(DEFAULT_SETTINGS);
    setSessions(getStoredSessions());
    setMediaItems(getStoredMedia());
    setMetrics(getStoredMetrics());
    setIsSettingsModalOpen(false);
  };

  return (
    <div className="min-h-screen relative flex flex-col justify-between selection:bg-purple-500/30 selection:text-purple-200">
      {/* Ambient Glowing Background Orbs & 3D Spheres (Matching user's attachment) */}
      <div className="orb w-[380px] h-[380px] bg-purple-600/25 top-[-40px] left-[-90px] animate-pulse-glow" />
      <div className="orb w-[500px] h-[500px] bg-indigo-600/20 top-[25%] right-[-140px] animate-float-slow" />
      <div className="orb w-[340px] h-[340px] bg-violet-600/20 bottom-[15%] left-[25%] animate-float-delayed" />
      {/* Glossy 3D Purple Floating Spheres matching screenshot mockup */}
      <div className="sphere-3d w-28 h-28 absolute top-20 right-12 opacity-35 animate-float-slow hidden lg:block" />
      <div className="sphere-3d w-16 h-16 absolute top-1/2 left-8 opacity-25 animate-float-delayed hidden md:block" />
      <div className="sphere-3d w-20 h-20 absolute bottom-28 right-1/4 opacity-30 animate-pulse-glow hidden sm:block" />

      {/* TOP HEADER */}
      <Header
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        isOnline={isOnline}
        onToggleForceOffline={handleToggleForceOffline}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        totalTranslations={metrics.totalTranslations}
      />

      {/* Offline Alert Strip if Offline */}
      {!isOnline && (
        <div className="bg-amber-950/80 border-b border-amber-500/40 text-amber-200 text-xs py-1.5 px-4 text-center z-30 font-medium flex items-center justify-center gap-2">
          <span>⚠️ Offline Mode Active: Conversations and geotags are saved locally. Cloud AI will sync once reconnected.</span>
          <button
            onClick={handleToggleForceOffline}
            className="underline hover:text-white font-bold ml-1"
          >
            Reconnect
          </button>
        </div>
      )}

      {/* MAIN VIEWPORT */}
      <main className="relative z-10 flex-grow w-full flex flex-col">
        {/* VIEW 1: CHAT & VISION BOT */}
        {activeTab === 'chat' && (
          <ChatView
            currentSession={currentSession}
            allSessions={sessions}
            onSelectSession={setCurrentSessionId}
            onNewSession={handleNewSession}
            onDeleteSession={handleDeleteSession}
            onClearCurrentSession={handleClearCurrentSession}
            onSendMessage={handleSendMessage}
            onUpdateSessionTargetLang={handleUpdateSessionTargetLang}
            settings={settings}
            isOnline={isOnline}
            isLoading={isLoading}
            searchFilter={searchQuery}
          />
        )}

        {/* VIEW 2: LIVE REAL-TIME INTERPRETER */}
        {activeTab === 'interpret' && (
          <InterpreterView
            settings={settings}
            isOnline={isOnline}
            onRecordTranslationMetric={handleRecordTranslationMetric}
          />
        )}

        {/* VIEW 3: GEOTAG GALLERY & CONTENT MANAGEMENT */}
        {activeTab === 'gallery' && (
          <GeotagGalleryView
            mediaItems={mediaItems}
            onAddMedia={handleAddMedia}
            onDeleteMedia={handleDeleteMedia}
            isOnline={isOnline}
          />
        )}

        {/* VIEW 4: ANALYTICS DASHBOARD */}
        {activeTab === 'analytics' && <AnalyticsDashboard metrics={metrics} />}

        {/* VIEW 5: SETTINGS DIRECT VIEW (also reachable via modal) */}
        {activeTab === 'settings' && (
          <div className="max-w-4xl mx-auto px-4 py-8 w-full pb-28">
            <button
              onClick={() => setIsSettingsModalOpen(true)}
              className="purple-glow-btn text-white text-sm font-semibold py-3 px-6 rounded-2xl flex items-center gap-2 mx-auto"
            >
              Open Full Personalization Settings Modal
            </button>
          </div>
        )}
      </main>

      {/* FLOATING GLASS NAVIGATION DOCK */}
      <NavigationDock
        activeTab={activeTab}
        onSelectTab={(tab) => {
          if (tab === 'settings') {
            setIsSettingsModalOpen(true);
          } else {
            setActiveTab(tab);
          }
        }}
        uiLanguage={settings.uiLanguage}
      />

      {/* FULL SETTINGS MODAL */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        isOnline={isOnline}
        onToggleForceOffline={handleToggleForceOffline}
        onClearAllData={handleClearAllData}
        sessionCount={sessions.length}
        mediaCount={mediaItems.length}
      />
    </div>
  );
}
