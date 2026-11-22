/** The app's single IndexedDB database (everything stays in this browser). */

const DB_NAME = 'signscan';
const VERSION = 2; // v1: bursts; v2: + references

export type StoreName = 'bursts' | 'references';

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('This browser has no IndexedDB, so data cannot be saved.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('bursts'))
        db.createObjectStore('bursts', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('references')) {
        db.createObjectStore('references', { keyPath: 'letter' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function tx<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
