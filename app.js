// --- PWA registration (no network logic) ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js');
  });
}

// --- IndexedDB setup ---
const DB_NAME = 'offline-music-db';
const DB_VERSION = 1;
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('tracks')) {
        db.createObjectStore('tracks', { keyPath: 'id', autoIncrement: true });
      }
    };

    req.onsuccess = e => {
      db = e.target.result;
      resolve(db);
    };

    req.onerror = e => reject(e.target.error);
  });
}

function addTrack(name, arrayBuffer) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tracks', 'readwrite');
    const store = tx.objectStore('tracks');
    const req = store.add({ name, data: arrayBuffer });

    req.onsuccess = () => resolve(req.result);
    req.onerror = e => reject(e.target.error);
  });
}

function getAllTracks() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tracks', 'readonly');
    const store = tx.objectStore('tracks');
    const req = store.getAll();

    req.onsuccess = () => resolve(req.result);
    req.onerror = e => reject(e.target.error);
  });
}

// --- UI + audio logic ---
const importBtn = document.getElementById('importBtn');
const fileInput = document.getElementById('fileInput');
const trackList = document.getElementById('trackList');
const audio = document.getElementById('audio');
const nowPlaying = document.getElementById('nowPlaying');
const playPauseBtn = document.getElementById('playPauseBtn');
const seek = document.getElementById('seek');

let currentTrack = null;
let currentBlobUrl = null;
let isSeeking = false;

async function init() {
  await openDB();
  const tracks = await getAllTracks();
  renderTrackList(tracks);
}

function renderTrackList(tracks) {
  trackList.innerHTML = '';
  tracks.forEach(track => {
    const li = document.createElement('li');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = track.name;

    const playBtn = document.createElement('button');
    playBtn.textContent = 'Play';
    playBtn.addEventListener('click', () => playTrack(track));

    li.appendChild(nameSpan);
    li.appendChild(playBtn);
    trackList.appendChild(li);
  });
}

async function playTrack(track) {
  // revoke old URL
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

  // create Blob from ArrayBuffer
  const blob = new Blob([track.data], { type: 'audio/*' });
  const url = URL.createObjectURL(blob);
  currentBlobUrl = url;
  currentTrack = track;

  audio.src = url;
  audio.play();

  nowPlaying.textContent = `Now playing: ${track.name}`;
  playPauseBtn.disabled = false;
  playPauseBtn.textContent = 'Pause';
}

// --- import files ---
importBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', async e => {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  await openDB();

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    await addTrack(file.name, arrayBuffer);
  }

  const tracks = await getAllTracks();
  renderTrackList(tracks);
  fileInput.value = '';
});

// --- play/pause + seek ---
playPauseBtn.addEventListener('click', () => {
  if (!audio.src) return;
  if (audio.paused) {
    audio.play();
    playPauseBtn.textContent = 'Pause';
  } else {
    audio.pause();
    playPauseBtn.textContent = 'Play';
  }
});

audio.addEventListener('timeupdate', () => {
  if (audio.duration && !isSeeking) {
    seek.value = ((audio.currentTime / audio.duration) * 100) || 0;
  }
});

seek.addEventListener('input', () => {
  isSeeking = true;
});

seek.addEventListener('change', () => {
  if (audio.duration) {
    const pct = Number(seek.value) / 100;
    audio.currentTime = pct * audio.duration;
  }
  isSeeking = false;
});

audio.addEventListener('ended', () => {
  playPauseBtn.textContent = 'Play';
});

// --- boot ---
init();
