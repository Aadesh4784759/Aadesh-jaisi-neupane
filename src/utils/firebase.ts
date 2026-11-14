import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  User as FirebaseUser,
  Auth,
} from 'firebase/auth';
import {
  getFirestore,
  Firestore,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  AIMemoryItem,
  AdminConversationSummary,
  AdminUserRecord,
  ChatMessage,
  ChatSession,
  PersonalTask,
  StudyProgressItem,
  UserProfile,
} from '../types';
import { OWNER_ADMIN_EMAIL } from './storage';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

try {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  auth = getAuth(app);
  // CRITICAL: Bind explicitly to the provisioned Enterprise Firestore databaseId
  db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
} catch (err) {
  console.warn('Firebase initialization notice:', err);
}

export { app, auth, db };

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid ?? null,
      email: auth?.currentUser?.email ?? null,
      emailVerified: auth?.currentUser?.emailVerified ?? null,
      isAnonymous: auth?.currentUser?.isAnonymous ?? null,
      tenantId: auth?.currentUser?.tenantId ?? null,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Required boot connectivity verification against Enterprise Firestore
async function testFirestoreConnection() {
  if (!db) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration (Firestore client offline).');
    }
  }
}
testFirestoreConnection();

// Friendly human-readable error messages for Firebase Authentication
export function formatAuthError(errorCodeOrMessage: string): string {
  const code = errorCodeOrMessage.toLowerCase();
  if (code.includes('auth/email-already-in-use')) {
    return 'This email address is already in use by another account. Please sign in or reset your password.';
  }
  if (
    code.includes('auth/invalid-credential') ||
    code.includes('auth/wrong-password') ||
    code.includes('auth/user-not-found')
  ) {
    return 'Invalid email or password. Please verify your credentials and try again.';
  }
  if (code.includes('auth/weak-password')) {
    return 'Password is too weak. Please use at least 6 characters with a combination of letters and numbers.';
  }
  if (code.includes('auth/invalid-email')) {
    return 'Please enter a valid email address.';
  }
  if (code.includes('auth/popup-closed-by-user') || code.includes('auth/cancelled-popup-request')) {
    return 'Sign-in popup was closed before completion. Please try again.';
  }
  if (code.includes('auth/popup-blocked')) {
    return 'Sign-in popup was blocked by your browser. Please allow popups for this site and retry.';
  }
  if (code.includes('auth/network-request-failed')) {
    return 'Network connection error. Please check your internet connection.';
  }
  if (code.includes('auth/too-many-requests')) {
    return 'Too many unsuccessful attempts. Access temporarily disabled. Please reset your password or wait.';
  }
  if (code.includes('auth/operation-not-allowed')) {
    return 'This sign-in provider is not enabled yet in Firebase Console Authentication settings.';
  }
  return errorCodeOrMessage || 'Authentication failed. Please try again.';
}

export async function signInWithGoogle() {
  if (!auth) throw new Error('Firebase Auth is not initialized');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return await signInWithPopup(auth, provider);
}

export async function registerWithEmail(email: string, pass: string, displayName: string) {
  if (!auth) throw new Error('Firebase Auth is not initialized');
  const credential = await createUserWithEmailAndPassword(auth, email, pass);
  if (credential.user && displayName.trim()) {
    await updateProfile(credential.user, { displayName: displayName.trim() });
  }
  return credential.user;
}

export async function loginWithEmail(email: string, pass: string) {
  if (!auth) throw new Error('Firebase Auth is not initialized');
  const credential = await signInWithEmailAndPassword(auth, email, pass);
  return credential.user;
}

export async function resetPassword(email: string) {
  if (!auth) throw new Error('Firebase Auth is not initialized');
  return await sendPasswordResetEmail(auth, email);
}

export async function updateUserProfile(data: { displayName?: string; photoURL?: string }) {
  if (!auth || !auth.currentUser) throw new Error('No user currently signed in');
  await updateProfile(auth.currentUser, data);
  return auth.currentUser;
}

