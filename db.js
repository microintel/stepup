/* ══════════════════════════════════════════════════════
   db.js — IndexedDB helpers
══════════════════════════════════════════════════════ */

const DB_NAME = 'sip-compounder', DB_VERSION = 1;
let db;

export function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('entries'))  d.createObjectStore('entries',  { keyPath: 'id', autoIncrement: true });
    };
    r.onsuccess = e => { db = e.target.result; res(db); };
    r.onerror   = e => rej(e.target.error);
  });
}

const txs   = (s, m = 'readonly') => db.transaction(s, m).objectStore(s);
export const dbGet = (s, k) => new Promise((res, rej) => { const r = txs(s).get(k);        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export const dbPut = (s, v) => new Promise((res, rej) => { const r = txs(s, 'readwrite').put(v);    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export const dbDel = (s, k) => new Promise((res, rej) => { const r = txs(s, 'readwrite').delete(k); r.onsuccess = () => res();         r.onerror = () => rej(r.error); });
export const dbAll = (s)    => new Promise((res, rej) => { const r = txs(s).getAll();               r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export const dbClr = (s)    => new Promise((res, rej) => { const r = txs(s, 'readwrite').clear();   r.onsuccess = () => res();         r.onerror = () => rej(r.error); });
