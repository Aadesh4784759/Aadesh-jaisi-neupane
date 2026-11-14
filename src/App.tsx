import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  AIConnectionState,
  AppSettings,
  ChatMessage,
  ChatSession,
  EngagementMetrics,
  GeotaggedMedia,
  LocationData,
  UserProfile,
  VoiceHistoryEntry,
} from './types';
import {
  DEFAULT_SETTINGS,
  DEFAULT_USER,
  OWNER_ADMIN_EMAIL,
  getStoredMedia,
  getStoredMetrics,
  getStoredSessions,
  getStoredFolders,
  getStoredSettings,
  getStoredUser,
  getStoredVoiceHistory,
  saveStoredMedia,
  saveStoredMetrics,
  saveStoredSessions,
  saveStoredFolders,
  saveStoredSettings,
  saveStoredUser,
  saveStoredVoiceHistory,
  addVoiceHistoryEntry,
  recordMetricEvent,
} from './utils/storage';
import { SUPPORTED_LANGUAGES, VOICE_PERSONAS } from './data/languages';
import { Header } from './components/Header';
import { NavigationDock } from './components/NavigationDock';
import { ChatView } from './components/ChatView';
import { ActiveVoiceView } from './components/ActiveVoiceView';
import { InterpreterView } from './components/InterpreterView';
import { GeotagGalleryView } from './components/GeotagGalleryView';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { VoiceHistoryView } from './components/VoiceHistoryView';
import { ImageStudioView } from './components/ImageStudioView';
import { ProfileView } from './components/ProfileView';
import { AdminDashboardView } from './components/AdminDashboardView';
import { WorldClockView } from './components/WorldClockView';
import { SettingsModal } from './components/SettingsModal';
import { AuthModal } from './components/AuthModal';
import { GamificationModal } from './components/GamificationModal';
import { InstallAppModal } from './components/InstallAppModal';
import { recordGamificationActivity } from './utils/gamification';
import { voiceAssistant } from './utils/speech';
import { applyAvatarDynamicTheme } from './utils/avatarTheme';
import {
  subscribeToAuth,
  syncUserProfileToFirestore,
  loadUserProfileFromFirestore,
  saveConversationAndMessagesToFirestore,
  saveSingleMessageToFirestore,
  deleteConversationFromFirestore,
  recordUsageAnalyticsToFirestore,
  subscribeToPlatformAnnouncement,
  logOut,
} from './utils/firebase';

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(getStoredSettings());
  const [user, setUser] = useState<UserProfile>(getStoredUser());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'register' | 'profile'>('signin');
  const [isGamificationModalOpen, setIsGamificationModalOpen] = useState<boolean>(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState<boolean>(false);
  const [aiStatus, setAiStatus] = useState<AIConnectionState>('connecting');
  const [sessions, setSessions] = useState<ChatSession[]>(() => getStoredSessions(getStoredUser().id));
  const [sessionFolders, setSessionFolders] = useState<string[]>(() =>
    getStoredFolders(getStoredUser().id)
  );
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    const stored = getStoredSessions(getStoredUser().id);
    return stored[0]?.id || 'session-default-welcome';
  });
  const [voiceHistory, setVoiceHistory] = useState<VoiceHistoryEntry[]>(() =>
    getStoredVoiceHistory(getStoredUser().id)
  );
  const [mediaItems, setMediaItems] = useState<GeotaggedMedia[]>(getStoredMedia());
  const [metrics, setMetrics] = useState<EngagementMetrics>(getStoredMetrics());
  const [activeTab, setActiveTab] = useState<string>('chat');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [platformNotice, setPlatformNotice] = useState<{
    announcement?: string;
    maintenanceMode?: boolean;
  } | null>(null);
  const isSendingRef = useRef<boolean>(false);
  const [isBrowserOnline, setIsBrowserOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isKeyboardOpen, setIsKeyboardOpen] = useState<boolean>(false);

  const isOnline = isBrowserOnline && !settings.offlineModeForce;
  const isOwnerAdmin = Boolean(
    user.isLoggedIn &&
      user.email?.toLowerCase() === OWNER_ADMIN_EMAIL &&
      user.role === 'admin'
  );

  // Apply dynamic UI color theme derived from user's selected avatar color
  useEffect(() => {
    applyAvatarDynamicTheme(user.avatarColor, settings.dynamicAvatarTheme !== false);
  }, [user.avatarColor, settings.dynamicAvatarTheme]);

  // Detect Android/iOS virtual keyboard open state via visualViewport
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;

    const updateKeyboardState = () => {
      const isNarrowViewport = window.innerWidth < 1024;
      const activeTag = document.activeElement?.tagName;
      const isInputFocused = activeTag === 'TEXTAREA' || activeTag === 'INPUT';
      const heightRatio = vv.height / Math.max(1, window.innerHeight);
      setIsKeyboardOpen(isNarrowViewport && isInputFocused && heightRatio < 0.8);
    };

    vv.addEventListener('resize', updateKeyboardState);
    window.addEventListener('focusin', updateKeyboardState);
    window.addEventListener('focusout', updateKeyboardState);
    return () => {
      vv.removeEventListener('resize', updateKeyboardState);
      window.removeEventListener('focusin', updateKeyboardState);
      window.removeEventListener('focusout', updateKeyboardState);
    };
  }, []);

  // Sync voiceAssistant configuration whenever Read Aloud speed, pitch, or volume changes
  useEffect(() => {
    voiceAssistant.configure({
      rate: settings.voiceSpeed ?? 1.0,
      pitch: settings.voicePitch ?? 1.0,
      volume: settings.voiceVolume ?? 1.0,
    });
  }, [settings.voiceSpeed, settings.voicePitch, settings.voiceVolume]);

  // Listen for browser online / offline events, platform announcement, and Firebase Auth state
  useEffect(() => {
    const handleOnline = () => setIsBrowserOnline(true);
    const handleOffline = () => setIsBrowserOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    saveStoredSettings(settings);
    if (settings.theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }

    const unsubNotice = subscribeToPlatformAnnouncement((data) => {
      setPlatformNotice(data);
    });

    const unsubscribeAuth = subscribeToAuth(async (fbUser) => {
      if (fbUser) {
        const emailLower = (fbUser.email || '').toLowerCase();
        const isVerifiedOwner = emailLower === OWNER_ADMIN_EMAIL && fbUser.emailVerified;
        const cleanName =
          fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : 'Member');
        const cleanHandle = cleanName.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'member';
        const createdAtMs = fbUser.metadata.creationTime
          ? new Date(fbUser.metadata.creationTime).getTime()
          : Date.now();

        const fsProfile = await loadUserProfileFromFirestore(fbUser.uid).catch(() => null);

        setUser((prev) => {
          const updated: UserProfile = {
            ...prev,
            id: fbUser.uid,
            name: fsProfile?.name || cleanName,
            username: fsProfile?.username || cleanHandle,
            email: fbUser.email || prev.email || '',
            avatarUrl: fbUser.photoURL || fsProfile?.avatarUrl || '',
            provider: fbUser.providerData[0]?.providerId?.includes('google') ? 'google' : 'email',
            isLoggedIn: true,
            role: isVerifiedOwner ? 'admin' : fsProfile?.role || 'user',
            status: fsProfile?.status || 'active',
            createdAt: fsProfile?.createdAt || createdAtMs,
            lastActiveAt: Date.now(),
            preferredLanguage: fsProfile?.preferredLanguage || settings.uiLanguage || 'en',
            linkedProviders: Array.from(
              new Set([
                ...prev.linkedProviders,
                fbUser.providerData[0]?.providerId?.includes('google') ? 'google' : 'email',
              ])
            ),
          };
          saveStoredUser(updated);
          syncUserProfileToFirestore(updated).catch(() => {});
          return updated;
        });

        if (fsProfile?.preferredLanguage && fsProfile.preferredLanguage !== settings.uiLanguage) {
          handleUpdateSettings({ uiLanguage: fsProfile.preferredLanguage });
        }
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubNotice();
      if (unsubscribeAuth) unsubscribeAuth();
    };
  }, []);

  // Sync session, folders, and voice history when user account switches
  useEffect(() => {
    const userSessions = getStoredSessions(user.id);
    setSessions(userSessions);
    setSessionFolders(getStoredFolders(user.id));
    setCurrentSessionId(userSessions[0]?.id || `session-${Date.now()}`);
    setVoiceHistory(getStoredVoiceHistory(user.id));
  }, [user.id]);

  // Check AI Service connectivity health
  const checkAIHealth = async () => {
    setAiStatus('connecting');
    try {
      const headers: Record<string, string> = {};
      if (settings.customGeminiApiKey) {
        headers['x-gemini-api-key'] = settings.customGeminiApiKey;
      }
      const res = await fetch('/api/health', { headers });
      if (res.ok) {
        const data = await res.json();
        setAiStatus(data.isLiveAI ? 'connected' : 'disconnected');
      } else {
        setAiStatus('disconnected');
      }
    } catch {
      setAiStatus('disconnected');
    }
  };

  useEffect(() => {
    checkAIHealth();
  }, [settings.customGeminiApiKey]);

  const handleUpdateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      saveStoredSettings(updated);
      return updated;
    });
  };

  const handleToggleForceOffline = () => {
    handleUpdateSettings({ offlineModeForce: !settings.offlineModeForce });
  };

  const currentSession =
    sessions.find((s) => s.id === currentSessionId) ||
    sessions[0] || {
      id: 'session-default-welcome',
      title: 'Aadesh AI Global Conversation',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      targetLanguage: settings.defaultTargetLanguage,
      messages: [],
    };

  // Send message in Chat or Voice view (supports photos & text/code attachments)
  const handleSendMessage = async (params: {
    text: string;
    imageData?: string;
    imageMimeType?: string;
    attachmentName?: string;
    attachmentContent?: string;
    location?: LocationData;
    isVoice?: boolean;
    targetLanguage: string;
  }): Promise<{ reply: string; translation?: string } | void> => {
    if (isSendingRef.current) return;
    isSendingRef.current = true;

    const userMsgId = `usr-${Date.now()}`;
    const fallbackContent = params.imageData
      ? 'Shared a photograph for visual analysis'
      : params.attachmentName
      ? `Attached file: ${params.attachmentName}`
      : '';

    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      senderId: user.id,
      senderName: user.name,
      senderAvatarUrl: user.avatarUrl || undefined,
      content: params.text || fallbackContent,
      timestamp: Date.now(),
      imageUrl: params.imageData,
      attachmentName: params.attachmentName,
      location: params.location,
      isVoiceInput: params.isVoice,
    };

    const updatedMessages = [...currentSession.messages, userMessage];

    let sessionTitle = currentSession.title;
    if (currentSession.messages.length <= 1 && (params.text || params.attachmentName)) {
      const basis = params.text || params.attachmentName || 'Conversation';
      sessionTitle = basis.slice(0, 36) + (basis.length > 36 ? '...' : '');
    }

    const updatedSession: ChatSession = {
      ...currentSession,
      title: sessionTitle,
      updatedAt: Date.now(),
      messages: updatedMessages,
    };

    const updatedSessions = sessions.map((s) => (s.id === currentSession.id ? updatedSession : s));
    setSessions(updatedSessions);
    saveStoredSessions(updatedSessions, user.id);

    if (params.isVoice && params.text) {
      const newEntry = addVoiceHistoryEntry(
        {
          transcript: params.text,
          language: settings.uiLanguage,
          durationSeconds: Math.max(2, Math.round(params.text.split(' ').length / 2.5)),
        },
        user.id
      );
      setVoiceHistory((prev) => [newEntry, ...prev]);
    }

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
        latencyMs = 120;
        const targetLangObj =
          SUPPORTED_LANGUAGES.find((l) => l.code === params.targetLanguage) || SUPPORTED_LANGUAGES[0];

        if (params.imageData) {
          reply = `[Offline Local Engine] Registered your photo${
            params.location ? ` tagged at ${params.location.name}` : ''
          }.`;
          translation = `[${targetLangObj.name} Offline] Photo registered locally.`;
        } else {
          reply = `[Offline Mode] Recorded: "${params.text || params.attachmentName}". Reconnect for live Gemini reasoning.`;
          translation = `[${targetLangObj.name} Translation] Offline mode active.`;
        }
        sentiment = 'neutral';
        suggestedQuestions = [
          'Explain in more detail',
          'Give example',
          'Summarize',
        ];
      } else {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (settings.customGeminiApiKey) {
          headers['x-gemini-api-key'] = settings.customGeminiApiKey;
        }

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            messages: updatedMessages
              .filter((m) => !m.isError)
              .map((m) => ({ role: m.role, content: m.content })),
            currentMessage: params.text,
            imageData: params.imageData,
            imageMimeType: params.imageMimeType,
            attachmentName: params.attachmentName,
            attachmentContent: params.attachmentContent,
            targetLanguage: params.targetLanguage,
            userLanguage: settings.uiLanguage,
            voicePersona: settings.voicePersona || 'friendly',
            location: params.location,
            customApiKey: settings.customGeminiApiKey,
            mode: 'chat',
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Server returned ${res.status}`);
        }

        const data = await res.json();
        reply = data.reply || 'Response received.';
        translation = data.translation || '';
        detectedLanguage = data.detectedLanguage || 'en';
        sentiment = data.sentiment || 'positive';
        suggestedQuestions = Array.isArray(data.suggestedQuestions) ? data.suggestedQuestions : [];
        geotagInsights = data.geotagInsights;
        latencyMs = data.latencyMs || Date.now() - startTime;

        if (data.isLiveAI) {
          setAiStatus('connected');
        } else if (!settings.customGeminiApiKey) {
          setAiStatus('disconnected');
        }
      }

      const modelMsgId = `mod-${Date.now()}`;
      const modelMessage: ChatMessage = {
        id: modelMsgId,
        role: 'model',
        senderName: 'Aadesh AI',
        content: reply,
        translation,
        translationLanguage: translation ? params.targetLanguage : undefined,
        detectedLanguage,
        sentiment,
        suggestedQuestions,
        geotagInsights,
        timestamp: Date.now(),
        isOffline: !isOnline,
        latencyMs,
      };

      const finalSession: ChatSession = {
        ...updatedSession,
        messages: [...updatedMessages, modelMessage],
      };

      const finalSessions = sessions.map((s) => (s.id === currentSession.id ? finalSession : s));
      setSessions(finalSessions);
      saveStoredSessions(finalSessions, user.id);

      // Dedicated backend call for context-aware suggested reply buttons after every AI response
      if (isOnline) {
        const suggestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (settings.customGeminiApiKey) {
          suggestHeaders['x-gemini-api-key'] = settings.customGeminiApiKey;
        }
        const targetSessionId = currentSession.id;
        void fetch('/api/chat/suggested-replies', {
          method: 'POST',
          headers: suggestHeaders,
          body: JSON.stringify({
            userMessage: params.text || fallbackContent,
            aiReply: reply,
            recentMessages: updatedMessages
              .slice(-4)
              .filter((m) => !m.isError)
              .map((m) => ({ role: m.role, content: m.content })),
            targetLanguage: params.targetLanguage,
            userLanguage: settings.uiLanguage,
            location: params.location,
            hasImage: Boolean(params.imageData),
            customApiKey: settings.customGeminiApiKey,
          }),
        })
          .then((suggRes) => (suggRes.ok ? suggRes.json() : null))
          .then((suggData) => {
            if (!suggData || !Array.isArray(suggData.suggestedReplies) || suggData.suggestedReplies.length === 0) {
              return;
            }
            const nextSuggestions = suggData.suggestedReplies
              .filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
              .slice(0, 4);
            if (nextSuggestions.length === 0) return;

            setSessions((prevSessions) => {
              const nextSessions = prevSessions.map((s) => {
                if (s.id !== targetSessionId) return s;
                return {
                  ...s,
                  messages: s.messages.map((m) =>
                    m.id === modelMsgId ? { ...m, suggestedQuestions: nextSuggestions } : m
                  ),
                };
              });
              saveStoredSessions(nextSessions, user.id);
              return nextSessions;
            });

            if (user.isLoggedIn) {
              saveSingleMessageToFirestore(user.id, targetSessionId, {
                ...modelMessage,
                suggestedQuestions: nextSuggestions,
              }).catch(() => {});
            }
          })
          .catch(() => {});
      }

      // Sync conversation & usage telemetry to Firestore when signed in
      if (user.isLoggedIn) {
        saveConversationAndMessagesToFirestore(user.id, finalSession).catch(() => {});
        recordUsageAnalyticsToFirestore({
          eventType: params.isVoice
            ? 'voice'
            : params.imageData
            ? 'image'
            : params.attachmentName
            ? 'file'
            : 'chat',
          language: params.targetLanguage,
          latencyMs,
        }).catch(() => {});
      }

      const { updatedUser, newBadgeUnlocked } = recordGamificationActivity(
        user,
        params.isVoice ? 'voice' : params.imageData ? 'image' : 'chat'
      );
      setUser(updatedUser);
      saveStoredUser(updatedUser);

      if (newBadgeUnlocked) {
        try {
          confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
        } catch {}
      }

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

      if ((settings.autoSpeakAIResponses || settings.handsFreeMode) && activeTab === 'chat') {
        const targetLangObj =
          SUPPORTED_LANGUAGES.find((l) => l.code === params.targetLanguage) || SUPPORTED_LANGUAGES[0];
        const activePersonaObj =
          VOICE_PERSONAS.find((p) => p.id === (settings.voicePersona || 'friendly')) || VOICE_PERSONAS[3];
        voiceAssistant.speak(translation || reply, targetLangObj.speechCode, {
          rate: settings.voiceSpeed ?? 1.0,
          pitch: settings.voicePitch ?? activePersonaObj.pitch,
          volume: settings.voiceVolume ?? 1.0,
        });
      }

      return { reply, translation };
    } catch (err: any) {
      console.error('Chat error:', err);
      const errorMessageText = `⚠️ ${err?.message || 'Connection error'}. Please verify your internet connection or Gemini API key in Settings.`;
      const modelErrorMsg: ChatMessage = {
        id: `mod-err-${Date.now()}`,
        role: 'model',
        content: errorMessageText,
        timestamp: Date.now(),
        sentiment: 'urgent',
        isError: true,
      };
      const finalSession: ChatSession = {
        ...updatedSession,
        messages: [...updatedMessages, modelErrorMsg],
      };
      const finalSessions = sessions.map((s) => (s.id === currentSession.id ? finalSession : s));
      setSessions(finalSessions);
      saveStoredSessions(finalSessions, user.id);
      throw err;
    } finally {
      isSendingRef.current = false;
      setIsLoading(false);
    }
  };

  const handleUpdateUser = (updatedUser: UserProfile) => {
    setUser(updatedUser);
    saveStoredUser(updatedUser);
    if (updatedUser.isLoggedIn) {
      syncUserProfileToFirestore(updatedUser).catch(() => {});
    }
  };

  const handleSignOut = async () => {
    try {
      await logOut();
    } catch {}
    const guestUser: UserProfile = {
      ...DEFAULT_USER,
      id: `guest-${Date.now()}`,
      name: 'Guest Explorer',
      username: 'guest',
      email: '',
      phone: '',
      avatarUrl: '',
      provider: 'guest',
      role: 'user',
      isLoggedIn: false,
      linkedProviders: [],
      createdAt: Date.now(),
    };
    setUser(guestUser);
    saveStoredUser(guestUser);
    if (activeTab === 'admin') {
      setActiveTab('chat');
    }
  };

  const handleNewSession = (initialCategory?: string) => {
    const cleanCategory =
      initialCategory && initialCategory.trim() && initialCategory !== 'All'
        ? initialCategory.trim().slice(0, 48)
        : 'General';
    const newSession: ChatSession = {
      id: `session-${Date.now()}`,
      title: `Conversation ${sessions.length + 1}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      targetLanguage: settings.defaultTargetLanguage,
      category: cleanCategory,
      messages: [],
    };
    const updated = [newSession, ...sessions];
    setSessions(updated);
    setCurrentSessionId(newSession.id);
    saveStoredSessions(updated, user.id);
    if (user.isLoggedIn) {
      saveConversationAndMessagesToFirestore(user.id, newSession).catch(() => {});
    }
  };

  const handleRenameSession = (id: string, newTitle: string) => {
    const updated = sessions.map((s) =>
      s.id === id ? { ...s, title: newTitle, updatedAt: Date.now() } : s
    );
    setSessions(updated);
    saveStoredSessions(updated, user.id);
    const target = updated.find((s) => s.id === id);
    if (target && user.isLoggedIn) {
      saveConversationAndMessagesToFirestore(user.id, target).catch(() => {});
    }
  };

  const handleCreateFolder = (folderName: string) => {
    const clean = folderName.trim().slice(0, 48);
    if (!clean) return;
    setSessionFolders((prev) => {
      if (prev.some((f) => f.toLowerCase() === clean.toLowerCase())) return prev;
      const next = [...prev, clean];
      saveStoredFolders(next, user.id);
      return next;
    });
  };

  const handleUpdateSessionCategory = (id: string, category: string) => {
    const clean = category.trim().slice(0, 48) || 'General';
    handleCreateFolder(clean);
    const updated = sessions.map((s) =>
      s.id === id ? { ...s, category: clean, updatedAt: Date.now() } : s
    );
    setSessions(updated);
    saveStoredSessions(updated, user.id);
    const target = updated.find((s) => s.id === id);
    if (target && user.isLoggedIn) {
      saveConversationAndMessagesToFirestore(user.id, target).catch(() => {});
    }
  };

  const handleDeleteSession = (id: string) => {
    if (user.isLoggedIn) {
      deleteConversationFromFirestore(user.id, id).catch(() => {});
    }
    const remaining = sessions.filter((s) => s.id !== id);
    if (remaining.length === 0) {
      handleNewSession();
      return;
    }
    setSessions(remaining);
    saveStoredSessions(remaining, user.id);
    if (currentSessionId === id) {
      setCurrentSessionId(remaining[0].id);
    }
  };

  const handleClearCurrentSession = () => {
    const updated = sessions.map((s) => (s.id === currentSession.id ? { ...s, messages: [] } : s));
    setSessions(updated);
    saveStoredSessions(updated, user.id);
  };

  const handleUpdateSessionTargetLang = (lang: string) => {
    const updated = sessions.map((s) =>
      s.id === currentSession.id ? { ...s, targetLanguage: lang, updatedAt: Date.now() } : s
    );
    setSessions(updated);
    saveStoredSessions(updated, user.id);
    const target = updated.find((s) => s.id === currentSession.id);
    if (target && user.isLoggedIn) {
      saveConversationAndMessagesToFirestore(user.id, target).catch(() => {});
    }
  };

  const handleFeedbackMessage = (messageId: string, feedback: 'up' | 'down') => {
    const updatedSessions = sessions.map((s) => {
      if (s.id !== currentSession.id) return s;
      return {
        ...s,
        messages: s.messages.map((m) =>
          m.id === messageId
            ? { ...m, feedback: m.feedback === feedback ? undefined : feedback }
            : m
        ),
      };
    });
    setSessions(updatedSessions);
    saveStoredSessions(updatedSessions, user.id);

    const updatedMsg = updatedSessions
      .find((s) => s.id === currentSession.id)
      ?.messages.find((m) => m.id === messageId);
    if (updatedMsg && user.isLoggedIn) {
      saveSingleMessageToFirestore(user.id, currentSession.id, updatedMsg).catch(() => {});
    }
  };

  const handleTogglePinMessage = (messageId: string) => {
    const updatedSessions = sessions.map((s) => {
      if (s.id !== currentSession.id) return s;
      return {
        ...s,
        messages: s.messages.map((m) =>
          m.id === messageId
            ? {
                ...m,
                isPinned: !m.isPinned,
                pinnedAt: !m.isPinned ? Date.now() : undefined,
              }
            : m
        ),
      };
    });
    setSessions(updatedSessions);
    saveStoredSessions(updatedSessions, user.id);

    const updatedMsg = updatedSessions
      .find((s) => s.id === currentSession.id)
      ?.messages.find((m) => m.id === messageId);
    if (updatedMsg && user.isLoggedIn) {
      saveSingleMessageToFirestore(user.id, currentSession.id, updatedMsg).catch(() => {});
    }
  };

  const handleReactToMessage = (messageId: string, emoji: string) => {
    const updatedSessions = sessions.map((s) => {
      if (s.id !== currentSession.id) return s;
      return {
        ...s,
        messages: s.messages.map((m) => {
          if (m.id !== messageId) return m;
          const prevUserReactions = Array.isArray(m.userReactions) ? m.userReactions : [];
          const hasReacted = prevUserReactions.includes(emoji);
          const nextUserReactions = hasReacted
            ? prevUserReactions.filter((e) => e !== emoji)
            : [...prevUserReactions, emoji].slice(0, 6);

          const nextReactions: Record<string, number> = { ...(m.reactions || {}) };
          const currentCount = typeof nextReactions[emoji] === 'number' ? nextReactions[emoji] : 0;
          if (hasReacted) {
            const decremented = currentCount - 1;
            if (decremented <= 0) {
              delete nextReactions[emoji];
            } else {
              nextReactions[emoji] = decremented;
            }
          } else {
            nextReactions[emoji] = Math.min(999, currentCount + 1);
          }

          return {
            ...m,
            reactions: nextReactions,
            userReactions: nextUserReactions,
          };
        }),
      };
    });

    setSessions(updatedSessions);
    saveStoredSessions(updatedSessions, user.id);

    const updatedMsg = updatedSessions
      .find((s) => s.id === currentSession.id)
      ?.messages.find((m) => m.id === messageId);
    if (updatedMsg && user.isLoggedIn) {
      saveSingleMessageToFirestore(user.id, currentSession.id, updatedMsg).catch(() => {});
    }
  };

  const handleTranslateMessage = async (messageId: string, targetLangCode: string): Promise<string> => {
    const targetMsg = currentSession.messages.find((m) => m.id === messageId);
    if (!targetMsg) throw new Error('Message not found');

    const targetLangObj =
      SUPPORTED_LANGUAGES.find((l) => l.code === targetLangCode) || SUPPORTED_LANGUAGES[0];

    let translatedText = '';
    let latencyMs = 150;

    if (!isOnline) {
      translatedText = `[Offline Translated (${targetLangObj.name})] ${targetMsg.content}`;
    } else {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (settings.customGeminiApiKey) {
        headers['x-gemini-api-key'] = settings.customGeminiApiKey;
      }

      const res = await fetch('/api/translate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: targetMsg.content,
          sourceLang: targetMsg.detectedLanguage || 'auto',
          targetLang: targetLangCode,
          customApiKey: settings.customGeminiApiKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Translation failed (${res.status})`);
      }
      translatedText = data.translatedText || targetMsg.content;
      latencyMs = data.latencyMs || 250;
    }

    const updatedSessions = sessions.map((s) => {
      if (s.id !== currentSession.id) return s;
      return {
        ...s,
        messages: s.messages.map((m) =>
          m.id === messageId
            ? { ...m, translation: translatedText, translationLanguage: targetLangCode }
            : m
        ),
      };
    });
    setSessions(updatedSessions);
    saveStoredSessions(updatedSessions, user.id);

    const updatedMsg = updatedSessions
      .find((s) => s.id === currentSession.id)
      ?.messages.find((m) => m.id === messageId);
    if (updatedMsg && user.isLoggedIn) {
      saveSingleMessageToFirestore(user.id, currentSession.id, updatedMsg).catch(() => {});
      recordUsageAnalyticsToFirestore({
        eventType: 'translation',
        language: targetLangCode,
        latencyMs,
      }).catch(() => {});
    }

    recordMetricEvent({
      isTranslation: true,
      language: targetLangCode,
      latencyMs,
      sentiment: 'positive',
    });
    setMetrics(getStoredMetrics());

    return translatedText;
  };

  const handleDeleteVoiceEntry = (id: string) => {
    const updated = voiceHistory.filter((v) => v.id !== id);
    setVoiceHistory(updated);
    saveStoredVoiceHistory(updated, user.id);
  };

  const handleClearAllVoiceHistory = () => {
    setVoiceHistory([]);
    saveStoredVoiceHistory([], user.id);
  };

  const handleSendVoiceToChat = (transcript: string) => {
    setActiveTab('chat');
    handleSendMessage({
      text: transcript,
      targetLanguage: currentSession.targetLanguage || settings.defaultTargetLanguage,
      isVoice: true,
    });
  };

  const handleAddNewVoiceFromVault = (text: string, language: string) => {
    const entry = addVoiceHistoryEntry(
      {
        transcript: text,
        language,
        durationSeconds: Math.max(2, Math.round(text.split(' ').length / 2.5)),
      },
      user.id
    );
    setVoiceHistory((prev) => [entry, ...prev]);
  };

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

    try {
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.7 } });
    } catch {}
  };

  const handleDeleteMedia = (id: string) => {
    const updated = mediaItems.filter((m) => m.id !== id);
    setMediaItems(updated);
    saveStoredMedia(updated);
  };

  const handleRecordTranslationMetric = (_langA: string, langB: string, latencyMs: number) => {
    recordMetricEvent({
      isTranslation: true,
      language: langB,
      latencyMs,
      sentiment: 'positive',
    });
    setMetrics(getStoredMetrics());
  };

  const handleClearAllData = () => {
    localStorage.clear();
    setSettings(DEFAULT_SETTINGS);
    setSessions(getStoredSessions());
    setVoiceHistory([]);
    setMediaItems(getStoredMedia());
    setMetrics(getStoredMetrics());
    setIsSettingsModalOpen(false);
  };

  const totalMessageCount = sessions.reduce((acc, s) => acc + s.messages.length, 0);

  return (
    <div
      className={`${
        activeTab === 'chat' ? 'app-shell-chat' : 'app-shell-scroll'
      } relative flex flex-col justify-between selection:bg-purple-500/30 selection:text-purple-200 max-w-full overflow-x-hidden`}
    >
      {/* Ambient Glowing Background Orbs & 3D Spheres */}
      <div
        className="orb w-[380px] h-[380px] top-[-40px] left-[-90px] animate-pulse-glow transition-colors duration-500"
        style={{ backgroundColor: 'rgba(var(--theme-accent-rgb), 0.24)' }}
      />
      <div
        className="orb w-[500px] h-[500px] top-[25%] right-[-140px] animate-float-slow transition-colors duration-500"
        style={{ backgroundColor: 'rgba(var(--theme-accent-sec-rgb), 0.20)' }}
      />
      <div
        className="orb w-[340px] h-[340px] bottom-[15%] left-[25%] animate-float-delayed transition-colors duration-500"
        style={{ backgroundColor: 'rgba(var(--theme-accent-light-rgb), 0.18)' }}
      />
      <div className="sphere-3d w-28 h-28 absolute top-20 right-12 opacity-35 animate-float-slow hidden lg:block" />
      <div className="sphere-3d w-16 h-16 absolute top-1/2 left-8 opacity-25 animate-float-delayed hidden md:block" />
      <div className="sphere-3d w-20 h-20 absolute bottom-28 right-1/4 opacity-30 animate-pulse-glow hidden sm:block" />

      {/* TOP HEADER */}
      <Header
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        aiStatus={aiStatus}
        onRefreshAIStatus={checkAIHealth}
        isOnline={isOnline}
        onToggleForceOffline={handleToggleForceOffline}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        totalTranslations={metrics.totalTranslations}
        user={user}
        isOwnerAdmin={isOwnerAdmin}
        onOpenAuth={(mode = 'signin') => {
          setAuthModalMode(mode);
          setIsAuthModalOpen(true);
        }}
        onOpenGamification={() => setIsGamificationModalOpen(true)}
        onOpenInstall={() => setIsInstallModalOpen(true)}
      />

      {/* NAVIGATION BAR (Desktop Top Bar + Mobile Floating Bottom Dock) */}
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
        isOwnerAdmin={isOwnerAdmin}
        isKeyboardOpen={isKeyboardOpen}
        onOpenInstall={() => setIsInstallModalOpen(true)}
      />

      {/* Owner Announcement Banner if active */}
      {platformNotice?.announcement && (
        <div className="bg-purple-950/85 border-b border-purple-500/40 text-purple-100 text-xs py-1.5 px-4 text-center z-20 font-medium shrink-0">
          📢 {platformNotice.announcement}
        </div>
      )}

      {/* Offline Alert Strip if Offline */}
      {!isOnline && (
        <div className="bg-amber-950/80 border-b border-amber-500/40 text-amber-200 text-xs py-1.5 px-4 text-center z-20 font-medium flex items-center justify-center gap-2 shrink-0">
          <span>⚠️ Offline Mode Active: Conversations saved locally. Syncs when reconnected.</span>
          <button
            onClick={handleToggleForceOffline}
            className="underline hover:text-white font-bold ml-1 cursor-pointer"
          >
            Reconnect
          </button>
        </div>
      )}

      {/* MAIN VIEWPORT */}
      <main
        className={`relative z-10 w-full flex flex-col ${
          activeTab === 'chat' ? 'flex-1 min-h-0 overflow-hidden' : 'flex-grow'
        }`}
      >
        {activeTab === 'chat' && (
          <ChatView
            currentSession={currentSession}
            allSessions={sessions}
            sessionFolders={sessionFolders}
            onSelectSession={setCurrentSessionId}
            onNewSession={handleNewSession}
            onRenameSession={handleRenameSession}
            onUpdateSessionCategory={handleUpdateSessionCategory}
            onCreateFolder={handleCreateFolder}
            onDeleteSession={handleDeleteSession}
            onClearCurrentSession={handleClearCurrentSession}
            onSendMessage={async (params) => {
              await handleSendMessage(params);
            }}
            onUpdateSessionTargetLang={handleUpdateSessionTargetLang}
            onTranslateMessage={handleTranslateMessage}
            onFeedbackMessage={handleFeedbackMessage}
            onTogglePinMessage={handleTogglePinMessage}
            onReactMessage={handleReactToMessage}
            user={user}
            settings={settings}
            isOnline={isOnline}
            isLoading={isLoading}
            searchFilter={searchQuery}
            onSearchChange={setSearchQuery}
            isKeyboardOpen={isKeyboardOpen}
          />
        )}

        {activeTab === 'images' && (
          <ImageStudioView
            settings={settings}
            user={user}
            isOnline={isOnline}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
            onImageGenerated={(latencyMs) => {
              const { updatedUser, newBadgeUnlocked } = recordGamificationActivity(user, 'image');
              setUser(updatedUser);
              saveStoredUser(updatedUser);
              if (newBadgeUnlocked) {
                try {
                  confetti({ particleCount: 70, spread: 65, origin: { y: 0.6 } });
                } catch {}
              }
              recordMetricEvent({
                isImage: true,
                latencyMs,
                sentiment: 'positive',
              });
              setMetrics(getStoredMetrics());
            }}
          />
        )}

        {activeTab === 'voice' && (
          <ActiveVoiceView
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            isOnline={isOnline}
            onReturnToChat={() => setActiveTab('chat')}
            onSendVoiceMessage={async ({ text, isVoice, targetLanguage }) =>
              handleSendMessage({ text, isVoice, targetLanguage })
            }
          />
        )}

        {activeTab === 'voiceHistory' && (
          <VoiceHistoryView
            entries={voiceHistory}
            onDeleteEntry={handleDeleteVoiceEntry}
            onClearAll={handleClearAllVoiceHistory}
            onSendToChat={handleSendVoiceToChat}
            settings={settings}
            user={user}
            onAddNewVoiceInput={handleAddNewVoiceFromVault}
          />
        )}

        {activeTab === 'interpret' && (
          <InterpreterView
            settings={settings}
            isOnline={isOnline}
            onRecordTranslationMetric={handleRecordTranslationMetric}
          />
        )}

        {activeTab === 'gallery' && (
          <GeotagGalleryView
            mediaItems={mediaItems}
            onAddMedia={handleAddMedia}
            onDeleteMedia={handleDeleteMedia}
            isOnline={isOnline}
            customGeminiApiKey={settings.customGeminiApiKey}
          />
        )}

        {activeTab === 'worldTime' && (
          <WorldClockView
            onAskAboutCountry={(country, formattedTime) => {
              setActiveTab('chat');
              handleSendMessage({
                text: `Tell me about ${country.country} (${country.city}), where the current live local time is ${formattedTime}.`,
                targetLanguage: currentSession.targetLanguage || settings.defaultTargetLanguage,
              });
            }}
          />
        )}

        {activeTab === 'analytics' && <AnalyticsDashboard metrics={metrics} />}

        {activeTab === 'profile' && (
          <ProfileView
            user={user}
            settings={settings}
            metrics={metrics}
            sessionCount={sessions.length}
            totalMessages={totalMessageCount}
            onUpdateSettings={handleUpdateSettings}
            onUpdateUser={handleUpdateUser}
            onOpenAuth={(mode = 'signin') => {
              setAuthModalMode(mode);
              setIsAuthModalOpen(true);
            }}
            onSignOut={handleSignOut}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
            onOpenAdmin={() => setActiveTab('admin')}
            isOwnerAdmin={isOwnerAdmin}
          />
        )}

        {activeTab === 'admin' && (
          <AdminDashboardView
            currentUser={user}
            onOpenAuth={() => {
              setAuthModalMode('signin');
              setIsAuthModalOpen(true);
            }}
          />
        )}
      </main>

      {/* Single Clean Creator Attribution Footer (Rendered ONLY outside active chat view) */}
      {activeTab !== 'chat' && (
        <footer className="relative z-10 border-t border-white/10 bg-[#090a0f]/80 py-4 px-4 pb-24 lg:pb-5 text-center text-xs text-gray-400">
          <span>Aadesh AI Global Multilingual Hub</span>
          <span className="mx-2 text-purple-400">•</span>
          <span>
            Built by <strong className="text-purple-300">Aadesh Jaisi</strong>
          </span>
        </footer>
      )}

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
        mediaItems={mediaItems}
        sessions={sessions}
        currentSession={currentSession}
        userName={user.name}
      />

      {/* MULTI-ACCOUNT AUTH MODAL */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={user}
        onUpdateUser={handleUpdateUser}
        onSignOut={handleSignOut}
        initialMode={authModalMode}
      />

      {/* GAMIFICATION & STREAKS MODAL */}
      <GamificationModal
        isOpen={isGamificationModalOpen}
        onClose={() => setIsGamificationModalOpen(false)}
        user={user}
      />

      {/* ANDROID, IOS & DESKTOP STORE INSTALL MODAL */}
      <InstallAppModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
      />
    </div>
  );
}
