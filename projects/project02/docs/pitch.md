# Pitch

**Track:** Games

**Product (one line):** A local-first browser Minesweeper that feels like a real desktop app: fast, responsive, and persistent.

**Problem & User:** Casual players who want a no-install, no-account Minesweeper they can open in any modern browser, with their preferred difficulty and progress remembered between sessions.

**Core Loop (3–5 sentences):** 
The user chooses a difficulty, then reveals tiles on a grid while avoiding hidden mines. Empty tiles recursively reveal neighbors, and numbers indicate how many mines are adjacent. The player may flag suspected mines and continues revealing until they either trigger a mine (loss) or reveal all safe tiles (win). The app tracks run time, saves local high scores, and pushes results to a shared JSONBin leaderboard when network access is available.
