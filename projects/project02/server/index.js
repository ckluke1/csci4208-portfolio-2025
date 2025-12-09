const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { loadBoards, saveBoards } = require('./storage');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname + '/../public'));

const PORT = process.env.PORT || 4000;

// in-memory SSE clients per board
const sseClients = new Map();

function sendSse(boardId, event, payload) {
  const clients = sseClients.get(boardId) || [];
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  clients.forEach(res => res.write(msg));
}

// helper to persist and return board list
async function getData() {
  const data = await loadBoards();
  if (!data.boards) data.boards = [];
  return data;
}

app.get('/api/boards', async (req, res) => {
  const data = await getData();
  const summary = data.boards.map(b => ({ id: b.id, name: b.name, createdAt: b.createdAt }));
  res.json(summary);
});

app.post('/api/boards', async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Missing board name' });
  const data = await getData();
  const board = { id: uuidv4(), name, createdAt: Date.now(), elements: [] };
  data.boards.push(board);
  await saveBoards(data);
  res.status(201).json(board);
});

app.get('/api/boards/:id', async (req, res) => {
  const id = req.params.id;
  const data = await getData();
  const board = data.boards.find(b => b.id === id);
  if (!board) return res.status(404).json({ error: 'Board not found' });
  res.json(board);
});

app.get('/api/boards/:id/elements', async (req, res) => {
  const id = req.params.id;
  const data = await getData();
  const board = data.boards.find(b => b.id === id);
  if (!board) return res.status(404).json({ error: 'Board not found' });
  res.json(board.elements || []);
});

app.post('/api/boards/:id/elements', async (req, res) => {
  const id = req.params.id;
  const sessionId = req.get('x-session-id') || req.body.sessionId || 'unknown';
  const payload = req.body || {};
  if (!payload.type) return res.status(400).json({ error: 'Missing element type' });

  const data = await getData();
  const board = data.boards.find(b => b.id === id);
  if (!board) return res.status(404).json({ error: 'Board not found' });

  const element = Object.assign({}, payload, { id: uuidv4(), sessionId, createdAt: Date.now() });
  board.elements = board.elements || [];
  board.elements.push(element);
  await saveBoards(data);

  sendSse(id, 'element:create', { element, boardId: id });
  res.status(201).json(element);
});

app.put('/api/boards/:id/elements/:elId', async (req, res) => {
  const id = req.params.id;
  const elId = req.params.elId;
  const sessionId = req.get('x-session-id') || req.body.sessionId || 'unknown';
  const updates = req.body || {};

  const data = await getData();
  const board = data.boards.find(b => b.id === id);
  if (!board) return res.status(404).json({ error: 'Board not found' });
  const idx = (board.elements || []).findIndex(e => e.id === elId);
  if (idx === -1) return res.status(404).json({ error: 'Element not found' });

  // simple merge update; server is source-of-truth
  const existing = board.elements[idx];
  const updated = Object.assign({}, existing, updates, { updatedAt: Date.now(), sessionId });
  board.elements[idx] = updated;
  await saveBoards(data);

  sendSse(id, 'element:update', { element: updated, boardId: id });
  res.json(updated);
});

app.delete('/api/boards/:id/elements/:elId', async (req, res) => {
  const id = req.params.id;
  const elId = req.params.elId;
  const sessionId = req.get('x-session-id') || 'unknown';

  const data = await getData();
  const board = data.boards.find(b => b.id === id);
  if (!board) return res.status(404).json({ error: 'Board not found' });
  const idx = (board.elements || []).findIndex(e => e.id === elId);
  if (idx === -1) return res.status(404).json({ error: 'Element not found' });

  const [removed] = board.elements.splice(idx, 1);
  await saveBoards(data);

  sendSse(id, 'element:delete', { element: removed, boardId: id, sessionId });
  res.json({ ok: true });
});

// SSE endpoint
app.get('/api/events/:boardId', async (req, res) => {
  const boardId = req.params.boardId;
  req.socket.setTimeout(0);
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders();

  const init = `event: connected\ndata: ${JSON.stringify({ boardId })}\n\n`;
  res.write(init);

  const clients = sseClients.get(boardId) || [];
  clients.push(res);
  sseClients.set(boardId, clients);

  req.on('close', () => {
    const list = sseClients.get(boardId) || [];
    const idx = list.indexOf(res);
    if (idx !== -1) list.splice(idx, 1);
    sseClients.set(boardId, list);
  });
});

app.listen(PORT, () => console.log(`Whiteboard server listening on http://localhost:${PORT}`));
