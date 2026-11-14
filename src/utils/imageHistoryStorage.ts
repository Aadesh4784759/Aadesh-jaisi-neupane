import { GeneratedImageItem } from '../types';

const DB_NAME = 'aadesh_ai_image_studio_v1';
const STORE_NAME = 'generated_images';
const DB_VERSION = 1;
const FALLBACK_KEY_PREFIX = 'aadesh_ai_img_history_v1_';

function openImageDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

function getFallbackKey(userId: string): string {
  return `${FALLBACK_KEY_PREFIX}${userId || 'guest'}`;
}

export async function saveGeneratedImageToDB(
  userId: string,
  item: GeneratedImageItem
): Promise<void> {
  const scopedItem: GeneratedImageItem = {
    ...item,
    userId: userId || 'guest',
  };

  try {
    const db = await openImageDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(scopedItem);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error('IndexedDB write failed'));
      };
    });
  } catch {
    // Graceful fallback with strict cap so localStorage doesn't overflow
    try {
      const key = getFallbackKey(userId);
      const existingRaw = localStorage.getItem(key);
      const existing: GeneratedImageItem[] = existingRaw ? JSON.parse(existingRaw) : [];
      const next = [scopedItem, ...existing.filter((x) => x.id !== scopedItem.id)].slice(0, 6);
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors silently
    }
  }
}

export async function loadGeneratedImagesFromDB(
  userId: string
): Promise<GeneratedImageItem[]> {
  const targetUser = userId || 'guest';
  try {
    const db = await openImageDB();
    const items = await new Promise<GeneratedImageItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('userId');
      const req = index.getAll(targetUser);
      req.onsuccess = () => {
        db.close();
        const rows = Array.isArray(req.result) ? (req.result as GeneratedImageItem[]) : [];
        rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        resolve(rows);
      };
      req.onerror = () => {
        db.close();
        reject(req.error || new Error('IndexedDB read failed'));
      };
    });
    return items;
  } catch {
    try {
      const raw = localStorage.getItem(getFallbackKey(targetUser));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}

export async function deleteGeneratedImageFromDB(id: string, userId?: string): Promise<void> {
  try {
    const db = await openImageDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error('IndexedDB delete failed'));
      };
    });
  } catch {
    if (userId) {
      try {
        const key = getFallbackKey(userId);
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw) as GeneratedImageItem[];
          localStorage.setItem(key, JSON.stringify(parsed.filter((item) => item.id !== id)));
        }
      } catch {}
    }
  }
}
