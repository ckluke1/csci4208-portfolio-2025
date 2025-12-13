const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// Store active users and whiteboards
const users = new Map();
const whiteboards = new Map();
let userIdCounter = 0;

// Whiteboard storage with file persistence
const STORAGE_FILE = path.join(__dirname, 'saved-whiteboards.json');

// Load saved whiteboards from file
function loadSavedWhiteboards() {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
      return new Map(Object.entries(data));
    }
  } catch (error) {
    console.error('Error loading saved whiteboards:', error);
  }
  // Return default whiteboards if file doesn't exist or error
  return new Map([
    ['default', JSON.stringify({image: ''})],
    ['sample', JSON.stringify({image: ''})]
  ]);
}

// Save whiteboards to file
function saveToDisk() {
  try {
    const data = Object.fromEntries(savedWhiteboards);
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving whiteboards to disk:', error);
  }
}

const savedWhiteboards = loadSavedWhiteboards();

// Board state storage - tracks drawings for each board
const boardStates = new Map();
boardStates.set('default', { canvas: null, drawings: [], name: 'Board 1', number: 1, locked: false });
let nextBoardNumber = 2;

class User {
  constructor(id, ws) {
    this.id = id;
    this.ws = ws;
    this.name = this.generateRandomName();
    this.color = this.generateRandomColor();
  }