export async function logOut() {
  if (!auth) return;
  return await signOut(auth);
}

export async function getCurrentIdToken(): Promise<string | null> {
  if (!auth?.currentUser) return null;
  try {
    return await auth.currentUser.getIdToken();
  } catch {
    return null;
  }
}

export function subscribeToAuth(callback: (user: FirebaseUser | null) => void) {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

// ---------------- FIRESTORE USER & CHAT SYNC ----------------

function safeDocId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-');
  return cleaned.slice(0, 128) || `id-${Date.now()}`;
}

export async function syncUserProfileToFirestore(profile: UserProfile): Promise<void> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== profile.id) return;
  const uid = safeDocId(profile.id);
  const path = `users/${uid}`;
  const docRef = doc(db, 'users', uid);

  try {
    const existingSnap = await getDoc(docRef);
    const nowIso = new Date().toISOString();
    const creationTime = auth.currentUser.metadata.creationTime
      ? new Date(auth.currentUser.metadata.creationTime).toISOString()
      : profile.createdAt
      ? new Date(profile.createdAt).toISOString()
      : nowIso;

    const isVerifiedOwner =
      (auth.currentUser.email || '').toLowerCase() === OWNER_ADMIN_EMAIL &&
      auth.currentUser.emailVerified;

    if (!existingSnap.exists()) {
      await setDoc(docRef, {
        userId: uid,
        displayName: (profile.name || 'User').slice(0, 100),
        username: (profile.username || 'user').slice(0, 64),
        email: (profile.email || '').slice(0, 160),
        photoURL: (profile.avatarUrl || '').slice(0, 1000),
        preferredLanguage: (profile.preferredLanguage || 'en').slice(0, 20),
        status: 'active',
        role: isVerifiedOwner ? 'admin' : 'user',
        provider: profile.provider.slice(0, 32),
        messageCount: 0,
        conversationCount: 1,
        createdAt: creationTime,
        updatedAt: nowIso,
        lastActiveAt: nowIso,
      });
    } else {
      await updateDoc(docRef, {
        displayName: (profile.name || 'User').slice(0, 100),
        username: (profile.username || 'user').slice(0, 64),
        email: (profile.email || '').slice(0, 160),
        photoURL: (profile.avatarUrl || '').slice(0, 1000),
        preferredLanguage: (profile.preferredLanguage || 'en').slice(0, 20),
        provider: profile.provider.slice(0, 32),
        ...(isVerifiedOwner ? { role: 'admin', status: 'active' } : {}),
        updatedAt: nowIso,
        lastActiveAt: nowIso,
      });
    }
  } catch (err) {
    console.warn('Firestore user profile sync warning:', err);
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }
}

export async function loadUserProfileFromFirestore(uid: string): Promise<Partial<UserProfile> | null> {
  if (!db || !auth?.currentUser) return null;
  const safeUid = safeDocId(uid);
  const path = `users/${safeUid}`;
  try {
    const snap = await getDoc(doc(db, 'users', safeUid));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      name: data.displayName,
      username: data.username,
      email: data.email,
      avatarUrl: data.photoURL,
      preferredLanguage: data.preferredLanguage,
      status: data.status || 'active',
      role: data.role || 'user',
      createdAt: data.createdAt ? new Date(data.createdAt).getTime() : undefined,
      lastActiveAt: data.lastActiveAt ? new Date(data.lastActiveAt).getTime() : undefined,
    };
  } catch (err) {
    console.warn('Load user profile warning:', err);
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.GET, path);
    }
    return null;
  }
}

