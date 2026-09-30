# +1 Speed Titan Escape — multiplayer server

Colyseus 0.18 backend for Bloxity Legion (game id `speed-titan-escape`).

- One room type, `lobby`, holding up to **8 players**. When a lobby is full the
  next player gets a new lobby automatically.
- Relay model: each client streams its own position/animation state (12 Hz); the
  room broadcasts a compact snapshot of everyone (10 Hz). Profiles (name, avatar,
  hero, sword, level, stats for the lobby boards) are sent on join and when they change.
  Every incoming value is clamped or sanitised before it's forwarded.
- `GET /health` → 200 for Legion's probes. Listens on `$PORT` (default 2567).

```bash
npm install
npm run dev        # ws://localhost:2567, auto-restarts on change
```

## Deploying

`.github/workflows/deploy.yml` builds the Docker image, pushes it to GHCR and calls
the Legion deploy API: `dev` branch → dev channel, `main` → prod.

1. In the GitHub repo settings add the secret **`LEGION_DEPLOY_TOKEN`**.
2. Push to `dev`. After the first run, make the GHCR package public
   (repo → Packages → Package settings → Change visibility).

`seatCap` is 48 (six 8-player lobbies per pod), `maxReplicas` 5.