  generateRandomName() {
    const adjectives = ['Happy', 'Clever', 'Swift', 'Bright', 'Bold', 'Quick', 'Smart', 'Nimble', 'Lively', 'Eager'];
    const nouns = ['Panda', 'Tiger', 'Eagle', 'Fox', 'Hawk', 'Wolf', 'Bear', 'Lion', 'Otter', 'Whale'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adj}${noun}`;
  }

  generateRandomColor() {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  const userId = userIdCounter++;
  const user = new User(userId, ws);
  users.set(userId, user);
  let userJoinedBroadcasted = false;

  console.log(`User ${user.name} (${userId}) connected. Total users: ${users.size}`);

  // Send user ID and current users to the new user
  ws.send(JSON.stringify({
    type: 'user-id',
    userId: userId,
    userName: user.name,
    userColor: user.color
  }));

  // Send current users list to the new user
  const usersList = Array.from(users.values()).map(u => ({
    id: u.id,
    name: u.name,
    color: u.color
  }));
  ws.send(JSON.stringify({
    type: 'users-list',
    users: usersList
  }));

  // Send current boards list to the new user
  const boardsList = Array.from(boardStates.entries()).map(([id, state]) => ({
    id: id,
    name: state.name,
    number: state.number,
    locked: state.locked || false
  }));
  ws.send(JSON.stringify({
    type: 'boards-list',
    boards: boardsList
  }));

  // Function to broadcast user-joined (only once)
  const broadcastUserJoined = () => {
    if (!userJoinedBroadcasted) {
      userJoinedBroadcasted = true;
      broadcastToAll({
        type: 'user-joined',
        user: {
          id: user.id,
          name: user.name,
          color: user.color
        }
      });
    }
  };

  // Broadcast user-joined after a short delay to allow client to send username
  const joinTimeout = setTimeout(broadcastUserJoined, 100);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'draw':
          // Store drawing action in board state
          const boardId = message.boardId || 'default';
          if (!boardStates.has(boardId)) {
            boardStates.set(boardId, { canvas: null, drawings: [] });
          }
          const boardState = boardStates.get(boardId);
          boardState.drawings.push(message.data);
          
          broadcastToAll({
            type: 'draw',
            userId: userId,
            boardId: boardId,
            data: message.data
          });
          break;

        case 'board-created':
          // Initialize new board state
          const newBoardNumber = nextBoardNumber++;
          boardStates.set(message.boardId, { 
            canvas: null, 
            drawings: [], 
            name: message.boardName || `Board ${newBoardNumber}`,
            number: newBoardNumber,
            locked: false
          });
          
          broadcastToAll({
            type: 'board-created',
            userId: userId,
            userName: user.name,
            boardId: message.boardId,
            boardNumber: newBoardNumber,
            boardName: message.boardName || `Board ${newBoardNumber}`,
            locked: false
          });
          break;

        case 'request-board-state':
          // Send current board state to requesting client
          const requestedBoardId = message.boardId || 'default';
          const requestedBoard = boardStates.get(requestedBoardId);
          if (requestedBoard) {
            console.log(`Sending board-state for ${requestedBoardId}: canvas=${requestedBoard.canvas ? requestedBoard.canvas.length : 'null'}, drawings=${requestedBoard.drawings.length}`);
            ws.send(JSON.stringify({
              type: 'board-state',
              boardId: requestedBoardId,
              drawings: requestedBoard.drawings,
              canvas: requestedBoard.canvas
            }));
          }
          break;

        case 'board-closed':
          const boardToClose = boardStates.get(message.boardId);
          // Don't allow closing locked boards
          if (boardToClose && boardToClose.locked) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Cannot close a locked board'
            }));
            break;
          }
          
          // Delete board state
          boardStates.delete(message.boardId);
          
          broadcastToAll({
            type: 'board-closed',
            userId: userId,
            userName: user.name,
            boardId: message.boardId
          });
          break;

        case 'board-rename':
          const boardToRename = boardStates.get(message.boardId);
          if (boardToRename) {
            boardToRename.name = message.newName;
            broadcastToAll({
              type: 'board-renamed',
              boardId: message.boardId,
              newName: message.newName,
              userId: userId,
              userName: user.name
            });
          }
          break;

        case 'board-lock-toggle':
          const boardToToggle = boardStates.get(message.boardId);
          if (boardToToggle) {
            boardToToggle.locked = !boardToToggle.locked;
            broadcastToAll({
              type: 'board-lock-toggled',
              boardId: message.boardId,
              locked: boardToToggle.locked,
              userId: userId,
              userName: user.name
            });
          }
          break;

        case 'clear':
          // Clear board state
          const clearBoardId = message.boardId || 'default';
          if (boardStates.has(clearBoardId)) {
            boardStates.set(clearBoardId, { canvas: null, drawings: [] });
          }
          
          broadcastToAll({
            type: 'clear',
            boardId: clearBoardId
          });
          break;

        case 'user-name':
          user.name = message.name || user.name;
          // Broadcast user-joined on first username set
          clearTimeout(joinTimeout);
          broadcastUserJoined();
          // Broadcast the name change to all clients
          broadcastToAll({
            type: 'user-renamed',
            userId: userId,
            newName: user.name
          });
          break;

        case 'user-color':
          user.color = message.color || user.color;
          broadcastToAll({
            type: 'user-color-changed',
            userId: userId,
            newColor: user.color
          });
          break;

        case 'cursor-move':
          broadcastToAll({
            type: 'cursor-move',
            userId: userId,
            x: message.x,
            y: message.y,
            name: message.name,
            color: message.color
          });
          break;



        case 'save-whiteboard':
          savedWhiteboards.set(message.name, message.data);
          saveToDisk();
          ws.send(JSON.stringify({
            type: 'save-success',
            message: `Whiteboard saved as "${message.name}"`
          }));
          broadcastToAll({
            type: 'save-notification',
            userId: userId,
            userName: user.name,
            whiteboardName: message.name
          });
          break;

        case 'load-whiteboard':
          const data = savedWhiteboards.get(message.name);
          if (data) {
            const parsedData = JSON.parse(data);
            const loadBoardId = message.boardId || 'board-' + Date.now();
            const loadBoardName = message.boardName || message.name;
            
            // Create a new board with the loaded whiteboard content
            const newBoardNumber = nextBoardNumber++;
            boardStates.set(loadBoardId, { 
              canvas: parsedData.image, 
              drawings: [],
              name: loadBoardName,
              number: newBoardNumber,
              locked: false
            });
            
            console.log(`Created new board ${loadBoardId} (${loadBoardName}) with loaded whiteboard "${message.name}". Canvas length: ${parsedData.image.length}`);
            
            // Broadcast the new board creation with loaded content to all clients
            broadcastToAll({
              type: 'board-loaded',
              boardId: loadBoardId,
              boardName: loadBoardName,
              boardNumber: newBoardNumber,
              data: parsedData,
              userId: userId,
              userName: user.name
            });
          } else {
            ws.send(JSON.stringify({
              type: 'load-error',
              message: `Whiteboard "${message.name}" not found`
            }));
          }
          break;

        case 'list-whiteboards':
          const list = Array.from(savedWhiteboards.keys());
          ws.send(JSON.stringify({
            type: 'whiteboards-list',
            whiteboards: list
          }));
          break;

        case 'delete-whiteboard':
          if (savedWhiteboards.has(message.name)) {
            savedWhiteboards.delete(message.name);
            saveToDisk();
            ws.send(JSON.stringify({
              type: 'delete-success',
              message: `Whiteboard "${message.name}" deleted successfully`
            }));
            // Broadcast updated list to all clients
            const updatedList = Array.from(savedWhiteboards.keys());
            wss.clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'whiteboards-list',
                  whiteboards: updatedList
                }));
              }
            });
          } else {
            ws.send(JSON.stringify({
              type: 'delete-error',
              message: `Whiteboard "${message.name}" not found`
            }));
          }
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    users.delete(userId);
    console.log(`User ${user.name} (${userId}) disconnected. Total users: ${users.size}`);

    broadcastToAll({
      type: 'user-left',
      userId: userId,
      userName: user.name
    });
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error for user ${userId}:`, error);
  });
});

function broadcastToAll(message) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// REST API endpoints
app.get('/api/whiteboard-list', (req, res) => {
  const list = Array.from(savedWhiteboards.keys());
  res.json({ whiteboards: list });
});

app.get('/api/whiteboard/:name', (req, res) => {
  const data = savedWhiteboards.get(req.params.name);
  if (data) {
    res.json(JSON.parse(data));
  } else {
    res.status(404).json({ error: 'Whiteboard not found' });
  }
});

app.post('/api/whiteboard/:name', express.json(), (req, res) => {
  savedWhiteboards.set(req.params.name, JSON.stringify(req.body));
  res.json({ success: true, message: 'Whiteboard saved' });
});

app.delete('/api/whiteboard/:name', (req, res) => {
  if (savedWhiteboards.delete(req.params.name)) {
    res.json({ success: true, message: 'Whiteboard deleted' });
  } else {
    res.status(404).json({ error: 'Whiteboard not found' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('WebSocket server ready for connections');
});
