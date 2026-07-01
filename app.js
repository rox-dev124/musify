// app.js (no network, only local)
const dbName = 'offline-music';

async function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      db.createObjectStore('tracks', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

// import files from <input type="file" multiple>
