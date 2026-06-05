export function createBridgeClient({ WebSocketCtor = WebSocket, port = 43117, onEvent = () => {}, executeTool } = {}) {
  let socket;

  return {
    connect() {
      socket = new WebSocketCtor(`ws://127.0.0.1:${port}`);
      socket.addEventListener('open', () => onEvent({ type: 'bridge_connected' }));
      socket.addEventListener('close', () => onEvent({ type: 'bridge_disconnected' }));
      socket.addEventListener('message', async (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message?.type === 'browser_tool_request' && executeTool) {
            try {
              const data = await executeTool(message.tool, message.params ?? {});
              socket.send(JSON.stringify({ id: message.id, type: 'browser_tool_response', success: true, data }));
            } catch (error) {
              socket.send(JSON.stringify({ id: message.id, type: 'browser_tool_response', success: false, error: error instanceof Error ? error.message : String(error) }));
            }
            return;
          }
          onEvent(message);
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
