import { WebSocketTransport } from '@colyseus/ws-transport'
import { defineRoom, defineServer } from 'colyseus'

import { LobbyRoom } from './rooms/LobbyRoom.js'

/**
 * +1 Speed Titan Escape - multiplayer backend.
 *
 * Built for Bloxity Legion: listens on $PORT, answers GET /health fast, runs as a
 * non-root user in Docker (see Dockerfile) and drains on SIGTERM. HTTP matchmaking
 * and the WebSocket share the one port.
 */
const PORT = Number(process.env.PORT) || 2567

const server = defineServer({
  transport: new WebSocketTransport({ pingInterval: 8000, pingMaxRetries: 3 }),
  greet: false,
  gracefullyShutdown: true,
  rooms: {
    lobby: defineRoom(LobbyRoom),
  },
  express: (app) => {
    app.get('/health', (_req, res) => {
      res.status(200).json({ ok: true, pod: process.env.POD_NAME || 'local' })
    })
  },
})

await server.listen(PORT)
console.log(`[speed-titan] listening on :${PORT} (${process.env.BLOXITY_CHANNEL || 'local'})`)
