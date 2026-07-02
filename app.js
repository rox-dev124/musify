// --- PWA registration ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js');
  });
}

// --- IndexedDB setup ---
const DB_NAME = 'offline-music-db';
const DB_VERSION = 2;
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('albums')) {
        db.createObjectStore('albums', { keyPath: 'id', autoIncrement: true });
      }

      if (!db.objectStoreNames.contains('tracks')) {
        const store = db.createObjectStore('tracks', { keyPath: 'id', autoIncrement: true });
        store.createIndex('albumId', 'albumId', { unique: false });
      } else {
        const store = req.transaction.objectStore('tracks');
        if (!store.indexNames.contains('albumId')) {
          store.createIndex('albumId', 'albumId', { unique: false });
        }
      }
    };

    req.onsuccess = e => {
      db = e.target.result;
      resolve(db);
    };

    req.onerror = e => reject(e.target.error);
  });
}

// --- Albums helpers ---
function addAlbum(name, coverArrayBuffer) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('albums', 'readwrite');
    const store = tx.objectStore('albums');
    const req = store.add({ name, cover: coverArrayBuffer || null });

    req.onsuccess = () => resolve(req.result);
    req.onerror = e => reject(e.target.error);
  });
}

function getAllAlbums() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('albums', 'readonly');
    const store = tx.objectStore('albums');
    const req = store.getAll();

    req.onsuccess = () => resolve(req.result);
    req.onerror = e => reject(e.target.error);
  });
}

// --- Tracks helpers ---
function addTrack(name, arrayBuffer, albumId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tracks', 'readwrite');
    const store = tx.objectStore('tracks');
    const req = store.add({ name, data: arrayBuffer, albumId: albumId || null });

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

function getTracksByAlbum(albumId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tracks', 'readonly');
    const store = tx.objectStore('tracks');
    const index = store.index('albumId');
    const req = index.getAll(albumId);

    req.onsuccess = () => resolve(req.result);
    req.onerror = e => reject(e.target.error);
  });
}

// --- UI elements ---
const importBtn = document.getElementById('importBtn');
const fileInput = document.getElementById('fileInput');
const trackList = document.getElementById('trackList');
const albumList = document.getElementById('albumList');
const tracksTitle = document.getElementById('tracksTitle');

const audio = document.getElementById('audio');
const nowPlaying = document.getElementById('nowPlaying');
const playPauseBtn = document.getElementById('playPauseBtn');
const seek = document.getElementById('seek');

const albumPopup = document.getElementById('albumPopup');
const albumNameInput = document.getElementById('albumNameInput');
const albumCoverInput = document.getElementById('albumCoverInput');
const newAlbumBtn = document.getElementById('newAlbumBtn');
const createAlbumBtn = document.getElementById('createAlbumBtn');
const cancelAlbumBtn = document.getElementById('cancelAlbumBtn');

let currentTrack = null;
let currentBlobUrl = null;
let isSeeking = false;
let currentAlbumId = null;

// --- init ---
async function init() {
  await openDB();
  const [albums, tracks] = await Promise.all([getAllAlbums(), getAllTracks()]);
  renderAlbums(albums);
  renderTrackList(tracks);
}

// --- render albums ---
function renderAlbums(albums) {
  albumList.innerHTML = '';

  albums.forEach(album => {
    const li = document.createElement('li');

    const left = document.createElement('div');
    left.className = 'album-left';

    if (album.cover) {
      const blob = new Blob([album.cover], { type: 'image/*' });
      const url = URL.createObjectURL(blob);
      const img = document.createElement('img');
      img.src = url;
      img.className = 'albumCover';
      left.appendChild(img);
    } else {
      const img = document.createElement('div');
      img.className = 'albumCover';
      left.appendChild(img);
    }

    const nameSpan = document.createElement('span');
    nameSpan.textContent = album.name;
    left.appendChild(nameSpan);

    const openBtn = document.createElement('button');
    openBtn.textContent = 'Open';
    openBtn.addEventListener('click', () => openAlbum(album.id, album.name));

    li.appendChild(left);
    li.appendChild(openBtn);
    albumList.appendChild(li);
  });
}

// --- render tracks ---
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

// --- open album ---
async function openAlbum(albumId, albumName) {
  currentAlbumId = albumId;
  tracksTitle.textContent = `Tracks — ${albumName}`;
  const tracks = await getTracksByAlbum(albumId);
  renderTrackList(tracks);
}

// --- play track ---
async function playTrack(track) {
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

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
    await addTrack(file.name, arrayBuffer, currentAlbumId);
  }

  let tracks;
  if (currentAlbumId) {
    tracks = await getTracksByAlbum(currentAlbumId);
  } else {
    tracks = await getAllTracks();
  }
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

// --- album popup ---
newAlbumBtn.addEventListener('click', () => {
  albumPopup.style.display = 'flex';
  albumNameInput.value = '';
  albumCoverInput.value = '';
});

cancelAlbumBtn.addEventListener('click', () => {
  albumPopup.style.display = 'none';
});

createAlbumBtn.addEventListener('click', async () => {
  const name = albumNameInput.value.trim();
  if (!name) return;

  let coverFile = albumCoverInput.files[0] || null;
  let coverArrayBuffer = null;

  if (coverFile) {
    coverArrayBuffer = await coverFile.arrayBuffer();
  }

  await openDB();
  const albumId = await addAlbum(name, coverArrayBuffer);

  const albums = await getAllAlbums();
  renderAlbums(albums);

  albumPopup.style.display = 'none';
});

// --- boot ---
init();
