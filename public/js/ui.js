function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '00:00';
  const clamped = Math.max(0, seconds);
  const mins = Math.floor(clamped / 60);
  const secs = Math.floor(clamped % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getRoomId() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts[0] === 'room' && parts[1]) {
    return parts[1];
  }
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('room');
  if (fromQuery) return fromQuery;
  const id = Math.random().toString(36).slice(2, 8);
  window.history.replaceState(null, '', `/room/${id}`);
  return id;
}

function parseAgent(agent) {
  if (!agent) return 'Unknown';
  const ua = agent.toLowerCase();
  const browser = ua.includes('edg')
    ? 'Edge'
    : ua.includes('chrome')
    ? 'Chrome'
    : ua.includes('firefox')
    ? 'Firefox'
    : ua.includes('safari')
    ? 'Safari'
    : 'Browser';

  const os = ua.includes('mac')
    ? 'macOS'
    : ua.includes('win')
    ? 'Windows'
    : ua.includes('android')
    ? 'Android'
    : ua.includes('iphone') || ua.includes('ipad')
    ? 'iOS'
    : ua.includes('linux')
    ? 'Linux'
    : 'Device';

  return `${browser} · ${os}`;
}

export function createUI() {
  const audioEl = document.getElementById('audio');
  const enableBtn = document.getElementById('enableAudio');
  const playBtn = document.getElementById('playToggle');
  const volumeRange = document.getElementById('volumeRange');
  const volumeValue = document.getElementById('volumeValue');
  const seekRange = document.getElementById('seekRange');
  const currentTimeEl = document.getElementById('currentTime');
  const durationEl = document.getElementById('duration');
  const errorBanner = document.getElementById('errorBanner');

  const connectionPill = document.getElementById('connectionPill');
  const roomPill = document.getElementById('roomPill');
  const offsetPill = document.getElementById('offsetPill');

  const roomLinkEl = document.getElementById('roomLink');
  const copyBtn = document.getElementById('copyLink');
  const qrImage = document.getElementById('qrImage');
  const roomInput = document.getElementById('roomInput');
  const joinBtn = document.getElementById('joinRoom');
  const trackUrlInput = document.getElementById('trackUrl');
  const setTrackBtn = document.getElementById('setTrack');

  const listenersList = document.getElementById('listenersList');
  const listenerCount = document.getElementById('listenerCount');

  const roomId = getRoomId();
  roomPill.textContent = `Room: ${roomId}`;
  roomLinkEl.value = window.location.href;
  roomInput.value = roomId;
  if (qrImage) {
    qrImage.src = `/qr?room=${encodeURIComponent(roomId)}`;
  }
  if (trackUrlInput && trackUrlInput.value.trim()) {
    audioEl.src = trackUrlInput.value.trim();
  }

  let suppressEvents = false;
  let isScrubbing = false;
  let lastSent = 0;
  let callbacks = {
    onState: null,
    onSource: null,
    onJoinRoom: null
  };

  function setStatus(status) {
    const online = status.toLowerCase().includes('on') || status.toLowerCase().includes('connect');
    connectionPill.textContent = online ? 'Connected' : 'Offline';
    connectionPill.classList.toggle('online', online);
  }

  function setOffset(ms) {
    const rounded = Math.round(ms);
    const sign = rounded > 0 ? '+' : '';
    offsetPill.textContent = `Offset: ${sign}${rounded} ms`;
  }

  function setError(message) {
    if (!message) {
      errorBanner.classList.add('hidden');
      errorBanner.textContent = '';
      return;
    }
    errorBanner.textContent = message;
    errorBanner.classList.remove('hidden');
  }

  function updatePlayButton() {
    playBtn.textContent = audioEl.paused ? 'Play' : 'Pause';
  }

  function emitState(force = false) {
    if (!callbacks.onState) return;
    const now = performance.now();
    if (!force && now - lastSent < 400) return;
    lastSent = now;
    callbacks.onState({
      playing: !audioEl.paused,
      time: audioEl.currentTime
    });
  }

  function applyRemoteState({ playing, time, serverTime }) {
    const age = serverTime ? (Date.now() - serverTime) / 1000 : 0;
    const target = time + (playing ? age : 0);
    if (!Number.isFinite(target)) return;

    const drift = audioEl.currentTime - target;
    setOffset(drift * 1000);

    suppressEvents = true;

    if (Math.abs(drift) > 0.35) {
      try {
        audioEl.currentTime = target;
      } catch (err) {
        // Ignore if media not ready
      }
    }

    if (playing) {
      audioEl.play().catch(() => {
        // Autoplay might be blocked
      });
    } else {
      audioEl.pause();
    }

    setTimeout(() => {
      suppressEvents = false;
    }, 120);
  }

  function applyRemoteSource(src) {
    if (!src || audioEl.src === src) return;
    suppressEvents = true;
    audioEl.src = src;
    audioEl.load();
    trackUrlInput.value = src;
    setTimeout(() => {
      suppressEvents = false;
    }, 200);
  }

  function updatePresence({ listeners, you }) {
    listenersList.innerHTML = '';
    listenerCount.textContent = String(listeners.length);
    listeners.forEach((listener) => {
      const item = document.createElement('li');
      item.className = 'listener';
      const left = document.createElement('span');
      left.innerHTML = `<strong>${listener.id}</strong> ${parseAgent(listener.userAgent)}`;
      const right = document.createElement('span');
      if (listener.id === you) {
        right.textContent = '(you)';
        right.className = 'you';
      } else {
        right.textContent = listener.ip ? listener.ip : '';
      }
      item.append(left, right);
      listenersList.appendChild(item);
    });
  }

  enableBtn.addEventListener('click', async () => {
    if (!audioEl.src) {
      setError('Load a track URL before enabling audio.');
      return;
    }
    try {
      await audioEl.play();
      audioEl.pause();
      enableBtn.textContent = 'Audio Enabled';
      setError('');
    } catch (err) {
      setError('Audio enable failed. Click play to retry.');
    }
  });

  playBtn.addEventListener('click', () => {
    if (!audioEl.src) {
      setError('Add a track URL first.');
      return;
    }
    if (audioEl.paused) {
      audioEl.play().catch(() => {
        setError('Autoplay blocked. Click Enable Audio first.');
      });
    } else {
      audioEl.pause();
    }
  });

  volumeRange.addEventListener('input', () => {
    const value = Number(volumeRange.value) / 100;
    audioEl.volume = value;
    volumeValue.textContent = `${Math.round(value * 100)}%`;
  });

  seekRange.addEventListener('input', () => {
    if (!audioEl.duration) return;
    isScrubbing = true;
    const percent = Number(seekRange.value) / 1000;
    const preview = audioEl.duration * percent;
    currentTimeEl.textContent = formatTime(preview);
  });

  seekRange.addEventListener('change', () => {
    if (!audioEl.duration) return;
    const percent = Number(seekRange.value) / 1000;
    audioEl.currentTime = audioEl.duration * percent;
    isScrubbing = false;
    emitState(true);
  });

  audioEl.addEventListener('loadedmetadata', () => {
    durationEl.textContent = formatTime(audioEl.duration);
  });

  audioEl.addEventListener('timeupdate', () => {
    if (isScrubbing) return;
    if (!audioEl.duration) return;
    const progress = audioEl.currentTime / audioEl.duration;
    seekRange.value = String(Math.round(progress * 1000));
    currentTimeEl.textContent = formatTime(audioEl.currentTime);
  });

  audioEl.addEventListener('play', () => {
    if (suppressEvents) return;
    updatePlayButton();
    emitState(true);
  });

  audioEl.addEventListener('pause', () => {
    if (suppressEvents) return;
    updatePlayButton();
    emitState(true);
  });

  audioEl.addEventListener('seeked', () => {
    if (suppressEvents) return;
    emitState(true);
  });

  setInterval(() => {
    if (suppressEvents) return;
    if (!audioEl.paused) {
      emitState(false);
    }
  }, 2000);

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(roomLinkEl.value);
      copyBtn.textContent = 'Copied';
      setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
    } catch (err) {
      copyBtn.textContent = 'Copy failed';
      setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
    }
  });

  joinBtn.addEventListener('click', () => {
    if (!callbacks.onJoinRoom) return;
    const nextRoom = roomInput.value.trim();
    if (!nextRoom || nextRoom === roomId) return;
    callbacks.onJoinRoom(nextRoom);
  });

  setTrackBtn.addEventListener('click', () => {
    const url = trackUrlInput.value.trim();
    if (!url) {
      setError('Enter a public track URL to share.');
      return;
    }
    audioEl.src = url;
    audioEl.load();
    setError('');
    if (callbacks.onSource) {
      callbacks.onSource(url);
    }
    emitState(true);
  });

  function bind(nextCallbacks) {
    callbacks = { ...callbacks, ...nextCallbacks };
  }

  updatePlayButton();

  return {
    roomId,
    bind,
    setStatus,
    setError,
    setOffset,
    applyRemoteState,
    applyRemoteSource,
    updatePresence
  };
}
