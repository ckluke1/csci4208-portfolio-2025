// Whiteboard application main logic
class Whiteboard {
  constructor() {
    this.canvas = document.getElementById('canvas');
    this.ctx = this.canvas.getContext('2d');
    // Separate overlay canvas for cursors (never touches drawing)
    this.cursorCanvas = null;
    this.cursorCtx = null;
    this.ws = null;
    this.userId = null;
    this.userName = localStorage.getItem('whiteboard-username') || 'User';
    this.userColor = localStorage.getItem('whiteboard-usercolor') || '#000000';
    this.connected = false;

    // Board management
    this.currentBoard = 'default';
    this.boards = new Map(); // boardId -> {canvas: dataURL, history: [], historyStep: -1}
    this.boards.set('default', { canvas: null, history: [], historyStep: -1 });

    // Drawing state
    this.currentTool = 'pen';
    this.currentColor = '#000000';
    this.brushSize = 3;
    this.fillShape = false;
    this.isDrawing = false;
    this.startX = 0;
    this.startY = 0;

    // Text tool state
    this.isEditingText = false;
    this.textInput = null;
    this.fontSize = 16;
    this.textObjects = []; // Store text as editable objects
    this.selectedTextId = null;

    // Drawing history for undo/redo
    this.drawingHistory = [];
    this.historyStep = -1;

    // Remote drawing data
    this.remoteDrawings = {};

    // Remote cursor tracking
    this.remoteCursors = new Map(); // userId -> {x, y, name, color}
    this.lastCursorSendTime = 0;
    this.cursorSendInterval = 16; // ~60fps cursor updates for smoother motion

    this.init();
  }

  init() {
    this.setupCanvas();
    this.setupEventListeners();
    this.connectWebSocket();
    this.setupKeyboardShortcuts();
    this.startCursorRenderLoop();
  }

  startCursorRenderLoop() {
    const renderCursors = () => {
      if (!this.cursorCtx) {
        requestAnimationFrame(renderCursors);
        return;
      }
      // Clear overlay and draw only current cursor positions
      this.cursorCtx.clearRect(0, 0, this.cursorCanvas.width, this.cursorCanvas.height);
      this.drawRemoteCursors();
      requestAnimationFrame(renderCursors);
    };
    renderCursors();
  }

  setupCanvas() {
    this.resizeCanvas();
    // Build overlay for cursors
    if (!this.cursorCanvas) {
      const wrapper = document.querySelector('.canvas-wrapper');
      this.cursorCanvas = document.createElement('canvas');
      this.cursorCanvas.style.position = 'absolute';
      this.cursorCanvas.style.top = '0';
      this.cursorCanvas.style.left = '0';
      this.cursorCanvas.style.pointerEvents = 'none';
      wrapper.appendChild(this.cursorCanvas);
      this.cursorCtx = this.cursorCanvas.getContext('2d');
    }
    // Sync overlay size with main canvas
    this.cursorCanvas.width = this.canvas.width;
    this.cursorCanvas.height = this.canvas.height;
    window.addEventListener('resize', () => this.resizeCanvas());
    
    // Save initial blank state to history
    this.saveToHistory();
  }

  resizeCanvas() {
    const wrapper = document.querySelector('.canvas-wrapper');
    this.canvas.width = wrapper.clientWidth;
    this.canvas.height = wrapper.clientHeight;
    if (this.cursorCanvas) {
      this.cursorCanvas.width = wrapper.clientWidth;
      this.cursorCanvas.height = wrapper.clientHeight;
    }
    // Redraw after resize
    this.redrawCanvas();
  }

