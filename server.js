const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('SINGALE Server Online');
});

const wss = new WebSocket.Server({ server });
const clients = new Map();

wss.on('connection', (ws) => {
  const id = Math.random().toString(36).slice(2, 8);
  clients.set(ws, { id, connectedAt: Date.now() });
  console.log(`[+] Browser ${id} connected. Total: ${clients.size}`);

  // Send current state
  ws.send(JSON.stringify({ type: 'WELCOME', id, totalClients: clients.size }));

  // Broadcast updated count to all
  broadcast({ type: 'CLIENT_COUNT', count: clients.size });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);

      if (msg.type === 'SLOT_SUBMITTED') {
        console.log(`[SUBMIT] Browser ${id} clicked submit. Slot: ${msg.slot || '?'}`);

        // Tell all OTHER browsers to click submit (NOT the sender)
        broadcast({
          type: 'CLICK_SUBMIT_NOW',
          submittedBy: id,
          slot: msg.slot || '',
          ts: Date.now()
        }, ws); // EXCLUDE sender — sender is the NEW browser, shouldn't click
      }

      if (msg.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', ts: Date.now() }));
      }

    } catch (e) {
      console.error('Bad message:', e.message);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[-] Browser ${id} disconnected. Total: ${clients.size}`);
    broadcast({ type: 'CLIENT_COUNT', count: clients.size });
  });

  ws.on('error', () => clients.delete(ws));
});

function broadcast(msg, exclude = null) {
  const data = JSON.stringify(msg);
  for (const [ws] of clients) {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

server.listen(PORT, () => {
  console.log(`SINGALE Server running on port ${PORT}`);
});
