/**
 * Aadesh AI - Secure Backup & Restore Payload Validator
 * Validates schema version 1.0, enforces strict collection allowlists,
 * blocks unauthorized fields, sensitive configuration, API keys, credentials,
 * and privilege escalation attempts.
 */

export const AUTHORIZED_BACKUP_COLLECTION_TEMPLATES = new Set<string>([
  'users',
  'users/{userId}/conversations',
  'users/{userId}/conversations/{convId}/messages',
  'users/{userId}/conversations/{conversationId}/messages',
  'users/{userId}/memories',
  'users/{userId}/tasks',
  'users/{userId}/studyProgress',
  'users/{userId}/generatedImages',
  'users/{userId}/automationSchedules',
  'users/{userId}/automationLogs',
  'users/{userId}/suggestionAnalytics',
  'users/{userId}/voiceHistory',
  'usage_analytics',
  'admin_settings',
  'streak_leaderboard',
]);

const FORBIDDEN_SENSITIVE_KEY_REGEX =
  /(_api_key|api_key|apikey|secret|password|passwd|private_key|service_account|credential|auth_token|session_token|access_token|refresh_token|bearer)/i;

const LEAKED_SECRET_PATTERNS = [
  /AIza[0-9A-Za-z-_]{35}/, // Google / Gemini API key
  /gsk_[a-zA-Z0-9]{20,}/,  // Groq API key
  /sk-or-v1-[a-zA-Z0-9]{20,}/, // OpenRouter API key
  /sk-[a-zA-Z0-9]{20,}/,   // OpenAI API key
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, // PEM private key
];

// Explicit allowed field names per collection to prevent unauthorized schema injections
const COLLECTION_ALLOWED_FIELDS: Record<string, Set<string>> = {
  users: new Set([
    'id', 'userId', 'displayName', 'nickname', 'age', 'onboardingCompleted', 'memoryConsent',
    'username', 'email', 'photoURL',
    'preferredLanguage', 'preferredTheme', 'aiProvider', 'aiModel', 'openRouterModel',
    'aiResponseLanguage', 'autoDetectInputLanguage', 'translationEnabled', 'translationLanguage',
    'termsAccepted', 'termsAcceptedAt',
    'country', 'countryCode', 'countryFlag', 'timezone', 'countryDetectionMethod', 'isManualCountry',
    'streakDays', 'currentStreak', 'longestStreak', 'lastActiveDate',
    'recoveryCount', 'recoveryMonth', 'streakBeforeBreak', 'streakBrokenDate',
    'xp', 'level', 'levelTitle', 'streakGoalDays', 'recoveredDates',
    'status', 'role', 'provider',
    'messageCount', 'conversationCount', 'createdAt', 'updatedAt', 'lastActiveAt',
  ]),
  'users/{userId}/conversations': new Set([
    'id', 'userId', 'title', 'language', 'category', 'messageCount', 'createdAt', 'updatedAt',
    'userDisplayName', 'userEmail',
  ]),
  'users/{userId}/conversations/{convId}/messages': new Set([
    'id', 'userId', 'conversationId', 'role', 'content', 'senderName', 'senderAvatarUrl',
    'translation', 'translationLanguage', 'feedback', 'reactions', 'userReactions',
    'isPinned', 'pinnedAt', 'attachmentName', 'imageUrl', 'isVoice', 'timestamp', 'editedAt',
  ]),
  'users/{userId}/conversations/{conversationId}/messages': new Set([
    'id', 'userId', 'conversationId', 'role', 'content', 'senderName', 'senderAvatarUrl',
    'translation', 'translationLanguage', 'feedback', 'reactions', 'userReactions',
    'isPinned', 'pinnedAt', 'attachmentName', 'imageUrl', 'isVoice', 'timestamp', 'editedAt',
  ]),
  'users/{userId}/memories': new Set([
    'id', 'userId', 'category', 'content', 'approved', 'source', 'isSensitive', 'keywords',
    'createdAt', 'updatedAt',
  ]),
  'users/{userId}/tasks': new Set([
    'id', 'userId', 'title', 'notes', 'dueDate', 'dueTime', 'priority', 'category',
    'completed', 'reminderMinutes', 'createdAt', 'updatedAt',
  ]),
  'users/{userId}/studyProgress': new Set([
    'id', 'userId', 'topic', 'mode', 'score', 'totalQuestions', 'language', 'completedAt',
  ]),
  'users/{userId}/generatedImages': new Set([
    'id', 'userId', 'prompt', 'revisedPrompt', 'style', 'aspectRatio', 'resolution',
    'modelName', 'mimeType', 'storageLocation', 'createdAt', 'latencyMs',
  ]),
  'users/{userId}/automationSchedules': new Set([
    'id', 'userId', 'title', 'category', 'frequency', 'timeOfDay', 'dayOfWeek',
    'prompt', 'tone', 'targetLanguage', 'enabled', 'nextRunAt', 'lastRunAt',
    'lastStatus', 'runCount', 'createdAt', 'updatedAt',
  ]),
  'users/{userId}/automationLogs': new Set([
    'id', 'userId', 'scheduleId', 'taskTitle', 'category', 'tone', 'triggerType',
    'status', 'statusMessage', 'outputSummary', 'errorMessage', 'modelUsed',
    'latencyMs', 'startedAt', 'completedAt',
  ]),
  'users/{userId}/suggestionAnalytics': new Set([
    'id', 'userId', 'normalizedKey', 'sampleText', 'category', 'language',
    'clickCount', 'lastClickedAt', 'createdAt',
  ]),
  'users/{userId}/voiceHistory': new Set([
    'id', 'userId', 'transcript', 'language', 'durationSeconds', 'timestamp',
  ]),
  admin_settings: new Set([
    'id', 'platformName', 'maintenanceMode', 'announcement', 'updatedAt',
  ]),
  streak_leaderboard: new Set([
    'id', 'userId', 'displayName', 'avatarUrl', 'avatarColor', 'country', 'countryFlag',
    'currentStreak', 'longestStreak', 'lastActiveDate', 'level', 'updatedAt',
  ]),
  usage_analytics: new Set([
    'id', 'userId', 'eventType', 'language', 'latencyMs', 'dateKey', 'timestamp',
  ]),
};

