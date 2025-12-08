# JSONBin Schema & Merge Policy

## Schema

The JSONBin document stores a shared leaderboard under the `highScores` key.

- `highScores`: array of high score records
  - `name` (string): player name (e.g., "Alice")
  - `timeSeconds` (number): elapsed game time in seconds
  - `rows` (number): board row count
  - `cols` (number): board column count
  - `mines` (number): mine count for this run
  - `timestamp` (number): Unix epoch in milliseconds when the run completed

## Example

PUT payload (truncated):

```json
{
  "highScores": [
    {
      "name": "Alice",
      "timeSeconds": 42.13,
      "rows": 9,
      "cols": 9,
      "mines": 10,
      "timestamp": 1733619200000
    },
    {
      "name": "Bob",
      "timeSeconds": 55.01,
      "rows": 16,
      "cols": 16,
      "mines": 40,
      "timestamp": 1733620000000
    }
  ]
}
```

## Merge Policy

- The client **fetches the latest document**, appends the new high score, sorts by `timeSeconds` ascending, and keeps the **top 20** entries.
- This is effectively **last-write-wins per record**, but stable due to deterministic sorting (fastest times rank highest).
- Local high scores (stored in `localStorage`) are also merged on read to provide a combined view in the UI even if JSONBin is unreachable.
