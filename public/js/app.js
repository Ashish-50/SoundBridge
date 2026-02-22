import { createUI } from './ui.js';
import { createSyncClient } from './sync.js';

const ui = createUI();
let receivedSource = false;

const sync = createSyncClient({
  roomId: ui.roomId,
  onStatus: ui.setStatus,
  onState: ui.applyRemoteState,
  onSource: (src) => {
    receivedSource = true;
    ui.applyRemoteSource(src);
  },
  onPresence: ui.updatePresence,
  onError: ui.setError
});

ui.bind({
  onState: sync.sendState,
  onSource: sync.sendSource,
  onJoinRoom: (nextRoom) => {
    window.location.href = `/room/${encodeURIComponent(nextRoom)}`;
  }
});

setTimeout(() => {
  if (receivedSource) return;
  const trackInput = document.getElementById('trackUrl');
  if (trackInput && trackInput.value.trim()) {
    sync.sendSource(trackInput.value.trim());
  }
}, 1200);
