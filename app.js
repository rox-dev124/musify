// --- PWA registration ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js');
  });
}

// --- IndexedDB setup ---
const DB_NAME = 'offline-music-db';
const DB_VERSION = 3;
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
      }
    };

    req.onsuccess = e => {
      db = e.target.result;
      resolve(db);
    };

    req.onerror = e => reject(e.target.error);
  });
}

// --- Album helpers ---
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

// --- Track helpers ---
function addTrack(name, arrayBuffer, albumId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tracks', 'readwrite');
    const store = tx.objectStore('tracks');
    const req = store.add({ name, data: arrayBuffer, albumId });

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
const importZipBtn = document.getElementById('importZipBtn');
const zipInput = document.getElementById('zipInput');

const importBtn = document.getElementById('importBtn');
const fileInput = document.getElementById('fileInput');

const albumList = document.getElementById('albumList');
const trackList = document.getElementById('trackList');
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

let currentAlbumId = null;
let currentTrack = null;
let currentBlobUrl = null;
let isSeeking = false;

// --- init ---
async function init() {
  await openDB();
  const albums = await getAllAlbums();
  renderAlbums(albums);
}

init();

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

// --- open album ---
async function openAlbum(albumId, albumName) {
  currentAlbumId = albumId;
  tracksTitle.textContent = `Tracks — ${albumName}`;
  const tracks = await getTracksByAlbum(albumId);
  renderTrackList(tracks);
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

// --- play track ---
async function playTrack(track) {
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
  }

  const blob = new Blob([track.data], { type: 'audio/*' });
  const url = URL.createObjectURL(blob);
  currentBlobUrl = url;

  audio.src = url;
  audio.play();

  nowPlaying.textContent = `Now playing: ${track.name}`;
  playPauseBtn.disabled = false;
  playPauseBtn.textContent = 'Pause';
}

// --- import ZIP ---
importZipBtn.addEventListener('click', () => zipInput.click());

zipInput.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;

  const zipData = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(zipData);

  await openDB();

  const folders = {};

  // Detect folders
  Object.keys(zip.files).forEach(path => {
    const item = zip.files[path];
    if (item.dir) {
      const folderName = path.replace('/', '');
      folders[folderName] = [];
    }
  });

  // Assign files to folders
  for (const path in zip.files) {
    const item = zip.files[path];
    if (!item.dir) {
      const parts = path.split('/');
      const folderName = parts[0];
      if (folders[folderName]) {
        folders[folderName].push(item);
      }
    }
  }

  // Process each folder as an album
  for (const folderName in folders) {
    let coverBuffer = null;

    // Detect cover
    for (const file of folders[folderName]) {
      if (file.name.endsWith('cover.jpg') || file.name.endsWith('cover.png')) {
        coverBuffer = await file.async('arraybuffer');
      }
    }

    // Create album
    const albumId = await addAlbum(folderName, coverBuffer);

    // Add tracks
    for (const file of folders[folderName]) {
      if (file.name.endsWith('.mp3') || file.name.endsWith('.wav') || file.name.endsWith('.ogg')) {
        const audioBuffer = await file.async('arraybuffer');
        const trackName = file.name.split('/').pop();
        await addTrack(trackName, audioBuffer, albumId);
      }
    }
  }

  const albums = await getAllAlbums();
  renderAlbums(albums);

  zipInput.value = '';
});

// --- import single audio files ---
importBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async e => {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  await openDB();

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    await addTrack(file.name, arrayBuffer, currentAlbumId);
  }

  const tracks = await getTracksByAlbum(currentAlbumId);
  renderTrackList(tracks);

  fileInput.value = '';
});

// --- play/pause ---
playPauseBtn.addEventListener('click', () => {
  if (audio.paused) {
    audio.play();
    playPauseBtn.textContent = 'Pause';
  } else {
    audio.pause();
    playPauseBtn.textContent = 'Play';
  }
});

// --- seek ---
audio.addEventListener('timeupdate', () => {
  if (audio.duration && !isSeeking) {
    seek.value = (audio.currentTime / audio.duration) * 100;
  }
});

seek.addEventListener('input', () => isSeeking = true);

seek.addEventListener('change', () => {
  if (audio.duration) {
    audio.currentTime = (seek.value / 100) * audio.duration;
  }
  isSeeking = false;
});

// --- album popup ---
newAlbumBtn.addEventListener('click', () => {
  albumPopup.style.display = 'flex';
});

cancelAlbumBtn.addEventListener('click', () => {
  albumPopup.style.display = 'none';
});

createAlbumBtn.addEventListener('click', async () => {
  const name = albumNameInput.value.trim();
  if (!name) return;

  let coverBuffer = null;
  if (albumCoverInput.files[0]) {
    coverBuffer = await albumCoverInput.files[0].arrayBuffer();
  }

  await openDB();
  await addAlbum(name, coverBuffer);

  const albums = await getAllAlbums();
  renderAlbums(albums);

  albumPopup.style.display = 'none';
});
