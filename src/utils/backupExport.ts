import {
  collection,
  getDocs,
  query,
  limit,
  orderBy,
} from 'firebase/firestore';
import { db } from './firebase';

export interface BackupMetadata {
  projectIdentifier: string;
  schemaVersion: string;
  backupTimestamp: string;
  generator: string;
  exportedBy?: string;
  totalDocuments: number;
}

export interface BackupPayload {
  metadata: BackupMetadata;
  collectionManifest: string[];
  documentCounts: Record<string, number>;
  collections: Record<string, any[]>;
}

const FORBIDDEN_SECRET_KEYS = /(_api_key|api_key|apikey|secret|password|credential|token|auth_token|session|bearer)/i;

function sanitizeBackupRecord(record: any): any {
  if (!record || typeof record !== 'object') return record;
  const clone: any = Array.isArray(record) ? [] : {};
  for (const [key, val] of Object.entries(record)) {
    if (FORBIDDEN_SECRET_KEYS.test(key)) {
      continue; // Never export keys, secrets, passwords or tokens
    }
    if (val && typeof val === 'object') {
      clone[key] = sanitizeBackupRecord(val);
    } else {
      clone[key] = val;
    }
  }
  return clone;
}

export async function generateSecureAdminBackup(
  userEmail: string,
  onProgress?: (statusText: string) => void
): Promise<BackupPayload> {
  if (!db) {
    throw new Error('Firestore database is not initialized.');
  }

  const collectionsData: Record<string, any[]> = {
    users: [],
    usage_analytics: [],
    admin_settings: [],
    streak_leaderboard: [],
  };

  const documentCounts: Record<string, number> = {
    users: 0,
    usage_analytics: 0,
    admin_settings: 0,
    streak_leaderboard: 0,
  };

  if (onProgress) onProgress('Scanning top-level collections (users, analytics, settings, leaderboard)...');

  // 1. Export users
  const usersSnap = await getDocs(query(collection(db, 'users'), limit(500)));
  const usersList: any[] = [];
  
  for (const userDoc of usersSnap.docs) {
    const userData = sanitizeBackupRecord(userDoc.data());
    const userId = userDoc.id;
    usersList.push({ id: userId, ...userData });

    // Subcollections per user
    const subCollections = [
      'conversations',
      'memories',
      'tasks',
      'studyProgress',
      'generatedImages',
      'automationSchedules',
      'automationLogs',
      'suggestionAnalytics',
      'voiceHistory',
    ];

    for (const subColName of subCollections) {
      try {
        const subColRef = collection(db, 'users', userId, subColName);
        const subSnap = await getDocs(query(subColRef, limit(200)));
        const subKey = `users/{userId}/${subColName}`;
        if (!collectionsData[subKey]) {
          collectionsData[subKey] = [];
          documentCounts[subKey] = 0;
        }

        for (const subDoc of subSnap.docs) {
          const subData = sanitizeBackupRecord(subDoc.data());
          collectionsData[subKey].push({ userId, id: subDoc.id, ...subData });
          documentCounts[subKey]++;

          // If subcollection is conversations, fetch nested messages
          if (subColName === 'conversations') {
            try {
              const msgRef = collection(db, 'users', userId, 'conversations', subDoc.id, 'messages');
              const msgSnap = await getDocs(query(msgRef, limit(200)));
              const msgKey = `users/{userId}/conversations/{convId}/messages`;
              if (!collectionsData[msgKey]) {
                collectionsData[msgKey] = [];
                documentCounts[msgKey] = 0;
              }
              for (const msgDoc of msgSnap.docs) {
                const msgData = sanitizeBackupRecord(msgDoc.data());
                collectionsData[msgKey].push({ userId, conversationId: subDoc.id, id: msgDoc.id, ...msgData });
                documentCounts[msgKey]++;
              }
            } catch {}
          }
        }
      } catch {}
    }
  }

  collectionsData.users = usersList;
  documentCounts.users = usersList.length;

  if (onProgress) onProgress('Exporting usage analytics, admin settings, and leaderboard...');

  // 2. Export usage_analytics
  try {
    const analSnap = await getDocs(query(collection(db, 'usage_analytics'), limit(500)));
    collectionsData.usage_analytics = analSnap.docs.map((d) => ({ id: d.id, ...sanitizeBackupRecord(d.data()) }));
    documentCounts.usage_analytics = collectionsData.usage_analytics.length;
  } catch {}

  // 3. Export admin_settings
  try {
    const adminSnap = await getDocs(query(collection(db, 'admin_settings'), limit(50)));
    collectionsData.admin_settings = adminSnap.docs.map((d) => ({ id: d.id, ...sanitizeBackupRecord(d.data()) }));
    documentCounts.admin_settings = collectionsData.admin_settings.length;
  } catch {}

  // 4. Export streak_leaderboard
  try {
    const leadSnap = await getDocs(query(collection(db, 'streak_leaderboard'), limit(200)));
    collectionsData.streak_leaderboard = leadSnap.docs.map((d) => ({ id: d.id, ...sanitizeBackupRecord(d.data()) }));
    documentCounts.streak_leaderboard = collectionsData.streak_leaderboard.length;
  } catch {}

  const collectionManifest = Object.keys(collectionsData).filter((k) => (collectionsData[k]?.length || 0) > 0);
  const totalDocuments = Object.values(documentCounts).reduce((sum, n) => sum + n, 0);

  if (onProgress) onProgress(`Finalizing backup manifest (${totalDocuments} documents exported)...`);

  return {
    metadata: {
      projectIdentifier: 'aadesh-ai-global',
      schemaVersion: '1.0',
      backupTimestamp: new Date().toISOString(),
      generator: 'Aadesh AI Secure Backup Center',
      exportedBy: userEmail,
      totalDocuments,
    },
    collectionManifest,
    documentCounts,
    collections: collectionsData,
  };
}