export async function saveConversationAndMessagesToFirestore(
  userId: string,
  session: ChatSession
): Promise<void> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return;
  const uid = safeDocId(userId);
  const convId = safeDocId(session.id);
  const convPath = `users/${uid}/conversations/${convId}`;

  try {
    const convRef = doc(db, 'users', uid, 'conversations', convId);
    const existingConv = await getDoc(convRef);
    const createdIso = new Date(session.createdAt || Date.now()).toISOString();
    const updatedIso = new Date(session.updatedAt || Date.now()).toISOString();

    if (!existingConv.exists()) {
      await setDoc(convRef, {
        id: convId,
        userId: uid,
        title: (session.title || 'Conversation').slice(0, 200),
        language: (session.targetLanguage || 'ne').slice(0, 20),
        category: (session.category || 'General').slice(0, 48),
        messageCount: session.messages.length,
        createdAt: createdIso,
        updatedAt: updatedIso,
      });
    } else {
      await updateDoc(convRef, {
        title: (session.title || 'Conversation').slice(0, 200),
        language: (session.targetLanguage || 'ne').slice(0, 20),
        category: (session.category || 'General').slice(0, 48),
        messageCount: session.messages.length,
        updatedAt: updatedIso,
      });
    }

    // Persist the most recent 4 messages cleanly to avoid oversized batch bursts
    const recentMsgs = session.messages.slice(-4);
    for (const msg of recentMsgs) {
      await saveSingleMessageToFirestore(uid, convId, msg);
    }
  } catch (err) {
    console.warn('Firestore conversation sync warning:', err);
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.WRITE, convPath);
    }
  }
}

export async function saveSingleMessageToFirestore(
  userId: string,
  conversationId: string,
  msg: ChatMessage
): Promise<void> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return;
  const uid = safeDocId(userId);
  const convId = safeDocId(conversationId);
  const msgId = safeDocId(msg.id);
  const msgPath = `users/${uid}/conversations/${convId}/messages/${msgId}`;
  const msgRef = doc(db, 'users', uid, 'conversations', convId, 'messages', msgId);

  try {
    const snap = await getDoc(msgRef);
    if (!snap.exists()) {
      const payload: Record<string, any> = {
        id: msgId,
        userId: uid,
        conversationId: convId,
        role: msg.role === 'user' ? 'user' : msg.role === 'participant' ? 'participant' : 'model',
        content: (msg.content || '').slice(0, 49000),
        timestamp: new Date(msg.timestamp || Date.now()).toISOString(),
      };
      if (msg.senderName) payload.senderName = msg.senderName.slice(0, 100);
      if (msg.senderAvatarUrl && msg.senderAvatarUrl.length <= 1000) {
        payload.senderAvatarUrl = msg.senderAvatarUrl;
      }
      if (msg.translation) payload.translation = msg.translation.slice(0, 49000);
      if (msg.translationLanguage) payload.translationLanguage = msg.translationLanguage.slice(0, 20);
      if (msg.feedback) payload.feedback = msg.feedback;
      if (msg.reactions && Object.keys(msg.reactions).length > 0) payload.reactions = msg.reactions;
      if (Array.isArray(msg.userReactions) && msg.userReactions.length > 0) {
        payload.userReactions = msg.userReactions.slice(0, 6);
      }
      if (typeof msg.isPinned === 'boolean') payload.isPinned = msg.isPinned;
      if (msg.pinnedAt) payload.pinnedAt = new Date(msg.pinnedAt).toISOString();
      if (msg.attachmentName) payload.attachmentName = msg.attachmentName.slice(0, 256);
      if (msg.imageUrl && msg.imageUrl.length <= 950) payload.imageUrl = msg.imageUrl;
      if (typeof msg.isVoiceInput === 'boolean') payload.isVoice = msg.isVoiceInput;
      if (msg.editedAt) payload.editedAt = new Date(msg.editedAt).toISOString();
      await setDoc(msgRef, payload);
    } else {
      const patch: Record<string, any> = {};
      if (msg.content !== undefined) patch.content = msg.content.slice(0, 49000);
      if (msg.editedAt !== undefined) patch.editedAt = new Date(msg.editedAt).toISOString();
      if (msg.translation !== undefined) patch.translation = msg.translation.slice(0, 49000);
      if (msg.translationLanguage !== undefined) patch.translationLanguage = msg.translationLanguage.slice(0, 20);
      if (msg.feedback !== undefined) patch.feedback = msg.feedback;
      if (msg.reactions !== undefined) patch.reactions = msg.reactions;
      if (msg.userReactions !== undefined) patch.userReactions = msg.userReactions.slice(0, 6);
      if (typeof msg.isPinned === 'boolean') patch.isPinned = msg.isPinned;
      if (msg.isPinned !== undefined) {
        patch.pinnedAt = msg.isPinned && msg.pinnedAt ? new Date(msg.pinnedAt).toISOString() : '';
      }
      if (Object.keys(patch).length > 0) {
        await updateDoc(msgRef, patch);
      }
    }
  } catch (err) {
    console.warn('Firestore message sync warning:', err);
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.WRITE, msgPath);
    }
  }
}

