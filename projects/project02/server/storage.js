const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const BOARDS_FILE = path.join(DATA_DIR, 'boards.json');

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (err) {
    // ignore
  }
}

async function loadBoards() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(BOARDS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return { boards: [] };
    throw err;
  }
}

async function saveBoards(data) {
  await ensureDataDir();
  await fs.writeFile(BOARDS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = { loadBoards, saveBoards, BOARDS_FILE };