export interface BackupVerificationResult {
  valid: boolean;
  errors: string[];
  stats?: {
    schemaVersion: string;
    projectIdentifier: string;
    backupTimestamp: string;
    totalDocuments: number;
    manifestCount: number;
  };
}

export function verifyBackupJsonString(jsonString: string): BackupVerificationResult {
  const errors: string[] = [];
  try {
    const parsed = JSON.parse(jsonString);

    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, errors: ['Invalid JSON format: root must be an object.'] };
    }

    // Check metadata
    if (!parsed.metadata || typeof parsed.metadata !== 'object') {
      errors.push('Missing required backup metadata object.');
    } else {
      if (parsed.metadata.projectIdentifier !== 'aadesh-ai-global') {
        errors.push(`Invalid projectIdentifier: expected 'aadesh-ai-global', got '${parsed.metadata.projectIdentifier}'.`);
      }
      if (parsed.metadata.schemaVersion !== '1.0') {
        errors.push(`Unsupported schemaVersion: expected '1.0', got '${parsed.metadata.schemaVersion}'.`);
      }
      if (!parsed.metadata.backupTimestamp) {
        errors.push('Missing backupTimestamp in metadata.');
      }
    }

    // Check collectionManifest
    if (!Array.isArray(parsed.collectionManifest)) {
      errors.push('Missing or invalid collectionManifest array.');
    }

    // Check documentCounts
    if (!parsed.documentCounts || typeof parsed.documentCounts !== 'object') {
      errors.push('Missing documentCounts object.');
    }

    // Check collections
    if (!parsed.collections || typeof parsed.collections !== 'object') {
      errors.push('Missing collections data object.');
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return {
      valid: true,
      errors: [],
      stats: {
        schemaVersion: parsed.metadata.schemaVersion,
        projectIdentifier: parsed.metadata.projectIdentifier,
        backupTimestamp: parsed.metadata.backupTimestamp,
        totalDocuments: parsed.metadata.totalDocuments || 0,
        manifestCount: parsed.collectionManifest.length,
      },
    };
  } catch (err: any) {
    return { valid: false, errors: [`JSON parsing error: ${err?.message || 'Invalid syntax'}`] };
  }
}
