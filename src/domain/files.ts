/* Files live next to the record they belong to — the PAT file with the concept,
   the tech pack with the PO, the photo with the sample round — so nobody opens
   Slack, Drive or WhatsApp to find them. The prototype keeps the bytes in this
   browser's IndexedDB and the metadata on the record; a real deployment swaps
   this module for object storage without touching the screens. */
import { useEffect, useState } from 'react';

const DB = 'bsc-plm-files'; const STORE = 'blobs';
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
export async function putFile(id: string, blob: Blob) {
  const db = await open();
  await new Promise<void>((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(blob, id); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
export async function getFile(id: string): Promise<Blob | null> {
  try { const db = await open();
    return await new Promise((res, rej) => { const r = db.transaction(STORE).objectStore(STORE).get(id); r.onsuccess = () => res((r.result as Blob) ?? null); r.onerror = () => rej(r.error); });
  } catch { return null; }
}
export async function deleteFile(id: string) {
  try { const db = await open(); await new Promise<void>(res => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); tx.oncomplete = () => res(); }); } catch { /* nothing to delete */ }
}
export async function clearFiles() {
  try { const db = await open(); await new Promise<void>(res => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear(); tx.oncomplete = () => res(); }); } catch { /* fresh browser */ }
}

/** Object URL for a stored file, or null while loading / when the bytes are not in this browser (seeded records). */
export function useFileUrl(id: string, stored: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!stored) return;
    let u: string | null = null; let live = true;
    getFile(id).then(b => { if (live && b) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { live = false; if (u) URL.revokeObjectURL(u); };
  }, [id, stored]);
  return url;
}

export const fmtSize = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
export const isImage = (mime: string) => mime.startsWith('image/');
export const fileIcon = (name: string, mime: string) => {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (isImage(mime)) return 'IMG';
  if (['dxf', 'dwg', 'ai', 'cdr', 'plt', 'pat', 'rul', 'mdl', 'pds', 'zip'].includes(ext)) return 'CAD';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'XLS';
  if (ext === 'pdf') return 'PDF';
  if (['doc', 'docx'].includes(ext)) return 'DOC';
  return ext.toUpperCase().slice(0, 4) || 'FILE';
};
