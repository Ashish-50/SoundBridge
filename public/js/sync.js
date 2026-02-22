export function createSyncClient({ roomId, onStatus, onState, onSource, onPresence, onError }) {
  let ws;

  function connect() {
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}?room=${encodeURIComponent(roomId)}`;
    ws = new WebSocket(wsUrl);

    ws.addEventListener('open', () => {
      if (onStatus) onStatus('Online');
    });

    ws.addEventListener('close', () => {
      if (onStatus) onStatus('Offline');
    });

    ws.addEventListener('error', () => {
      if (onError) onError('Connection error: socket failed');
    });

    ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (err) {
        return;
      }

      if (msg.type === 'state' && onState) {
        onState(msg);
      }

      if (msg.type === 'src' && onSource) {
        onSource(msg.src);
      }

      if (msg.type === 'presence' && onPresence) {
        onPresence({ listeners: msg.listeners || [], you: msg.you });
      }
    });
  }

  function send(payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
  }

  function sendState(state) {
    send({
      type: 'state',
      roomId,
      playing: Boolean(state.playing),
      time: Number(state.time)
    });
  }

  function sendSource(src) {
    send({
      type: 'src',
      roomId,
      src
    });
  }

  connect();

  return {
    sendState,
    sendSource
  };
}
