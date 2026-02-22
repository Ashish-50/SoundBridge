# Realtime Sync Player

Shared room audio: anyone on the same room URL gets synchronized play, pause, and seek.

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000` and share the generated room URL or QR code with others.

## Notes
- Use any public MP3/OGG/WAV URL.
- The latest play/pause/seek event becomes the room state and is broadcast to all participants.

## Environment
Edit `.env` to set runtime values:
- `PORT`: HTTP port (default `3000`)
- `NODE_ENV`: `production` or `development`
- `PUBLIC_BASE_URL`: public base URL used for QR links (e.g. `https://your-domain.com`)
- `TRUST_PROXY`: `true` when running behind a reverse proxy or load balancer
- `DEFAULT_TRACK_URL`: default public audio track used when a room has no track

## Docker
Build and run locally:
```bash
docker build -t realtime-sync-player .
docker run --env-file .env -p 3000:3000 realtime-sync-player
```

## Deploy (generic)
1. Build the Docker image and push it to a registry (or build on the server).
2. Run the container with `--env-file .env` and map port `3000`.
3. Put a reverse proxy (Nginx/Caddy) in front if you need HTTPS and a custom domain.

If you already have a host in mind, tell me which one and I’ll tailor the exact steps.

## Deployed URL
```bash
https://soundbridge-tean.onrender.com/room/9mhj2m
```