export async function deleteConversationFromFirestore(
  userId: string,
  conversationId: string
): Promise<void> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return;
  const uid = safeDocId(userId);
  const convId = safeDocId(conversationId);
  const path = `users/${uid}/conversations/${convId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'conversations', convId));
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }
}

export async function recordUsageAnalyticsToFirestore(params: {
  eventType: 'chat' | 'voice' | 'image' | 'translation' | 'file';
  language?: string;
  latencyMs?: number;
}): Promise<void> {
  if (!db || !auth?.currentUser) return;
  const uid = safeDocId(auth.currentUser.uid);
  const eventId = safeDocId(`evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const path = `usage_analytics/${eventId}`;
  const now = new Date();
  try {
    await setDoc(doc(db, 'usage_analytics', eventId), {
      id: eventId,
      userId: uid,
      eventType: params.eventType,
      language: (params.language || 'en').slice(0, 20),
      latencyMs: typeof params.latencyMs === 'number' ? params.latencyMs : 0,
      dateKey: now.toISOString().slice(0, 10),
      timestamp: now.toISOString(),
    });
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  }
}

// ---------------- OWNER ADMIN FIRESTORE QUERIES ----------------

export async function fetchAdminUsersFromFirestore(): Promise<AdminUserRecord[]> {
  if (!db || !auth?.currentUser) return [];
  const path = 'users';
  try {
    const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(200)));
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        userId: data.userId || d.id,
        displayName: data.displayName || 'User',
        username: data.username,
        email: data.email,
        photoURL: data.photoURL,
        preferredLanguage: data.preferredLanguage || 'en',
        provider: data.provider || 'google',
        status: data.status === 'suspended' ? 'suspended' : 'active',
        role: data.role === 'admin' ? 'admin' : 'user',
        messageCount: data.messageCount || 0,
        conversationCount: data.conversationCount || 0,
        createdAt: data.createdAt || new Date().toISOString(),
        lastActiveAt: data.lastActiveAt,
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchAdminConversationsForUser(
  targetUserId: string,
  userDisplayName?: string,
  userEmail?: string
): Promise<AdminConversationSummary[]> {
  if (!db || !auth?.currentUser) return [];
  const uid = safeDocId(targetUserId);
  const path = `users/${uid}/conversations`;
  try {
    const snap = await getDocs(
      query(collection(db, 'users', uid, 'conversations'), orderBy('updatedAt', 'desc'), limit(25))
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id || d.id,
        userId: uid,
        userDisplayName,
        userEmail,
        title: data.title || 'Untitled Conversation',
        language: data.language || 'en',
        messageCount: data.messageCount || 0,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchAdminConversationMessages(
  targetUserId: string,
  conversationId: string
): Promise<ChatMessage[]> {
  if (!db || !auth?.currentUser) return [];
  const uid = safeDocId(targetUserId);
  const convId = safeDocId(conversationId);
  const path = `users/${uid}/conversations/${convId}/messages`;
  try {
    const snap = await getDocs(
      query(collection(db, 'users', uid, 'conversations', convId, 'messages'), orderBy('timestamp', 'asc'), limit(100))
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id || d.id,
        role: data.role === 'user' ? 'user' : data.role === 'participant' ? 'participant' : 'model',
        senderName: data.senderName,
        senderAvatarUrl: data.senderAvatarUrl,
        content: data.content || '',
        translation: data.translation,
        translationLanguage: data.translationLanguage,
        feedback: data.feedback,
        reactions: data.reactions,
        userReactions: Array.isArray(data.userReactions) ? data.userReactions : undefined,
        isPinned: Boolean(data.isPinned),
        pinnedAt: data.pinnedAt ? new Date(data.pinnedAt).getTime() : undefined,
        attachmentName: data.attachmentName,
        timestamp: data.timestamp ? new Date(data.timestamp).getTime() : Date.now(),
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function updateAdminUserStatusInFirestore(
  targetUserId: string,
  nextStatus: 'active' | 'suspended'
): Promise<void> {
  if (!db || !auth?.currentUser) return;
  const uid = safeDocId(targetUserId);
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function fetchAdminAnalyticsEvents(): Promise<
  Array<{ id: string; userId: string; eventType: string; language?: string; dateKey: string; timestamp: string }>
> {
  if (!db || !auth?.currentUser) return [];
  const path = 'usage_analytics';
  try {
    const snap = await getDocs(query(collection(db, 'usage_analytics'), orderBy('timestamp', 'desc'), limit(250)));
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id || d.id,
        userId: data.userId,
        eventType: data.eventType,
        language: data.language,
        dateKey: data.dateKey,
        timestamp: data.timestamp,
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export function subscribeToPlatformAnnouncement(
  onChange: (data: { announcement?: string; maintenanceMode?: boolean } | null) => void
): Unsubscribe {
  if (!db) {
    onChange(null);
    return () => {};
  }
  const ref = doc(db, 'admin_settings', 'global');
  return onSnapshot(
    ref,
    (snap) => {
      onChange(snap.exists() ? (snap.data() as any) : null);
    },
    () => {
      onChange(null);
    }
  );
}

export async function updateAdminSettingsInFirestore(settings: {
  platformName: string;
  maintenanceMode: boolean;
  announcement: string;
}): Promise<void> {
  if (!db || !auth?.currentUser) return;
  const path = 'admin_settings/global';
  try {
    await setDoc(doc(db, 'admin_settings', 'global'), {
      platformName: settings.platformName.slice(0, 120),
      maintenanceMode: Boolean(settings.maintenanceMode),
      announcement: settings.announcement.slice(0, 500),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// ---------------- AI MEMORY, TASKS & STUDY PROGRESS SYNC ----------------

export async function loadMemoriesFromFirestore(userId: string): Promise<AIMemoryItem[]> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return [];
  const uid = safeDocId(userId);
  const path = `users/${uid}/memories`;
  try {
    const snap = await getDocs(query(collection(db, 'users', uid, 'memories'), orderBy('updatedAt', 'desc'), limit(100)));
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id || d.id,
        userId: uid,
        category: data.category || 'preference',
        content: data.content || '',
        approved: Boolean(data.approved),
        createdAt: data.createdAt ? new Date(data.createdAt).getTime() : Date.now(),
        updatedAt: data.updatedAt ? new Date(data.updatedAt).getTime() : Date.now(),
      };
    });
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
    return [];
  }
}

export async function saveMemoryToFirestore(userId: string, item: AIMemoryItem): Promise<void> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return;
  const uid = safeDocId(userId);
  const memId = safeDocId(item.id);
  const path = `users/${uid}/memories/${memId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'memories', memId), {
      id: memId,
      userId: uid,
      category: item.category,
      content: item.content.slice(0, 2000),
      approved: Boolean(item.approved),
      createdAt: new Date(item.createdAt || Date.now()).toISOString(),
      updatedAt: new Date(item.updatedAt || Date.now()).toISOString(),
    });
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }
}

export async function deleteMemoryFromFirestore(userId: string, memoryId: string): Promise<void> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return;
  const uid = safeDocId(userId);
  const memId = safeDocId(memoryId);
  const path = `users/${uid}/memories/${memId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'memories', memId));
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }
}

export async function loadTasksFromFirestore(userId: string): Promise<PersonalTask[]> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return [];
  const uid = safeDocId(userId);
  const path = `users/${uid}/tasks`;
  try {
    const snap = await getDocs(query(collection(db, 'users', uid, 'tasks'), orderBy('updatedAt', 'desc'), limit(150)));
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id || d.id,
        userId: uid,
        title: data.title || '',
        notes: data.notes,
        dueDate: data.dueDate,
        dueTime: data.dueTime,
        priority: data.priority || 'medium',
        category: data.category || 'daily',
        completed: Boolean(data.completed),
        reminderMinutes: typeof data.reminderMinutes === 'number' ? data.reminderMinutes : undefined,
        createdAt: data.createdAt ? new Date(data.createdAt).getTime() : Date.now(),
        updatedAt: data.updatedAt ? new Date(data.updatedAt).getTime() : Date.now(),
      };
    });
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
    return [];
  }
}

export async function saveTaskToFirestore(userId: string, task: PersonalTask): Promise<void> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return;
  const uid = safeDocId(userId);
  const taskId = safeDocId(task.id);
  const path = `users/${uid}/tasks/${taskId}`;
  try {
    const payload: Record<string, any> = {
      id: taskId,
      userId: uid,
      title: task.title.slice(0, 240),
      priority: task.priority,
      category: task.category.slice(0, 48),
      completed: Boolean(task.completed),
      createdAt: new Date(task.createdAt || Date.now()).toISOString(),
      updatedAt: new Date(task.updatedAt || Date.now()).toISOString(),
    };
    if (task.notes) payload.notes = task.notes.slice(0, 2000);
    if (task.dueDate) payload.dueDate = task.dueDate.slice(0, 20);
    if (task.dueTime) payload.dueTime = task.dueTime.slice(0, 20);
    if (typeof task.reminderMinutes === 'number') payload.reminderMinutes = task.reminderMinutes;
    await setDoc(doc(db, 'users', uid, 'tasks', taskId), payload);
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }
}

export async function deleteTaskFromFirestore(userId: string, taskId: string): Promise<void> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return;
  const uid = safeDocId(userId);
  const safeId = safeDocId(taskId);
  const path = `users/${uid}/tasks/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'tasks', safeId));
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }
}

export async function loadStudyProgressFromFirestore(userId: string): Promise<StudyProgressItem[]> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return [];
  const uid = safeDocId(userId);
  const path = `users/${uid}/studyProgress`;
  try {
    const snap = await getDocs(
      query(collection(db, 'users', uid, 'studyProgress'), orderBy('completedAt', 'desc'), limit(100))
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id || d.id,
        userId: uid,
        topic: data.topic || '',
        mode: data.mode || 'notes',
        score: typeof data.score === 'number' ? data.score : 0,
        totalQuestions: typeof data.totalQuestions === 'number' ? data.totalQuestions : 0,
        language: data.language || 'bilingual',
        completedAt: data.completedAt ? new Date(data.completedAt).getTime() : Date.now(),
      };
    });
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
    return [];
  }
}

export async function saveStudyProgressToFirestore(
  userId: string,
  item: StudyProgressItem
): Promise<void> {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) return;
  const uid = safeDocId(userId);
  const progId = safeDocId(item.id);
  const path = `users/${uid}/studyProgress/${progId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'studyProgress', progId), {
      id: progId,
      userId: uid,
      topic: item.topic.slice(0, 200),
      mode: item.mode.slice(0, 40),
      score: Number(item.score) || 0,
      totalQuestions: Number(item.totalQuestions) || 0,
      language: (item.language || 'bilingual').slice(0, 20),
      completedAt: new Date(item.completedAt || Date.now()).toISOString(),
    });
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }
}
