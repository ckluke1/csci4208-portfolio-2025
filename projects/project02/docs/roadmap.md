# Roadmap

## MVP (Sprint 2)

- **Home view** with navigation to Game, Settings, and High Scores.
- **Game engine vertical slice:** basic Minesweeper loop (reveal, flag, win/lose) on a fixed 9×9 grid with 10 mines.
- **Rendering stack integration:** DOM-based grid renderer using Vanilla JS components.
- **Public GET:** fetch a motivational quote and display it on the Home view (with loading/error states and TTL cache).
- **Cloud write:** on win, serialize a high score payload and push to JSONBin.
- **Local-first boot:** reload last game state and settings from `localStorage` and render immediately.

Vertical slice path:  
`input (click/flag) → game state update → DOM re-render → GET (quote) → PUT (high score to JSONBin)`.

## Full (Sprint 3)

- Difficulty selector (rows, columns, mines) in Settings, persisted locally.
- High Scores view that merges local and remote leaderboards, showing top 20 scores.
- Improved feedback: timer HUD, mine/flag counts, better win/lose messaging.
- Basic responsiveness tweaks for tablet widths and small screens.
- Polished styles and a short GIF demo recorded under `docs/media/`.

## Risks & Mitigations (Top 3)

1. **JSONBin configuration & CORS issues** → Mitigation: test endpoints early with a small sample payload and keep secrets out of version control.
2. **Flood-fill performance or logic bugs** → Mitigation: implement flood-fill with a queue and test small boards thoroughly before scaling up.
3. **State desync between engine and UI** → Mitigation: treat the serialized `Game` object as the single source of truth and always re-render from state after updates.
