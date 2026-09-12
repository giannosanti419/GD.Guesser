# GDLE

Geometry Dash level guessing game — static HTML/CSS/JavaScript MVP.

## Run
Open `index.html` in a modern browser. For best results, serve the folder with a tiny local server (for example VS Code Live Server).

## Features
- Guess the level
- Guess level + percentage
- Guess Extreme Demon position
- Player-selected timer (5–60 seconds)
- Daily section
- Pointercrate Demon List
- Extreme Demon search
- GD level search
- Automatic level metadata from public community APIs
- Automatic image endpoint attempts + generated local fallback card

## Important
The current public APIs are community services. Cache data and avoid excessive requests. Pointercrate states that its content may not be redistributed without permission, so if you publish GDLE publicly, check the terms of the services/assets you use.

The percentage mode currently uses a `percent` field if a source provides one; otherwise it uses a deterministic fallback. For a production-quality version, add a curated dataset of screenshot/progress pairs.
