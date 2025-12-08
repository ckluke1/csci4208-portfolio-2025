# Architecture Sketch

```text
index.html
└─ src/
   ├─ main.js              # App bootstrapping, local-first boot, networking
   ├─ router.js            # Hash-based SPA routing
   ├─ state/
   │  └─ store.js          # Central app state + pub/sub
   ├─ engine/
   │  ├─ Game.js           # Game lifecycle (start, win/lose, timing)
   │  ├─ Board.js          # Minesweeper grid, mine placement, flood fill
   │  └─ Tile.js           # Individual tile state
   ├─ services/
   │  ├─ localStorageService.js  # Local-first persistence + TTL quote cache
   │  ├─ publicApi.js            # Public GET (motivational quote)
   │  └─ jsonbinService.js       # JSONBin GET/PUT for high scores
   ├─ ui/
   │  ├─ AppView.js        # Top-level view dispatcher
   │  ├─ HomeView.js       # Landing page, quote, navigation
   │  ├─ GameView.js       # Minesweeper board and HUD
   │  ├─ SettingsView.js   # Difficulty controls
   │  └─ HighScoresView.js # Leaderboard view
   └─ utils/
      └─ dom.js            # DOM helpers (h(), clearChildren, formatSeconds)
```

- **View composition / routing:** `router.js` listens to `hashchange` events and updates `state.view`. `AppView` switches which UI module renders into `#app-root` based on this state.
- **State/store:** `state/store.js` maintains a serializable app state (view, quote, game, settings, highScores) with `subscribe()` notifications on change.
- **Core classes:**
  - `Game` — orchestrates Minesweeper runs, timing, win/lose logic.
  - `Board` — owns the grid of `Tile` objects, mine placement, safe-tile detection, flood-fill reveal.
  - `Tile` — encapsulates individual cell state (mine, revealed, flagged, adjacency).