export interface BackupValidationResult {
  valid: boolean;
  errors: string[];
  stats?: {
    schemaVersion: string;
    projectIdentifier: string;
    backupTimestamp: string;
    totalDocuments: number;
    collectionsCount: number;
  };
}

function scanObjectForSensitiveData(
  obj: any,
  colPath: string,
  errors: string[],
  depth = 0
): void {
  if (!obj || typeof obj !== 'object' || depth > 8) return;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      scanObjectForSensitiveData(item, colPath, errors, depth + 1);
    }
    return;
  }

  for (const [key, val] of Object.entries(obj)) {
    if (FORBIDDEN_SENSITIVE_KEY_REGEX.test(key)) {
      errors.push(
        `Sensitive configuration or credential field "${key}" detected in collection "${colPath}". Restoration rejected.`
      );
    }

    if (typeof val === 'string') {
      for (const pattern of LEAKED_SECRET_PATTERNS) {
        if (pattern.test(val)) {
          errors.push(
            `Sensitive API key or private credential pattern detected in field "${key}" within collection "${colPath}". Restoration rejected.`
          );
          break;
        }
      }
    } else if (typeof val === 'object' && val !== null) {
      scanObjectForSensitiveData(val, colPath, errors, depth + 1);
    }
  }
}

export function validateRestoreBackupPayload(payload: any): BackupValidationResult {
  const errors: string[] = [];

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, errors: ['Invalid backup payload: root must be a JSON object.'] };
  }

  // 1. Metadata Validation
  const metadata = payload.metadata;
  if (!metadata || typeof metadata !== 'object') {
    errors.push('Missing required backup metadata object.');
  } else {
    if (metadata.projectIdentifier !== 'aadesh-ai-global') {
      errors.push(
        `Invalid projectIdentifier: expected "aadesh-ai-global", got "${metadata.projectIdentifier}".`
      );
    }
    if (metadata.schemaVersion !== '1.0') {
      errors.push(
        `Unsupported schemaVersion: expected "1.0", got "${metadata.schemaVersion}".`
      );
    }
    if (typeof metadata.backupTimestamp !== 'string' || !metadata.backupTimestamp.trim()) {
      errors.push('Missing or invalid backupTimestamp in metadata.');
    }
    if (
      typeof metadata.totalDocuments !== 'number' ||
      !Number.isFinite(metadata.totalDocuments) ||
      metadata.totalDocuments < 0 ||
      metadata.totalDocuments > 50000
    ) {
      errors.push('Invalid totalDocuments count in metadata (must be between 0 and 50,000).');
    }
  }

  // 2. Collection Manifest Validation
  const manifest = payload.collectionManifest;
  if (!Array.isArray(manifest) || manifest.length === 0) {
    errors.push('Missing or empty collectionManifest array.');
  } else {
    for (const col of manifest) {
      if (typeof col !== 'string' || !AUTHORIZED_BACKUP_COLLECTION_TEMPLATES.has(col)) {
        errors.push(`Unauthorized collection path in manifest: "${col}".`);
      }
    }
  }

  // 3. Collections Data Validation
  const collections = payload.collections;
  if (!collections || typeof collections !== 'object' || Array.isArray(collections)) {
    errors.push('Missing or invalid collections data object.');
  } else {
    for (const [colPath, records] of Object.entries(collections)) {
      if (!AUTHORIZED_BACKUP_COLLECTION_TEMPLATES.has(colPath)) {
        errors.push(`Unauthorized collection path in collections: "${colPath}".`);
        continue;
      }

      if (!Array.isArray(records)) {
        errors.push(`Collection "${colPath}" must contain an array of records.`);
        continue;
      }

      const allowedFields = COLLECTION_ALLOWED_FIELDS[colPath];

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        if (!record || typeof record !== 'object' || Array.isArray(record)) {
          errors.push(`Invalid record at index ${i} in collection "${colPath}": must be an object.`);
          continue;
        }

        // Validate document ID
        const docId = String(record.id || '').trim();
        if (!docId || docId.length > 128 || !/^[a-zA-Z0-9_\-]+$/.test(docId)) {
          errors.push(`Invalid document ID "${record.id}" at index ${i} in collection "${colPath}".`);
        }

        // Deep check for sensitive configuration and leaked API keys
        scanObjectForSensitiveData(record, colPath, errors);

        // Check for unauthorized fields
        if (allowedFields) {
          for (const field of Object.keys(record)) {
            if (!allowedFields.has(field)) {
              errors.push(
                `Unauthorized field "${field}" detected in document "${docId || i}" within collection "${colPath}".`
              );
            }
          }
        }

        // Prevent unauthorized privilege escalation in users collection
        if (colPath === 'users') {
          const userEmail = String(record.email || '').trim().toLowerCase();
          if (record.role === 'admin' && userEmail !== 'aadeshjaisi6@gmail.com') {
            errors.push(
              `Unauthorized privilege escalation: account "${userEmail || docId}" cannot be assigned role "admin" from backup data.`
            );
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    stats: {
      schemaVersion: metadata.schemaVersion,
      projectIdentifier: metadata.projectIdentifier,
      backupTimestamp: metadata.backupTimestamp,
      totalDocuments: metadata.totalDocuments,
      collectionsCount: Object.keys(collections).length,
    },
  };
}