  setupEventListeners() {
    // Tool selection (icon toolbar)
    document.querySelectorAll('.tool-icon[data-tool]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tool-icon[data-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentTool = btn.dataset.tool;
        this.updateCanvasCursor();
      });
    });

    // Options panel toggle
    const moreBtn = document.getElementById('moreOptionsBtn');
    const optionsPanel = document.getElementById('optionsPanel');
    const closePanel = document.getElementById('closePanel');
    
    if (moreBtn && optionsPanel) {
      moreBtn.addEventListener('click', () => {
        optionsPanel.classList.toggle('open');
      });
    }
    
    if (closePanel && optionsPanel) {
      closePanel.addEventListener('click', () => {
        optionsPanel.classList.remove('open');
      });
    }

    // Color picker
    const colorPicker = document.getElementById('colorPicker');
    if (colorPicker) {
      const updateColor = (e) => {
        this.currentColor = e.target.value;
        document.documentElement.style.setProperty('--current-color', e.target.value);
      };
      colorPicker.addEventListener('input', updateColor);
      colorPicker.addEventListener('change', updateColor);
      // Initialize color
      document.documentElement.style.setProperty('--current-color', colorPicker.value);
    }

    // Brush size
    document.getElementById('brushSize').addEventListener('input', (e) => {
      this.brushSize = parseInt(e.target.value);
      document.getElementById('brushSizeValue').textContent = this.brushSize;
    });

    // Fill shape checkbox
    document.getElementById('fillShape').addEventListener('change', (e) => {
      this.fillShape = e.target.checked;
    });

    // Canvas events
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.canvas.addEventListener('mouseleave', (e) => this.onMouseUp(e));

    // Touch events for mobile
    this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e));
    this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e));
    this.canvas.addEventListener('touchend', (e) => this.onTouchEnd(e));

    // Buttons
    document.getElementById('clearBtn').addEventListener('click', () => this.clearBoard());
    document.getElementById('downloadBtn').addEventListener('click', () => this.downloadCanvas());
    document.getElementById('saveBtn').addEventListener('click', () => this.saveWhiteboard());
    document.getElementById('loadBtn').addEventListener('click', () => this.loadWhiteboard());
    document.getElementById('deleteBtn').addEventListener('click', () => this.deleteWhiteboard());

    // User name
    document.getElementById('userNameInput').addEventListener('change', (e) => {
      this.changeUserName(e.target.value);
    });

    // User color - make it clickable to change
    document.getElementById('userColor').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'color';
      input.value = this.userColor;
      input.addEventListener('change', (e) => {
        this.changeUserColor(e.target.value);
      });
      input.click();
    });

    // Help modal
    document.addEventListener('keydown', (e) => {
      // Don't trigger help modal if user is typing in an input field, textarea, or contenteditable
      const activeElement = document.activeElement;
      if (activeElement.tagName === 'INPUT' || 
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.isContentEditable) {
        return;
      }

      if (e.key === 'h' || e.key === 'H') {
        this.toggleHelpModal();
      }
      if (e.key === 'Escape') {
        this.toggleHelpModal(false);
      }
      
      // Brush size adjustment with [ and ]
      if (e.key === '[') {
        this.brushSize = Math.max(1, this.brushSize - 5);
        document.getElementById('brushSize').value = this.brushSize;
        document.getElementById('brushSizeValue').textContent = this.brushSize;
      }
      if (e.key === ']') {
        this.brushSize = Math.min(50, this.brushSize + 5);
        document.getElementById('brushSize').value = this.brushSize;
        document.getElementById('brushSizeValue').textContent = this.brushSize;
      }
    });

    // Help modal close button
    document.querySelector('.modal-close').addEventListener('click', () => {
      this.toggleHelpModal(false);
    });

    document.getElementById('helpModal').addEventListener('click', (e) => {
      if (e.target.id === 'helpModal') {
        this.toggleHelpModal(false);
      }
    });

    // Board tabs
    document.getElementById('boardTabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.board-tab');
      if (tab) {
        this.switchBoard(tab.dataset.board);
      }
    });

    document.getElementById('newBoardBtn').addEventListener('click', () => {
      this.createNewBoard();
    });

    // Close board on middle click
    document.getElementById('boardTabs').addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        const tab = e.target.closest('.board-tab');
        if (tab) {
          e.preventDefault();
          this.closeBoard(tab.dataset.board);
        }
      }
    });

    // Board tab hover preview
    let previewTimeout;
    document.getElementById('boardTabs').addEventListener('mouseover', (e) => {
      if (e.target.classList.contains('board-tab')) {
        const boardId = e.target.dataset.board;
        clearTimeout(previewTimeout);
        previewTimeout = setTimeout(() => {
          this.showBoardPreview(e.target, boardId);
        }, 500); // Show preview after 500ms hover
      }
    });

    document.getElementById('boardTabs').addEventListener('mouseout', (e) => {
      if (e.target.classList.contains('board-tab')) {
        clearTimeout(previewTimeout);
        this.hideBoardPreview();
      }
    });
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Don't trigger shortcuts if user is typing in an input field, textarea, or contenteditable
      const activeElement = document.activeElement;
      if (activeElement.tagName === 'INPUT' || 
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.isContentEditable) {
        return;
      }

      if (e.key.toLowerCase() === 'p') this.selectTool('pen');
      if (e.key.toLowerCase() === 'e') this.selectTool('eraser');
      if (e.key.toLowerCase() === 'l') this.selectTool('line');
      if (e.key.toLowerCase() === 'r') this.selectTool('rectangle');
      if (e.key.toLowerCase() === 'c') this.selectTool('circle');
      if (e.key.toLowerCase() === 't') this.selectTool('text');
    });
  }

  selectTool(tool) {
    document.querySelectorAll('.tool-btn').forEach(btn => {
      if (btn.dataset.tool === tool) {
        btn.classList.add('active');
        this.currentTool = tool;
        this.updateCanvasCursor();
      } else {
        btn.classList.remove('active');
      }
    });
  }

  updateCanvasCursor() {
    if (this.currentTool === 'eraser') {
      this.canvas.style.cursor = 'grab';
    } else if (this.currentTool === 'text') {
      this.canvas.style.cursor = 'text';
    } else {
      this.canvas.style.cursor = 'crosshair';
    }
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('Connected to WebSocket server');
      this.updateConnectionStatus(true);
      this.addNotification('Connected to server', 'success');
      // Send the stored username and color to the server immediately on connection
      // This ensures the server knows your name and color before broadcasting you to others
      const savedName = localStorage.getItem('whiteboard-username');
      if (savedName) {
        this.ws.send(JSON.stringify({
          type: 'user-name',
          name: savedName
        }));
      }
      const savedColor = localStorage.getItem('whiteboard-usercolor');
      if (savedColor) {
        this.ws.send(JSON.stringify({
          type: 'user-color',
          color: savedColor
        }));
      }
      // Load the list of saved whiteboards
      this.loadWhiteboardList();
      
      // Request current board state to restore any loaded whiteboards
      this.ws.send(JSON.stringify({
        type: 'request-board-state',
        boardId: this.currentBoard
      }));
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.updateConnectionStatus(false);
      this.addNotification('Connection error', 'warning');
    };

    this.ws.onclose = () => {
      console.log('Disconnected from WebSocket server');
      this.updateConnectionStatus(false);
      this.addNotification('Disconnected from server', 'warning');
      // Try to reconnect after 3 seconds
      setTimeout(() => this.connectWebSocket(), 3000);
    };
  }

  handleMessage(message) {
    switch (message.type) {
      case 'user-id':
        this.userId = message.userId;
        // Use saved color if available, otherwise use server's assigned color
        const savedColor = localStorage.getItem('whiteboard-usercolor');
        this.userColor = savedColor || message.userColor;
        document.getElementById('userColor').style.background = this.userColor;
        // Use the saved username from localStorage, or fall back to server's default
        const savedName = localStorage.getItem('whiteboard-username');
        document.getElementById('userNameInput').value = savedName || message.userName;
        break;

      case 'users-list':
        this.updateUsersList(message.users);
        break;

      case 'boards-list':
        // Recreate all board tabs from server
        message.boards.forEach(board => {
          if (board.id !== 'default') {
            this.addBoardTab(board.id, board.number, board.name, board.locked);
          } else {
            // Update default board name and lock status
            const defaultBoard = this.boards.get('default');
            if (defaultBoard) {
              defaultBoard.name = board.name;
              defaultBoard.locked = board.locked;
            }
            
            // Update default board tab UI
            const defaultTab = document.querySelector('[data-board="default"]');
            if (defaultTab) {
              const nameSpan = defaultTab.querySelector('.board-tab-name');
              if (nameSpan) nameSpan.textContent = board.name;
              
              const lockIcon = defaultTab.querySelector('.board-tab-lock');
              if (lockIcon) {
                lockIcon.innerHTML = board.locked ? '🔒' : '🔓';
                lockIcon.title = board.locked ? 'Locked' : 'Unlocked';
              }
              
              defaultTab.classList.toggle('locked', board.locked);
              
              const closeBtn = defaultTab.querySelector('.board-tab-close');
              if (closeBtn) {
                closeBtn.style.display = board.locked ? 'none' : 'inline-block';
              }
            }
          }
        });
        
        // Request state for all boards so previews work immediately
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          message.boards.forEach(board => {
            this.ws.send(JSON.stringify({
              type: 'request-board-state',
              boardId: board.id
            }));
          });
        }
        break;

      case 'user-joined':
        this.addNotification(`${message.user.name} joined`, 'info');
        this.updateUsersListItem(message.user, false);
        break;

      case 'user-left':
        this.addNotification(`${message.userName} left`, 'info');
        this.removeUserListItem(message.userId);
        // Remove their cursor from tracking
        this.remoteCursors.delete(message.userId);
        break;

      case 'user-renamed':
        // If it's another user's rename, update their list item
        if (message.userId !== this.userId) {
          const userItem = document.querySelector(`[data-user-id="${message.userId}"]`);
          if (userItem) {
            const nameElement = userItem.querySelector('.user-name');
            if (nameElement) {
              nameElement.textContent = message.newName;
            }
          }
        }
        this.addNotification(`User renamed to ${message.newName}`, 'info');
        break;

      case 'user-color-changed':
        // Update the user's color in the list
        const userItem = document.querySelector(`[data-user-id="${message.userId}"]`);
        if (userItem) {
          const dotElement = userItem.querySelector('.user-dot');
          if (dotElement) {
            dotElement.style.background = message.newColor;
          }
        }
        break;

      case 'cursor-move':
        // Update remote cursor position
        this.remoteCursors.set(message.userId, {
          x: message.x,
          y: message.y,
          name: message.name,
          color: message.color
        });
        break;

      case 'draw':
        // Only draw if message is for current board
        if (message.userId !== this.userId && message.boardId === this.currentBoard) {
          this.drawRemote(message.data);

          // Persist remote changes to history when a stroke ends or a shape/text completes
          const t = message.data?.type;
          const isStrokeEnd = t === 'stroke-end';
          const isShape = t === 'line' || t === 'rectangle' || t === 'circle';
          const isText = t === 'text';
          if (isStrokeEnd || isShape || isText) {
            this.saveToHistory();
          }
        }
        break;

      case 'clear':
        // Only clear if message is for current board
        if (message.boardId === this.currentBoard) {
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          this.drawingHistory = [];
          this.historyStep = -1;
        }
        break;

      case 'save-success':
        this.addNotification(message.message, 'success');
        this.loadWhiteboardList();
        break;

      case 'board-loaded':
        // Create a new board tab with the loaded whiteboard
        const loadedBoardData = {
          canvas: null,
          history: [],
          historyStep: -1,
          name: message.boardName,
          number: message.boardNumber,
          locked: false
        };
        this.boards.set(message.boardId, loadedBoardData);
        this.addBoardTab(message.boardId, message.boardNumber, message.boardName, false);
        
        // Load the whiteboard image
        const img = new Image();
        img.onload = () => {
          if (message.userId === this.userId) {
            // If I loaded it, switch to it
            this.switchBoard(message.boardId);
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0);
            this.saveToHistory();
            this.addNotification('Whiteboard loaded', 'success');
          } else {
            // Other users see notification but don't auto-switch
            this.addNotification(`${message.userName} loaded "${message.boardName}"`, 'info');
            // Store the canvas for this board
            loadedBoardData.canvas = message.data.image;
          }
        };
        img.src = message.data.image;
        break;

      case 'load-error':
        this.addNotification(message.message, 'warning');
        break;

      case 'whiteboards-list':
        this.updateLoadSelect(message.whiteboards);
        break;

      case 'delete-success':
        this.addNotification(message.message, 'success');
        this.loadWhiteboardList();
        break;

      case 'delete-error':
        this.addNotification(message.message, 'warning');
        break;

      case 'board-created':
        // Add tab for all clients (including creator)
        this.addBoardTab(message.boardId, message.boardNumber, message.boardName, message.locked);
        
        if (message.userId === this.userId) {
          // If I created it, switch to it
          this.switchBoard(message.boardId);
          this.addNotification(`Created ${message.boardName}`, 'success');
        } else {
          this.addNotification(`${message.userName} created ${message.boardName}`, 'info');
          // Request state for the new board so preview works immediately
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
              type: 'request-board-state',
              boardId: message.boardId
            }));
          }
        }
        break;

      case 'board-closed':
        if (message.userId !== this.userId) {
          this.removeBoardTab(message.boardId);
          this.addNotification(`${message.userName} closed a board`, 'info');
        }
        break;

      case 'board-switched':
        // Could show which board other users are on
        break;

      case 'board-state':
        console.log('Received board-state:', {
          boardId: message.boardId,
          hasCanvas: !!message.canvas,
          canvasLength: message.canvas ? message.canvas.length : 0,
          drawingsCount: message.drawings ? message.drawings.length : 0
        });
        
        // Replay all drawings for this board
        if (message.boardId === this.currentBoard) {
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          
          // First, draw the loaded whiteboard image if it exists
          if (message.canvas) {
            console.log('Loading canvas image from board-state');
            const img = new Image();
            img.onload = () => {
              console.log('Canvas image loaded successfully');
              this.ctx.drawImage(img, 0, 0);
              // Then replay drawings on top
              if (message.drawings) {
                message.drawings.forEach(drawData => {
                  this.drawRemote(drawData);
                });
              }
              this.saveToHistory();
            };
            img.onerror = (e) => {
              console.error('Failed to load canvas image:', e);
              // Still replay drawings even if image fails
              if (message.drawings) {
                message.drawings.forEach(drawData => {
                  this.drawRemote(drawData);
                });
              }
              this.saveToHistory();
            };
            img.src = message.canvas;
          } else if (message.drawings) {
            console.log('No canvas, only replaying drawings');
            // No loaded image, just replay drawings
            message.drawings.forEach(drawData => {
              this.drawRemote(drawData);
            });
            this.saveToHistory();
          } else {
            console.log('Empty board state');
            // Empty board
            this.saveToHistory();
          }
        } else if ((message.drawings && message.drawings.length > 0) || message.canvas) {
          // For non-current boards, render to temp canvas for preview
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = this.canvas.width;
          tempCanvas.height = this.canvas.height;
          const tempCtx = tempCanvas.getContext('2d');
          
          // Temporarily swap canvas context
          const originalCanvas = this.canvas;
          const originalCtx = this.ctx;
          this.canvas = tempCanvas;
          this.ctx = tempCtx;
          
          // Draw loaded image if exists
          if (message.canvas) {
            const img = new Image();
            img.onload = () => {
              tempCtx.drawImage(img, 0, 0);
              // Then replay drawings
              if (message.drawings) {
                message.drawings.forEach(drawData => {
                  this.drawRemote(drawData);
                });
              }
              // Restore original canvas
              this.canvas = originalCanvas;
              this.ctx = originalCtx;
              
              // Save preview
              const boardData = this.boards.get(message.boardId);
              if (boardData) {
                boardData.canvas = tempCanvas.toDataURL();
              }
            };
            img.src = message.canvas;
          } else {
            // No loaded image, just replay drawings
            message.drawings.forEach(drawData => {
              this.drawRemote(drawData);
            });
            
            // Restore original canvas
            this.canvas = originalCanvas;
            this.ctx = originalCtx;
            
            // Save preview
            const boardData = this.boards.get(message.boardId);
            if (boardData) {
              boardData.canvas = tempCanvas.toDataURL();
            }
          }
        }
        break;

      case 'board-renamed':
        // Update board name
        const renamedBoardData = this.boards.get(message.boardId);
        if (renamedBoardData) {
          renamedBoardData.name = message.newName;
        }
        
        // Update tab
        const renamedTab = document.querySelector(`[data-board="${message.boardId}"]`);
        if (renamedTab) {
          const nameSpan = renamedTab.querySelector('.board-tab-name');
          if (nameSpan) nameSpan.textContent = message.newName;
        }
        
        if (message.userId !== this.userId) {
          this.addNotification(`${message.userName} renamed board to "${message.newName}"`, 'info');
        }
        break;

      case 'board-lock-toggled':
        // Update board lock status
        const toggledBoardData = this.boards.get(message.boardId);
        if (toggledBoardData) {
          toggledBoardData.locked = message.locked;
        }
        
        // Update tab UI
        const toggledTab = document.querySelector(`[data-board="${message.boardId}"]`);
        if (toggledTab) {
          const lockIcon = toggledTab.querySelector('.board-tab-lock');
          if (lockIcon) {
            lockIcon.innerHTML = message.locked ? '🔒' : '🔓';
            lockIcon.title = message.locked ? 'Locked' : 'Unlocked';
          }
          toggledTab.classList.toggle('locked', message.locked);
          
          // Hide/show close button based on lock state
          const closeBtn = toggledTab.querySelector('.board-tab-close');
          if (closeBtn) {
            closeBtn.style.display = message.locked ? 'none' : 'inline-block';
          }
        }
        
        if (message.userId !== this.userId) {
          const boardName = toggledBoardData ? toggledBoardData.name : 'Board';
          this.addNotification(
            `${message.userName} ${message.locked ? 'locked' : 'unlocked'} ${boardName}`, 
            'info'
          );
        }
        break;

      case 'error':
        this.addNotification(message.message, 'error');
        break;
    }
  }

  onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Handle text tool click
    if (this.currentTool === 'text') {
      this.startTextInput(x, y);
      return;
    }

    this.isDrawing = true;
    this.startX = x;
    this.startY = y;

    if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
      this.startDrawing(this.startX, this.startY);
      // Send initial point for pen/eraser
      this.sendDrawing({
        type: 'stroke-start',
        x: this.startX,
        y: this.startY,
        color: this.currentColor,
        width: this.brushSize,
        tool: this.currentTool
      });
    }
  }

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Send cursor position to other users (throttled)
    const now = Date.now();
    if (now - this.lastCursorSendTime >= this.cursorSendInterval) {
      this.sendCursorPosition(x, y);
      this.lastCursorSendTime = now;
    }

    if (!this.isDrawing) {
      return;
    }

    if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
      this.continueLine(x, y);
    } else {
      // For shapes, preview on canvas by restoring last state and drawing preview
      if (this.historyStep >= 0 && this.historyStep < this.drawingHistory.length) {
        const img = new Image();
        img.onload = () => {
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          this.ctx.drawImage(img, 0, 0);
          this.drawShape(this.startX, this.startY, x, y, true);
        };
        img.src = this.drawingHistory[this.historyStep];
      } else {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawShape(this.startX, this.startY, x, y, true);
      }
    }
  }

  onMouseUp(e) {
    if (!this.isDrawing) return;

    const rect = this.canvas.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    if (this.currentTool !== 'pen' && this.currentTool !== 'eraser') {
      // Restore canvas to state before preview, then draw final shape
      if (this.historyStep >= 0 && this.historyStep < this.drawingHistory.length) {
        const img = new Image();
        img.onload = () => {
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          this.ctx.drawImage(img, 0, 0);
          // Draw the final shape
          this.drawShape(this.startX, this.startY, endX, endY);
          // Save to history after drawing
          this.saveToHistory();
          // Send to other users
          this.sendDrawing({
            type: this.currentTool,
            startX: this.startX,
            startY: this.startY,
            endX: endX,
            endY: endY,
            color: this.currentColor,
            width: this.brushSize,
            filled: this.fillShape
          });
        };
        img.src = this.drawingHistory[this.historyStep];
      } else {
        // No history, just clear and draw
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawShape(this.startX, this.startY, endX, endY);
        this.saveToHistory();
        this.sendDrawing({
          type: this.currentTool,
          startX: this.startX,
          startY: this.startY,
          endX: endX,
          endY: endY,
          color: this.currentColor,
          width: this.brushSize,
          filled: this.fillShape
        });
      }
    } else if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
      // If mouse didn't move, draw a single dot at the click point
      if (this.startX === endX && this.startY === endY) {
        this.continueLine(endX, endY);
      }
      // Signal end of stroke
      this.sendDrawing({
        type: 'stroke-end'
      });
      this.saveToHistory();
    }

    this.isDrawing = false;
  }

  onTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    this.canvas.dispatchEvent(mouseEvent);
  }

  onTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    this.canvas.dispatchEvent(mouseEvent);
  }

  onTouchEnd(e) {
    e.preventDefault();
    const mouseEvent = new MouseEvent('mouseup', {});
    this.canvas.dispatchEvent(mouseEvent);
  }

  startDrawing(x, y) {
    if (this.currentTool === 'eraser') {
      this.ctx.clearRect(x - this.brushSize / 2, y - this.brushSize / 2, this.brushSize, this.brushSize);
    } else if (this.currentTool === 'pen') {
      this.ctx.beginPath();
      this.ctx.moveTo(x, y);
    }
    // For shapes (line, rectangle, circle), don't save to history yet
    // History will be saved when drawing is complete (in onMouseUp)
  }

  continueLine(x, y) {
    if (this.currentTool === 'eraser') {
      this.ctx.clearRect(x - this.brushSize / 2, y - this.brushSize / 2, this.brushSize, this.brushSize);
    } else {
      this.setupDrawingStyle();
      this.ctx.lineTo(x, y);
      this.ctx.stroke();
    }

    // Send each point as user draws
    this.sendDrawing({
      type: 'stroke-point',
      x: x,
      y: y,
      color: this.currentColor,
      width: this.brushSize,
      tool: this.currentTool
    });
  }

  setupDrawingStyle() {
    this.ctx.strokeStyle = this.currentColor;
    this.ctx.lineWidth = this.brushSize;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.fillStyle = this.currentColor;
  }

  drawShape(fromX, fromY, toX, toY, isPreview = false) {
    this.setupDrawingStyle();

    const width = toX - fromX;
    const height = toY - fromY;
    const radius = Math.sqrt(width * width + height * height) / 2;

    switch (this.currentTool) {
      case 'line':
        this.ctx.beginPath();
        this.ctx.moveTo(fromX, fromY);
        this.ctx.lineTo(toX, toY);
        this.ctx.stroke();
        break;

      case 'rectangle':
        if (this.fillShape) {
          this.ctx.fillRect(fromX, fromY, width, height);
        } else {
          this.ctx.strokeRect(fromX, fromY, width, height);
        }
        break;

      case 'circle':
        this.ctx.beginPath();
        const centerX = (fromX + toX) / 2;
        const centerY = (fromY + toY) / 2;
        this.ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        if (this.fillShape) {
          this.ctx.fill();
        } else {
          this.ctx.stroke();
        }
        break;

      case 'text':
        const fontString = `${data.fontStyle !== 'normal' ? data.fontStyle + ' ' : ''}${data.fontWeight !== 'normal' ? data.fontWeight + ' ' : ''}${data.fontSize}px ${data.fontFamily}`;
        this.ctx.font = fontString;
        this.ctx.fillStyle = data.color;
        
        // Draw background if provided
        if (data.bgColor && data.bgColor !== 'transparent') {
          this.ctx.fillStyle = data.bgColor;
          const metrics = this.ctx.measureText(data.text);
          const padding = 4;
          this.ctx.fillRect(data.x - padding, data.y - data.fontSize - padding, metrics.width + padding * 2, data.fontSize + padding * 2);
        }
        
        this.ctx.fillStyle = data.color;
        this.ctx.fillText(data.text, data.x, data.y);
        
        // Draw underline if needed
        if (data.textDecoration && data.textDecoration.includes('underline')) {
          const metrics = this.ctx.measureText(data.text);
          this.ctx.strokeStyle = data.color;
          this.ctx.lineWidth = 1;
          this.ctx.beginPath();
          this.ctx.moveTo(data.x, data.y + 2);
          this.ctx.lineTo(data.x + metrics.width, data.y + 2);
          this.ctx.stroke();
        }
        break;
    }
  }

  startTextInput(x, y) {
    // Remove any existing text input
    if (this.textInput) {
      this.finishTextInput();
    }

    this.isEditingText = true;
    const rect = this.canvas.getBoundingClientRect();

    // Create container for toolbar and input
    this.textEditorContainer = document.createElement('div');
    this.textEditorContainer.className = 'text-editor-container';
    this.textEditorContainer.style.left = `${rect.left + x}px`;
    this.textEditorContainer.style.top = `${rect.top + y - 50}px`;

    // Create toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'text-editor-toolbar';
    
    // Font family selector
    const fontSelect = document.createElement('select');
    fontSelect.innerHTML = `
      <option value="Arial">Arial</option>
      <option value="Times New Roman">Times New Roman</option>
      <option value="Courier New">Courier New</option>
      <option value="Georgia">Georgia</option>
      <option value="Verdana">Verdana</option>
      <option value="Comic Sans MS">Comic Sans</option>
    `;
    toolbar.appendChild(fontSelect);

    // Font size selector
    const sizeSelect = document.createElement('select');
    sizeSelect.innerHTML = `
      <option value="12">12</option>
      <option value="14">14</option>
      <option value="16" selected>16</option>
      <option value="18">18</option>
      <option value="20">20</option>
      <option value="24">24</option>
      <option value="28">28</option>
      <option value="32">32</option>
      <option value="36">36</option>
      <option value="48">48</option>
    `;
    toolbar.appendChild(sizeSelect);

    // Separator
    const sep1 = document.createElement('div');
    sep1.className = 'separator';
    toolbar.appendChild(sep1);

    // Bold button
    const boldBtn = document.createElement('button');
    boldBtn.innerHTML = '<b>B</b>';
    boldBtn.title = 'Bold';
    toolbar.appendChild(boldBtn);

    // Italic button
    const italicBtn = document.createElement('button');
    italicBtn.innerHTML = '<i>I</i>';
    italicBtn.title = 'Italic';
    toolbar.appendChild(italicBtn);

    // Underline button
    const underlineBtn = document.createElement('button');
    underlineBtn.innerHTML = '<u>U</u>';
    underlineBtn.title = 'Underline';
    toolbar.appendChild(underlineBtn);

    // Separator
    const sep2 = document.createElement('div');
    sep2.className = 'separator';
    toolbar.appendChild(sep2);

    // Text color picker
    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.value = this.currentColor;
    colorPicker.title = 'Text Color';
    toolbar.appendChild(colorPicker);

    // Background color picker
    const bgColorPicker = document.createElement('input');
    bgColorPicker.type = 'color';
    bgColorPicker.value = '#ffffff';
    bgColorPicker.title = 'Background Color';
    toolbar.appendChild(bgColorPicker);

    this.textEditorContainer.appendChild(toolbar);

    // Create contentEditable div instead of input
    this.textInput = document.createElement('div');
    this.textInput.contentEditable = true;
    this.textInput.className = 'text-editor-input';
    
    // Set defaults
    this.textInput.style.fontFamily = 'Arial';
    this.textInput.style.fontSize = '16px';
    this.textInput.style.color = this.currentColor;
    this.textInput.style.backgroundColor = '#ffffff';
    this.textInput.textContent = 'Type here...';

    // Store the canvas coordinates
    this.textInput.dataset.canvasX = x;
    this.textInput.dataset.canvasY = y;

    this.textEditorContainer.appendChild(this.textInput);
    document.body.appendChild(this.textEditorContainer);

    // Event handlers for toolbar
    fontSelect.addEventListener('change', (e) => {
      this.textInput.style.fontFamily = e.target.value;
    });

    sizeSelect.addEventListener('change', (e) => {
      this.textInput.style.fontSize = e.target.value + 'px';
    });

    boldBtn.addEventListener('click', () => {
      boldBtn.classList.toggle('active');
      this.textInput.style.fontWeight = boldBtn.classList.contains('active') ? 'bold' : 'normal';
    });

    italicBtn.addEventListener('click', () => {
      italicBtn.classList.toggle('active');
      this.textInput.style.fontStyle = italicBtn.classList.contains('active') ? 'italic' : 'normal';
    });

    underlineBtn.addEventListener('click', () => {
      underlineBtn.classList.toggle('active');
      this.textInput.style.textDecoration = underlineBtn.classList.contains('active') ? 'underline' : 'none';
    });

    colorPicker.addEventListener('change', (e) => {
      this.textInput.style.color = e.target.value;
    });

    bgColorPicker.addEventListener('change', (e) => {
      this.textInput.style.backgroundColor = e.target.value;
    });

    // Make draggable (toolbar or input)
    let isDragging = false;
    let dragStartX, dragStartY;

    const startDrag = (e) => {
      // Don't start drag on interactive elements
      if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') {
        return;
      }
      isDragging = true;
      const containerRect = this.textEditorContainer.getBoundingClientRect();
      dragStartX = e.clientX - containerRect.left;
      dragStartY = e.clientY - containerRect.top;
      e.preventDefault();
    };

    toolbar.addEventListener('mousedown', startDrag);
    this.textInput.addEventListener('mousedown', startDrag);

    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        const newX = e.clientX - dragStartX;
        const newY = e.clientY - dragStartY;
        this.textEditorContainer.style.left = newX + 'px';
        this.textEditorContainer.style.top = newY + 'px';

        // Update canvas coordinates relative to current canvas position
        const latestRect = this.canvas.getBoundingClientRect();
        this.textInput.dataset.canvasX = newX - latestRect.left;
        this.textInput.dataset.canvasY = newY - latestRect.top + 50;
      }
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // Focus and select placeholder text
    setTimeout(() => {
      if (this.textInput) {
        this.textInput.focus();
        const range = document.createRange();
        range.selectNodeContents(this.textInput);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }, 10);

    // Save text on Escape or clicking outside
    const keydownHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.finishTextInput();
      }
    };
    document.addEventListener('keydown', keydownHandler);

    // Click outside to finish
    const clickOutsideHandler = (e) => {
      if (this.textEditorContainer && !this.textEditorContainer.contains(e.target) && e.target !== this.canvas) {
        this.finishTextInput();
      }
    };
    setTimeout(() => {
      document.addEventListener('click', clickOutsideHandler);
    }, 100);

    // Store handlers for cleanup
    this.textEditorContainer._keydownHandler = keydownHandler;
    this.textEditorContainer._clickHandler = clickOutsideHandler;
  }

  finishTextInput() {
    if (!this.textInput) return;

    const text = this.textInput.textContent.trim();
    if (text && text !== 'Type here...') {
      const x = parseFloat(this.textInput.dataset.canvasX);
      const y = parseFloat(this.textInput.dataset.canvasY);

      // Get computed styles
      const fontFamily = this.textInput.style.fontFamily || 'Arial';
      const fontSize = parseInt(this.textInput.style.fontSize) || 16;
      const fontWeight = this.textInput.style.fontWeight || 'normal';
      const fontStyle = this.textInput.style.fontStyle || 'normal';
      const textDecoration = this.textInput.style.textDecoration || 'none';
      const color = this.textInput.style.color || this.currentColor;
      const bgColor = this.textInput.style.backgroundColor || 'transparent';

      // Draw text directly on canvas
      const fontString = `${fontStyle !== 'normal' ? fontStyle + ' ' : ''}${fontWeight !== 'normal' ? fontWeight + ' ' : ''}${fontSize}px ${fontFamily}`;
      this.ctx.font = fontString;
      
      // Draw background if provided
      if (bgColor && bgColor !== 'transparent') {
        this.ctx.fillStyle = bgColor;
        const metrics = this.ctx.measureText(text);
        const padding = 4;
        this.ctx.fillRect(x - padding, y - fontSize - padding, metrics.width + padding * 2, fontSize + padding * 2);
      }
      
      this.ctx.fillStyle = color;
      this.ctx.fillText(text, x, y);
      
      // Draw underline if needed
      if (textDecoration.includes('underline')) {
        const metrics = this.ctx.measureText(text);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(x, y + 2);
        this.ctx.lineTo(x + metrics.width, y + 2);
        this.ctx.stroke();
      }

      // Send to other users
      this.sendDrawing({
        type: 'text',
        text,
        x,
        y,
        color,
        bgColor,
        fontFamily,
        fontSize,
        fontWeight,
        fontStyle,
        textDecoration
      });
      
      this.saveToHistory();
    }

    this.cancelTextInput();
  }

  cancelTextInput() {
    if (this.textEditorContainer) {
      // Remove event listeners
      if (this.textEditorContainer._keydownHandler) {
        document.removeEventListener('keydown', this.textEditorContainer._keydownHandler);
      }
      if (this.textEditorContainer._clickHandler) {
        document.removeEventListener('click', this.textEditorContainer._clickHandler);
      }
      this.textEditorContainer.remove();
      this.textEditorContainer = null;
    }
    this.textInput = null;
    this.isEditingText = false;
  }

  drawRemote(data) {
    if (!data) return;

    // Handle stroke start
    if (data.type === 'stroke-start') {
      this.remoteCtx = {
        tool: data.tool,
        color: data.color,
        width: data.width
      };
      this.ctx.strokeStyle = data.color;
      this.ctx.lineWidth = data.width;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.beginPath();
      this.ctx.moveTo(data.x, data.y);
      return;
    }

    // Handle stroke points
    if (data.type === 'stroke-point') {
      this.ctx.strokeStyle = data.color;
      this.ctx.lineWidth = data.width;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';

      if (data.tool === 'eraser') {
        this.ctx.clearRect(data.x - data.width / 2, data.y - data.width / 2, data.width, data.width);
      } else {
        this.ctx.lineTo(data.x, data.y);
        this.ctx.stroke();
      }
      return;
    }

    // Handle stroke end
    if (data.type === 'stroke-end') {
      this.remoteCtx = null;
      return;
    }

    // Handle text
    if (data.type === 'text') {
      // Draw background if provided
      if (data.bgColor && data.bgColor !== 'transparent' && data.bgColor !== '#ffffff') {
        this.ctx.fillStyle = data.bgColor;
        const tempFont = this.ctx.font;
        this.ctx.font = `${data.fontSize || 16}px ${data.fontFamily || 'Arial'}`;
        const metrics = this.ctx.measureText(data.text);
        const padding = 4;
        this.ctx.fillRect(data.x - padding, data.y - (data.fontSize || 16) - padding, 
                         metrics.width + padding * 2, (data.fontSize || 16) + padding * 2);
      }

      // Build font string
      let fontString = '';
      if (data.fontStyle && data.fontStyle !== 'normal') fontString += data.fontStyle + ' ';
      if (data.fontWeight && data.fontWeight !== 'normal') fontString += data.fontWeight + ' ';
      fontString += (data.fontSize || 16) + 'px ' + (data.fontFamily || 'Arial');
      
      this.ctx.font = fontString;
      this.ctx.fillStyle = data.color;
      this.ctx.fillText(data.text, data.x, data.y);

      // Draw underline if needed
      if (data.textDecoration && data.textDecoration.includes('underline')) {
        const metrics = this.ctx.measureText(data.text);
        this.ctx.strokeStyle = data.color;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(data.x, data.y + 2);
        this.ctx.lineTo(data.x + metrics.width, data.y + 2);
        this.ctx.stroke();
      }
      return;
    }

    // Shape drawing
    this.drawRemoteShape(data);
  }

  drawRemoteShape(data) {
    this.ctx.strokeStyle = data.color;
    this.ctx.lineWidth = data.width;
    this.ctx.fillStyle = data.color;

    const width = data.endX - data.startX;
    const height = data.endY - data.startY;
    const radius = Math.sqrt(width * width + height * height) / 2;

    switch (data.type) {
      case 'line':
        this.ctx.beginPath();
        this.ctx.moveTo(data.startX, data.startY);
        this.ctx.lineTo(data.endX, data.endY);
        this.ctx.stroke();
        break;

      case 'rectangle':
        if (data.filled) {
          this.ctx.fillRect(data.startX, data.startY, width, height);
        } else {
          this.ctx.strokeRect(data.startX, data.startY, width, height);
        }
        break;

      case 'circle':
        this.ctx.beginPath();
        const centerX = (data.startX + data.endX) / 2;
        const centerY = (data.startY + data.endY) / 2;
        this.ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        if (data.filled) {
          this.ctx.fill();
        } else {
          this.ctx.stroke();
        }
        break;
    }
  }

  sendDrawing(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'draw',
        boardId: this.currentBoard,
        data: data
      }));
    }
  }

  sendCursorPosition(x, y) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'cursor-move',
        x: x,
        y: y,
        name: this.userName,
        color: this.userColor
      }));
    }
  }

  drawRemoteCursors() {
    if (!this.cursorCtx) return;
    this.remoteCursors.forEach((cursor, userId) => {
      if (userId === this.userId) return; // Don't draw own cursor
      const x = cursor.x;
      const y = cursor.y;

      // Draw cursor arrow
      this.cursorCtx.save();
      this.cursorCtx.translate(x, y);
      
      // Draw cursor shape (pointer arrow)
      this.cursorCtx.fillStyle = cursor.color;
      this.cursorCtx.strokeStyle = '#ffffff';
      this.cursorCtx.lineWidth = 1.5;
      
      this.cursorCtx.beginPath();
      this.cursorCtx.moveTo(0, 0);
      this.cursorCtx.lineTo(0, 16);
      this.cursorCtx.lineTo(4, 12);
      this.cursorCtx.lineTo(8, 18);
      this.cursorCtx.lineTo(10, 17);
      this.cursorCtx.lineTo(6, 11);
      this.cursorCtx.lineTo(11, 11);
      this.cursorCtx.closePath();
      
      this.cursorCtx.fill();
      this.cursorCtx.stroke();
      
      this.cursorCtx.restore();

      // Draw name label
      this.cursorCtx.fillStyle = cursor.color;
      this.cursorCtx.font = 'bold 11px Arial';
      this.cursorCtx.textBaseline = 'top';
      
      // Background for name
      const textMetrics = this.cursorCtx.measureText(cursor.name);
      this.cursorCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      this.cursorCtx.fillRect(x + 12, y + 2, textMetrics.width + 6, 16);
      
      // Name text
      this.cursorCtx.fillStyle = cursor.color;
      this.cursorCtx.fillText(cursor.name, x + 15, y + 5);
    });
  }

  clearBoard() {
    if (confirm('Are you sure you want to clear the entire board? This cannot be undone.')) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.drawingHistory = [];
      this.historyStep = -1;
      this.textObjects = [];

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'clear', boardId: this.currentBoard }));
      }

      this.addNotification('Board cleared', 'info');
    }
  }

  downloadCanvas() {
    const link = document.createElement('a');
    link.href = this.canvas.toDataURL('image/png');
    link.download = `whiteboard-${Date.now()}.png`;
    link.click();
    this.addNotification('Whiteboard downloaded', 'success');
  }

  saveWhiteboard() {
    const name = document.getElementById('whiteboardName').value.trim();
    if (!name) {
      this.addNotification('Please enter a whiteboard name', 'warning');
      return;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.addNotification('Not connected to server', 'warning');
      return;
    }

    const imageData = this.canvas.toDataURL();
    const data = JSON.stringify({
      timestamp: new Date().toISOString(),
      image: imageData
    });

    this.ws.send(JSON.stringify({
      type: 'save-whiteboard',
      name: name,
      data: data
    }));

    document.getElementById('whiteboardName').value = '';
  }

  loadWhiteboard() {
    const select = document.getElementById('loadSelect');
    const name = select.value;

    if (!name) {
      this.addNotification('Please select a whiteboard to load', 'warning');
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Create a new board for the loaded whiteboard
      const boardId = 'board-' + Date.now();
      
      this.ws.send(JSON.stringify({
        type: 'load-whiteboard',
        name: name,
        boardId: boardId,
        boardName: name
      }));
    } else {
      this.addNotification('Not connected to server', 'warning');
    }
  }

  deleteWhiteboard() {
    const select = document.getElementById('loadSelect');
    const name = select.value;

    if (!name) {
      this.addNotification('Please select a whiteboard to delete', 'warning');
      return;
    }

    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'delete-whiteboard',
          name: name
        }));
      } else {
        this.addNotification('Not connected to server', 'warning');
      }
    }
  }

  loadWhiteboardList() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'list-whiteboards' }));
    }
  }

  updateLoadSelect(whiteboards) {
    const select = document.getElementById('loadSelect');
    const currentValue = select.value;

    // Clear existing options except the first one
    while (select.options.length > 1) {
      select.remove(1);
    }

    // Add whiteboard options
    whiteboards.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });

    select.value = currentValue;
  }



  loadDrawingsFromData(data, loadInfo = null) {
    try {
      const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
      const img = new Image();
      img.onload = () => {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(img, 0, 0);
        
        // Show appropriate notification
        if (loadInfo && loadInfo.userId !== this.userId) {
          this.addNotification(`${loadInfo.userName} loaded "${loadInfo.whiteboardName}"`, 'info');
        } else {
          this.addNotification('Whiteboard loaded', 'success');
        }
      };
      img.src = parsedData.image;
    } catch (e) {
      console.error('Error loading whiteboard:', e);
      this.addNotification('Error loading whiteboard', 'warning');
    }
  }

  changeUserName(name) {
    if (name.trim()) {
      this.userName = name;
      // Save to localStorage for persistence
      localStorage.setItem('whiteboard-username', name);
      // Update the input field immediately
      document.getElementById('userNameInput').value = name;
      // Update own user item in the list if it exists
      const ownUserItem = document.querySelector(`[data-user-id="${this.userId}"]`);
      if (ownUserItem) {
        const nameElement = ownUserItem.querySelector('.user-name');
        if (nameElement) {
          nameElement.textContent = name;
        }
      }
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'user-name',
          name: name
        }));
      }
    }
  }

  changeUserColor(color) {
    this.userColor = color;
    // Save to localStorage for persistence
    localStorage.setItem('whiteboard-usercolor', color);
    // Update the color indicator immediately
    document.getElementById('userColor').style.background = color;
    // Update own user item in the list if it exists
    const ownUserItem = document.querySelector(`[data-user-id="${this.userId}"]`);
    if (ownUserItem) {
      const dotElement = ownUserItem.querySelector('.user-dot');
      if (dotElement) {
        dotElement.style.background = color;
      }
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'user-color',
        color: color
      }));
    }
  }

  updateConnectionStatus(connected) {
    this.connected = connected;
    const indicator = document.getElementById('statusIndicator');
    const status = document.getElementById('connectionStatus');

    if (connected) {
      indicator.classList.add('connected');
      status.textContent = 'Connected';
    } else {
      indicator.classList.remove('connected');
      status.textContent = 'Disconnected';
    }
  }

  updateUsersList(users) {
    const usersList = document.getElementById('usersList');
    usersList.innerHTML = '';

    if (users.length === 0) {
      usersList.innerHTML = '<div class="no-users">No users online</div>';
      return;
    }

    users.forEach(user => {
      this.updateUsersListItem(user, true);
    });
  }

  updateUsersListItem(user, skipAnimation = false) {
    const usersList = document.getElementById('usersList');
    const existingItem = usersList.querySelector(`[data-user-id="${user.id}"]`);

    if (existingItem) {
      existingItem.remove();
    }

    const noUsers = usersList.querySelector('.no-users');
    if (noUsers) {
      noUsers.remove();
    }

    const userItem = document.createElement('div');
    userItem.className = 'user-item';
    userItem.dataset.userId = user.id;
    if (!skipAnimation) {
      userItem.style.animation = 'slideIn 0.3s ease';
    }

    const dot = document.createElement('div');
    dot.className = 'user-dot';
    dot.style.background = user.color;

    const name = document.createElement('div');
    name.className = 'user-name';
    name.textContent = user.name;

    userItem.appendChild(dot);
    userItem.appendChild(name);
    usersList.appendChild(userItem);
  }

  removeUserListItem(userId) {
    const userItem = document.querySelector(`[data-user-id="${userId}"]`);
    if (userItem) {
      userItem.classList.add('leaving');
      setTimeout(() => {
        userItem.remove();
        const usersList = document.getElementById('usersList');
        if (usersList.children.length === 0) {
          usersList.innerHTML = '<div class="no-users">No users online</div>';
        }
      }, 300);
    }
  }

  addNotification(message, type = 'info') {
    const notificationsList = document.getElementById('notificationsList');
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    notificationsList.insertBefore(notification, notificationsList.firstChild);

    // Keep only last 5 notifications
    while (notificationsList.children.length > 5) {
      notificationsList.lastChild.remove();
    }

    // Auto remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 5000);
  }

  toggleHelpModal(show) {
    const modal = document.getElementById('helpModal');
    if (show === undefined) {
      show = !modal.classList.contains('show');
    }

    if (show) {
      modal.classList.add('show');
    } else {
      modal.classList.remove('show');
    }
  }

  saveToHistory() {
    const imageData = this.canvas.toDataURL();
    this.historyStep++;
    this.drawingHistory = this.drawingHistory.slice(0, this.historyStep);
    this.drawingHistory.push(imageData);
  }

  redrawCanvas() {
    if (this.historyStep >= 0 && this.historyStep < this.drawingHistory.length) {
      const img = new Image();
      img.onload = () => {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(img, 0, 0);
      };
      img.src = this.drawingHistory[this.historyStep];
    } else {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  redrawAll() {
    if (this.historyStep >= 0 && this.historyStep < this.drawingHistory.length) {
      const img = new Image();
      img.onload = () => {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(img, 0, 0);
      };
      img.src = this.drawingHistory[this.historyStep];
    } else {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  createNewBoard() {
    const boardId = 'board-' + Date.now();
    
    // Create board data
    this.boards.set(boardId, { canvas: null, history: [], historyStep: -1 });
    
    // Notify server (server will assign board number)
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'board-created',
        boardId: boardId
      }));
    }
  }

  addBoardTab(boardId, boardNumber, boardName = null, locked = false) {
    // Don't add if already exists
    if (document.querySelector(`[data-board="${boardId}"]`)) return;
    
    // Create board data if needed
    if (!this.boards.has(boardId)) {
      this.boards.set(boardId, { 
        canvas: null, 
        history: [], 
        historyStep: -1, 
        name: boardName || `Board ${boardNumber}`,
        locked: locked 
      });
    } else {
      // Update existing board data with server info
      const boardData = this.boards.get(boardId);
      boardData.locked = locked;
      boardData.name = boardName || `Board ${boardNumber}`;
    }
    
    // Create tab
    const tab = document.createElement('button');
    tab.className = 'board-tab';
    if (locked) tab.classList.add('locked');
    tab.dataset.board = boardId;
    
    // Board name span
    const nameSpan = document.createElement('span');
    nameSpan.className = 'board-tab-name';
    nameSpan.textContent = boardName || `Board ${boardNumber}`;
    tab.appendChild(nameSpan);
    
    // Lock icon
    const lockIcon = document.createElement('span');
    lockIcon.className = 'board-tab-lock';
    lockIcon.innerHTML = locked ? '🔒' : '🔓';
    lockIcon.title = locked ? 'Locked' : 'Unlocked';
    lockIcon.onclick = (e) => {
      e.stopPropagation();
      this.toggleBoardLock(boardId);
    };
    tab.appendChild(lockIcon);
    
    // Add close button
    const closeBtn = document.createElement('span');
    closeBtn.className = 'board-tab-close';
    closeBtn.innerHTML = '×';
    if (locked) closeBtn.style.display = 'none';
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      this.closeBoard(boardId);
    };
    tab.appendChild(closeBtn);
    
    // Right-click to rename
    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.renameBoardPrompt(boardId);
    });
    
    document.getElementById('boardTabs').appendChild(tab);
  }

  renameBoardPrompt(boardId) {
    const boardData = this.boards.get(boardId);
    if (!boardData) return;
    
    const newName = prompt('Enter new board name:', boardData.name);
    if (newName && newName.trim() && newName !== boardData.name) {
      this.renameBoard(boardId, newName.trim());
    }
  }

  renameBoard(boardId, newName) {
    // Update local data
    const boardData = this.boards.get(boardId);
    if (boardData) {
      boardData.name = newName;
    }
    
    // Update tab
    const tab = document.querySelector(`[data-board="${boardId}"]`);
    if (tab) {
      const nameSpan = tab.querySelector('.board-tab-name');
      if (nameSpan) nameSpan.textContent = newName;
    }
    
    // Send to server
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'board-rename',
        boardId: boardId,
        newName: newName
      }));
    }
  }

  toggleBoardLock(boardId) {
    const boardData = this.boards.get(boardId);
    if (!boardData) return;
    
    const newLockState = !boardData.locked;
    boardData.locked = newLockState;
    
    // Update tab UI
    const tab = document.querySelector(`[data-board="${boardId}"]`);
    if (tab) {
      const lockIcon = tab.querySelector('.board-tab-lock');
      if (lockIcon) {
        lockIcon.innerHTML = newLockState ? '🔒' : '🔓';
        lockIcon.title = newLockState ? 'Locked' : 'Unlocked';
      }
      tab.classList.toggle('locked', newLockState);
      
      // Hide/show close button based on lock state
      const closeBtn = tab.querySelector('.board-tab-close');
      if (closeBtn) {
        closeBtn.style.display = newLockState ? 'none' : 'inline-block';
      }
    }
    
    // Send to server
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'board-lock-toggle',
        boardId: boardId
      }));
    }
    
    this.addNotification(
      `Board ${newLockState ? 'locked' : 'unlocked'}`, 
      'info'
    );
  }

  switchBoard(boardId) {
    // Save current board state
    const currentBoardData = this.boards.get(this.currentBoard);
    if (currentBoardData) {
      currentBoardData.canvas = this.canvas.toDataURL();
      currentBoardData.history = [...this.drawingHistory];
      currentBoardData.historyStep = this.historyStep;
    }
    
    // Switch to new board
    this.currentBoard = boardId;
    const newBoardData = this.boards.get(boardId);
    
    // Update tabs
    document.querySelectorAll('.board-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.board === boardId);
    });
    
    // Load board state
    if (newBoardData) {
      this.drawingHistory = [...newBoardData.history];
      this.historyStep = newBoardData.historyStep;
      
      // Clear canvas first
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      
      // Always request fresh board state from server to get latest drawings
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'request-board-state',
          boardId: boardId
        }));
      }
    }
  }

  closeBoard(boardId) {
    if (this.boards.size <= 1) {
      this.addNotification('Cannot close the last board', 'warning');
      return;
    }
    
    // Check if board is locked
    const boardData = this.boards.get(boardId);
    if (boardData && boardData.locked) {
      this.addNotification('Cannot close a locked board', 'warning');
      return;
    }
    
    if (boardId === this.currentBoard) {
      // Switch to another board first
      const boardIds = Array.from(this.boards.keys());
      const currentIndex = boardIds.indexOf(boardId);
      const nextBoard = boardIds[currentIndex > 0 ? currentIndex - 1 : 1];
      this.switchBoard(nextBoard);
    }
    
    // Remove board locally
    this.removeBoardTab(boardId);
    
    // Notify other clients
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'board-closed',
        boardId: boardId
      }));
    }
    
    this.addNotification('Board closed', 'info');
  }

  removeBoardTab(boardId) {
    // Switch away if currently on this board
    if (boardId === this.currentBoard && this.boards.size > 1) {
      const boardIds = Array.from(this.boards.keys());
      const currentIndex = boardIds.indexOf(boardId);
      const nextBoard = boardIds[currentIndex > 0 ? currentIndex - 1 : 1];
      this.switchBoard(nextBoard);
    }
    
    // Remove board data and tab
    this.boards.delete(boardId);
    const tab = document.querySelector(`[data-board="${boardId}"]`);
    if (tab) tab.remove();
  }

  showBoardPreview(tabElement, boardId) {
    // Remove any existing preview
    this.hideBoardPreview();
    
    const boardData = this.boards.get(boardId);
    if (!boardData) return;
    
    // Create preview container
    const preview = document.createElement('div');
    preview.className = 'board-preview';
    preview.id = 'boardPreview';
    
    // Create preview canvas
    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = 300;
    previewCanvas.height = 200;
    const previewCtx = previewCanvas.getContext('2d');
    
    // Get board content
    if (boardId === this.currentBoard) {
      // Current board - use live canvas
      const scale = Math.min(300 / this.canvas.width, 200 / this.canvas.height);
      previewCtx.scale(scale, scale);
      previewCtx.drawImage(this.canvas, 0, 0);
    } else if (boardData.canvas) {
      // Other board - use saved state
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(300 / img.width, 200 / img.height);
        previewCtx.scale(scale, scale);
        previewCtx.drawImage(img, 0, 0);
      };
      img.src = boardData.canvas;
    } else {
      // Empty board
      previewCtx.fillStyle = '#f5f5f5';
      previewCtx.fillRect(0, 0, 300, 200);
      previewCtx.fillStyle = '#999';
      previewCtx.font = '14px Arial';
      previewCtx.textAlign = 'center';
      previewCtx.fillText('Empty Board', 150, 100);
    }
    
    preview.appendChild(previewCanvas);
    document.body.appendChild(preview);
    
    // Position preview above tab
    const tabRect = tabElement.getBoundingClientRect();
    const previewWidth = 300 + 16; // canvas width + padding
    
    // Calculate left position, centered on tab
    let leftPos = tabRect.left + (tabRect.width / 2) - 158; // 158 = half of preview width with padding
    
    // Adjust if preview would go off left edge
    if (leftPos < 10) {
      leftPos = 10;
    }
    
    // Adjust if preview would go off right edge
    if (leftPos + previewWidth > window.innerWidth - 10) {
      leftPos = window.innerWidth - previewWidth - 10;
    }
    
    preview.style.left = leftPos + 'px';
    preview.style.bottom = (window.innerHeight - tabRect.top + 10) + 'px';
  }

  hideBoardPreview() {
    const preview = document.getElementById('boardPreview');
    if (preview) {
      preview.remove();
    }
  }


}

// Initialize the whiteboard when the page loads
window.addEventListener('DOMContentLoaded', () => {
  new Whiteboard();
  
  // Make toolbar draggable
  const toolbar = document.getElementById('verticalToolbar');
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  let xOffset = 0;
  let yOffset = 0;

  toolbar.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);

  function dragStart(e) {
    // Only drag if clicking on the toolbar background, not buttons
    if (e.target === toolbar || e.target.classList.contains('toolbar-divider')) {
      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;
      isDragging = true;
      toolbar.classList.add('dragging');
    }
  }

  function drag(e) {
    if (isDragging) {
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;
      xOffset = currentX;
      yOffset = currentY;
      setTranslate(currentX, currentY, toolbar);
    }
  }

  function dragEnd(e) {
    initialX = currentX;
    initialY = currentY;
    isDragging = false;
    toolbar.classList.remove('dragging');
  }

  function setTranslate(xPos, yPos, el) {
    el.style.transform = `translate(${xPos}px, ${yPos}px)`;
  }
});
