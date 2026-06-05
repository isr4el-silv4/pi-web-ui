export function createBridgeClient({ WebSocketCtor = WebSocket, port = 43117, onEvent = () => {} } = {}) {
  let socket;

  return {
    connect() {
      socket = new WebSocketCtor(`ws://127.0.0.1:${port}`);
      socket.addEventListener('open', () => onEvent({ type: 'bridge_connected' }));
      socket.addEventListener('close', () => onEvent({ type: 'bridge_disconnected' }));
      socket.addEventListener('message', (event) => {
        try {
          onEvent(JSON.parse(event.data));
        } catch {
          onEvent({ type: 'error', error: 'Invalid bridge message' });
        }
      });
      return socket;
    },
    sendCommand(command) {
      if (!socket || socket.readyState !== 1) throw new Error('Bridge websocket is not connected');
      socket.send(JSON.stringify(command));
    },
    disconnect() {
      socket?.close();
    },
  };
}
