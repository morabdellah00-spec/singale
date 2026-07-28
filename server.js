const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('SINGALE Server Online');
});

const wss = new WebSocket.Server({ server });
const clients = new Map(); // ws -> { id, connectedAt }

let lastSubmitEvent = null;

wss.on('connection', (ws) => {
  const id = Math.random().toString(36).slice(2, 8);
  clients.set(ws, { id, connectedAt: Date.now() });
  console.log(`[+] Browser ${id} connected. Total: ${clients.size}`);

  ws.send(JSON.stringify({ type: 'WELCOME', id, totalClients: clients.size }));
  broadcast({ type: 'CLIENT_COUNT', count: clients.size });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);

      // *** NEW: A new browser detected the slot form open ***
      // Broadcast DO_SUBMIT to ALL OTHER browsers so old ones can click submit
      // The sender (new browser) does NOT receive this — it never submits itself
      if (msg.type === 'SLOT_DETECTED') {
        const now = Date.now();

        // Prevent duplicate broadcasts within 2 seconds
        if (lastSubmitEvent && now - lastSubmitEvent.ts < 2000) {
          ws.send(JSON.stringify({ type: 'DUPLICATE', msg: 'Slot already broadcast within 2s' }));
          return;
        }

        lastSubmitEvent = { browserId: msg.browserId || id, ts: now, slot: msg.slot || '' };
        console.log(`[SLOT_DETECTED] Browser ${id} found open form. Broadcasting DO_SUBMIT to all others. Slot: ${msg.slot || '?'}`);

        // Tell all OTHER browsers to submit — exclude the sender
        broadcast({
          type: 'DO_SUBMIT',
          detectedBy: id,
          slot: msg.slot || ''
        }, ws); // <-- ws excluded = new browser never gets this
      }

      // A browser finished submitting — lock everyone else
      if (msg.type === 'SLOT_SUBMITTED') {
        const now = Date.now();

        if (lastSubmitEvent && now - lastSubmitEvent.ts < 2000) {
          ws.send(JSON.stringify({ type: 'DUPLICATE', msg: 'Already submitted within 2s' }));
          return;
        }

        lastSubmitEvent = { browserId: msg.browserId || id, ts: now, slot: msg.slot || '' };
        console.log(`[SUBMIT] Browser ${id} submitted. Locking all others. Slot: ${msg.slot || '?'}`);

        broadcast({
          type: 'SUBMIT_LOCK',
          submittedBy: id,
          slot: msg.slot || '',
          ts: now
        }, ws);
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
