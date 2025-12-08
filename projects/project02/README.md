# Minesweeper SPA

A **local-first Minesweeper game** that runs entirely in the browser as a **thick-client Single-Page Application (SPA)**.

## Features

- Classic Minesweeper gameplay (configurable board size and mine count)
- Local-first behavior: game state, settings, and local high scores persist between sessions
- Multiple views: Home, Game, Settings, High Scores
- Public GET integration: fetches a short motivational quote from an open API
- Cloud write: pushes high scores to JSONBin for a shared leaderboard (when configured)
- SPA-style client-side routing using URL hash
- Responsive grid layout suitable for laptop and tablet widths
- Styled Minesweeper board with colored numbers, flags, and mines

## Screenshots / Demo

_(You can add screenshots or a GIF to `docs/media/` and link them here.)_

## Live Demo / Install & Run

### Local (no build step)

```bash
npm install
npm run dev
```

This uses `http-server` to serve the project from the root directory.  
Alternatively:

```bash
npx http-server . -c-1 -o
```

### Requirements

- Modern browser with ES modules support
- Designed for 1280×720+ but usable on tablets (≥768px width)

## How It Works (High-Level)

- **Rendering stack:** Vanilla DOM components composed via small helper functions in `src/utils/dom.js`.
- **Architecture:** The app uses a central store (`src/state/store.js`) and view modules (`src/ui/*`) that render based on state.
- **Routing:** A simple hash router (`src/router.js`) maps `#home`, `#game`, `#settings`, and `#highscores` to views.
- **Local-first behavior:** `src/services/localStorageService.js` persists settings and serialized game state under a versioned key. The app boots instantly from this local state before any network calls.
- **Game engine:** Object-oriented game logic (`Game`, `Board`, `Tile` classes) lives under `src/engine/`.

## Data & Networking (High-Level)

- **Public GET:**  
  - Endpoint: `https://api.quotable.io/random?tags=technology,famous-quotes`  
  - Purpose: Fetch a short motivational quote for the Home view.  
  - Tiny response snippet:

    ```json
    {
      "content": "Talk is cheap. Show me the code.",
      "author": "Linus Torvalds",
      "...": "..."
    }
    ```

- **Cloud write (JSONBin):**  
  - Endpoint base: `https://api.jsonbin.io/v3/b/{BIN_ID}`  
  - Payload shape (truncated):

    ```json
    {
      "highScores": [
        {
          "name": "Alice",
          "timeSeconds": 42.1,
          "rows": 9,
          "cols": 9,
          "mines": 10,
          "timestamp": 1733619200000
        }
      ]
    }
    ```

  - Merge policy: last-write-wins per record, sorted by `timeSeconds`, keeping the top 20 scores.

> **Important:** You must configure your own `BIN_ID` and `MASTER_KEY` in `src/services/jsonbinService.js` and **avoid committing real secrets**.

## Configuration

- Difficulty and board size can be adjusted under **Settings**.
- JSONBin configuration is in `src/services/jsonbinService.js`.

## Developer Docs

See `docs/` for planning artifacts and details:

- `docs/pitch.md`
- `docs/roadmap.md`
- `docs/architecture_sketch.md`
- `docs/jsonbin_schema.md`
- `docs/dod-sprint1.md`
- `docs/dod-sprint2.md`
- `docs/dod-sprint3.md`
