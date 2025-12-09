const BIN_ID = 'YOUR_BIN_ID_HERE';
const MASTER_KEY = 'YOUR_JSONBIN_MASTER_KEY_HERE'; // keep secret in real project
const BASE_URL = 'https://api.jsonbin.io/v3/b';

function getHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (MASTER_KEY && MASTER_KEY !== 'YOUR_JSONBIN_MASTER_KEY_HERE') {
    headers['X-Master-Key'] = MASTER_KEY;
  }
  return headers;
}

export async function fetchHighScores() {
  if (BIN_ID === 'YOUR_BIN_ID_HERE') {
    // Placeholder
    return [];
  }
  const url = `${BASE_URL}/${BIN_ID}/latest`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: getHeaders()
  });
  if (!resp.ok) {
    throw new Error('Failed to fetch high scores');
  }
  const data = await resp.json();
  return data.record.highScores ?? [];
}

export async function pushHighScore(highScore) {
  if (BIN_ID === 'YOUR_BIN_ID_HERE') {
    console.info('High score (dev, not sent to JSONBin):', highScore);
    return;
  }
  // keep top 20
  const current = await fetchHighScores().catch(() => []);
  const merged = [...current, highScore]
    .sort((a, b) => a.timeSeconds - b.timeSeconds)
    .slice(0, 20);
  const url = `${BASE_URL}/${BIN_ID}`;
  const resp = await fetch(url, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ highScores: merged })
  });
  if (!resp.ok) {
    throw new Error('Failed to update high scores');
  }
}
