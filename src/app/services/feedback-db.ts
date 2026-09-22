import { PendingEntry, FeedbackAuthor } from './feedback.model';

// IndexedDB pending-entry queue. Opened lazily once; if IndexedDB is
// unavailable or throws (private browsing, disabled storage, etc.) every
// function falls back to an in-memory Map so the caller never fails.
const DB_NAME = 'shadow-feedback';
const DB_VERSION = 1;
const STORE = 'pending';

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memoryStore = new Map<string, PendingEntry>();

function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        if (!('indexedDB' in window)) { resolve(null); return; }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const store = db.createObjectStore(STORE, { keyPath: 'id' });
            store.createIndex('by_author', 'author', { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

export async function putPending(entry: PendingEntry): Promise<void> {
  const db = await openDb();
  if (!db) { memoryStore.set(entry.id, entry); return; }
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    memoryStore.set(entry.id, entry);
  }
}

export async function allPending(author: FeedbackAuthor): Promise<PendingEntry[]> {
  const db = await openDb();
  if (!db) return [...memoryStore.values()].filter((e) => e.author === author);
  try {
    return await new Promise<PendingEntry[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).index('by_author').getAll(author);
      req.onsuccess = () => resolve(req.result as PendingEntry[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [...memoryStore.values()].filter((e) => e.author === author);
  }
}

export async function deletePending(id: string): Promise<void> {
  const db = await openDb();
  if (!db) { memoryStore.delete(id); return; }
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    memoryStore.delete(id);
  }
}
