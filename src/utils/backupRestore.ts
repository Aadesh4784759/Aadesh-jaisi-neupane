import {
  doc,
  getDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { validateRestoreBackupPayload } from './backupValidation';

export type RestoreMode = 'missing_only' | 'selected_collections' | 'full_restore';

export interface DryRunStats {
  totalBackupDocs: number;
  newDocsCount: number;
  existingDocsCount: number;
  skippedDocsCount: number;
  collectionsSummary: Array<{
    collectionPath: string;
    backupCount: number;
    newCount: number;
    existingCount: number;
  }>;
  estimatedWrites: number;
}

export interface RestoreExecutionResult {
  success: boolean;
  startedAt: string;
  completedAt: string;
  restoredCount: number;
  skippedCount: number;
  failedCount: number;
  errors: string[];
}

export function resolveCollectionPath(manifestPath: string, record: any): { path: string; docId: string } | null {
  const docId = String(record?.id || '').trim();
  if (!docId) return null;

  const userId = String(record?.userId || '').trim();
  const convId = String(record?.conversationId || record?.id || '').trim();

  if (manifestPath === 'users') {
    return { path: 'users', docId };
  }
  if (manifestPath === 'usage_analytics') {
    return { path: 'usage_analytics', docId };
  }
  if (manifestPath === 'admin_settings') {
    return { path: 'admin_settings', docId };
  }
  if (manifestPath === 'streak_leaderboard') {
    return { path: 'streak_leaderboard', docId };
  }

  if (!userId) return null;

  if (manifestPath.includes('conversations/{convId}/messages')) {
    if (!convId) return null;
    return { path: `users/${userId}/conversations/${convId}/messages`, docId };
  }
  if (manifestPath.includes('conversations')) {
    return { path: `users/${userId}/conversations`, docId };
  }
  if (manifestPath.includes('memories')) {
    return { path: `users/${userId}/memories`, docId };
  }
  if (manifestPath.includes('tasks')) {
    return { path: `users/${userId}/tasks`, docId };
  }
  if (manifestPath.includes('studyProgress')) {
    return { path: `users/${userId}/studyProgress`, docId };
  }
  if (manifestPath.includes('generatedImages')) {
    return { path: `users/${userId}/generatedImages`, docId };
  }
  if (manifestPath.includes('automationSchedules')) {
    return { path: `users/${userId}/automationSchedules`, docId };
  }
  if (manifestPath.includes('automationLogs')) {
    return { path: `users/${userId}/automationLogs`, docId };
  }
  if (manifestPath.includes('suggestionAnalytics')) {
    return { path: `users/${userId}/suggestionAnalytics`, docId };
  }
  if (manifestPath.includes('voiceHistory')) {
    return { path: `users/${userId}/voiceHistory`, docId };
  }

  return null;
}

export async function performDryRunPreview(
  backupPayload: any,
  selectedCollections: string[],
  restoreMode: RestoreMode
): Promise<DryRunStats> {
  if (!db) throw new Error('Firestore is not initialized.');
  const firestoreDb = db;

  const validation = validateRestoreBackupPayload(backupPayload);
  if (!validation.valid) {
    throw new Error(`Payload validation failed: ${validation.errors[0]}`);
  }

  let totalBackupDocs = 0;
  let newDocsCount = 0;
  let existingDocsCount = 0;
  let skippedDocsCount = 0;
  const collectionsSummary: Array<{
    collectionPath: string;
    backupCount: number;
    newCount: number;
    existingCount: number;
  }> = [];

  const manifest: string[] = backupPayload?.collectionManifest || [];
  const collectionsMap: Record<string, any[]> = backupPayload?.collections || {};

  for (const manifestPath of manifest) {
    if (restoreMode === 'selected_collections' && !selectedCollections.includes(manifestPath)) {
      continue;
    }

    const records = collectionsMap[manifestPath];
    if (!Array.isArray(records) || records.length === 0) continue;

    let colNew = 0;
    let colExisting = 0;

    for (const record of records) {
      totalBackupDocs++;
      const resolved = resolveCollectionPath(manifestPath, record);
      if (!resolved) {
        skippedDocsCount++;
        continue;
      }

      try {
        const docRef = doc(firestoreDb, resolved.path, resolved.docId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          if (restoreMode === 'missing_only') {
            skippedDocsCount++;
          } else {
            existingDocsCount++;
            colExisting++;
          }
        } else {
          newDocsCount++;
          colNew++;
        }
      } catch {
        skippedDocsCount++;
      }
    }

    collectionsSummary.push({
      collectionPath: manifestPath,
      backupCount: records.length,
      newCount: colNew,
      existingCount: colExisting,
    });
  }

  return {
    totalBackupDocs,
    newDocsCount,
    existingDocsCount,
    skippedDocsCount,
    collectionsSummary,
    estimatedWrites: newDocsCount + (restoreMode !== 'missing_only' ? existingDocsCount : 0),
  };
}

export async function executeSecureRestore(
  backupPayload: any,
  selectedCollections: string[],
  restoreMode: RestoreMode,
  onProgress?: (status: string) => void
): Promise<RestoreExecutionResult> {
  if (!db) throw new Error('Firestore is not initialized.');
  const firestoreDb = db;

  const validation = validateRestoreBackupPayload(backupPayload);
  if (!validation.valid) {
    throw new Error(`Security validation rejected restore: ${validation.errors[0]}`);
  }

  const startedAt = new Date().toISOString();
  let restoredCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  const manifest: string[] = backupPayload?.collectionManifest || [];
  const collectionsMap: Record<string, any[]> = backupPayload?.collections || {};

  let batch = writeBatch(firestoreDb);
  let batchOpCount = 0;

  const commitBatchSafe = async () => {
    if (batchOpCount > 0) {
      try {
        await batch.commit();
      } catch (err: any) {
        errors.push(`Batch commit failed: ${err?.message || 'Unknown Firestore error'}`);
        failedCount += batchOpCount;
      }
      batch = writeBatch(firestoreDb);
      batchOpCount = 0;
    }
  };

  for (const manifestPath of manifest) {
    if (restoreMode === 'selected_collections' && !selectedCollections.includes(manifestPath)) {
      continue;
    }

    const records = collectionsMap[manifestPath];
    if (!Array.isArray(records)) continue;

    if (onProgress) onProgress(`Restoring collection: ${manifestPath}...`);

    for (const record of records) {
      const resolved = resolveCollectionPath(manifestPath, record);
      if (!resolved) {
        skippedCount++;
        continue;
      }

      try {
        const docRef = doc(firestoreDb, resolved.path, resolved.docId);
        if (restoreMode === 'missing_only') {
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            skippedCount++;
            continue;
          }
        }

        const { id, userId, conversationId, ...cleanData } = record;
        batch.set(docRef, cleanData, { merge: true });
        restoredCount++;
        batchOpCount++;

        if (batchOpCount >= 400) {
          await commitBatchSafe();
        }
      } catch (err: any) {
        failedCount++;
        errors.push(`Failed record ${resolved.docId} in ${manifestPath}: ${err?.message}`);
      }
    }
  }

  await commitBatchSafe();
  const completedAt = new Date().toISOString();

  return {
    success: failedCount === 0,
    startedAt,
    completedAt,
    restoredCount,
    skippedCount,
    failedCount,
    errors,
  };
}
