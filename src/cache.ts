let promise: Promise<IDBDatabase> | null = null;
function db() {
  return (promise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('milo-local', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('state');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
export async function cacheGet(key: string): Promise<any> {
  try {
    const d = await db();
    return await new Promise((resolve, reject) => {
      const r = d.transaction('state').objectStore('state').get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } catch {
    return undefined;
  }
}
export async function cacheSet(key: string, value: any): Promise<boolean> {
  try {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const t = d.transaction('state', 'readwrite');
      if (value === undefined) t.objectStore('state').delete(key);
      else t.objectStore('state').put(value, key);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
    return true;
  } catch {
    return false; /* Recovery is best effort; only the HTML file is authoritative. */
  }
}
