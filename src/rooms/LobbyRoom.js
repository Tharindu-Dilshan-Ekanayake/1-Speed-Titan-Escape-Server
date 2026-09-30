import { Room } from 'colyseus'

/**
 * One shared world for up to 8 players. Matchmaking fills a lobby to 8, then opens
 * the next one (Colyseus `joinOrCreate` does this on its own).
 *
 * The game is movement-heavy and cooperative-ish, so the server relays rather than
 * simulates: each client streams its own pose, the room collects the latest one per
 * player and broadcasts a compact snapshot 10 times a second. Profiles (name,
 * avatar, hero, sword, stats for the boards) travel separately and rarely.
 *
 * Message protocol (all msgpack):
 *   client -> server
 *     's'  pose:    [x, y, z, yaw, speed, flags, world, stage]
 *     'p'  profile: partial profile patch (see PROFILE_FIELDS)
 *     'fx' effect:  { k: 'jump' | 'win' | 'levelup' | 'rebirth' | 'grapple' | 'death' }
 *   server -> client
 *     'roster' full profiles of everyone already here (on join)
 *     'join'   one profile      'leave' { id }      'prof' { id, ...patch }
 *     'snap'   [[id, x, y, z, yaw, speed, flags, world, stage], ...]
 *     'fx'     { id, k }
 */

const SNAPSHOT_MS = 100
const MAX_NAME = 24

const NUMBER_FIELDS = ['level', 'rebirths', 'bestSpeed', 'totalWins', 'playtime']
const STRING_FIELDS = ['name', 'hero', 'weapon', 'userId']
const FX_KINDS = new Set(['jump', 'win', 'levelup', 'rebirth', 'grapple', 'death'])

const finite = (v, lo, hi, fallback = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback
}
const text = (v, max = MAX_NAME) => (typeof v === 'string' ? v.slice(0, max) : '')

/** Bloxity avatar: equipped ids (short strings) + proportions (numbers). */
function cleanAvatar(avatar) {
  if (!avatar || typeof avatar !== 'object') return null
  const equipped = {}
  for (const [k, v] of Object.entries(avatar.equipped || {}).slice(0, 12)) {
    if (/^[a-zA-Z]{2,12}$/.test(k)) equipped[k] = text(String(v ?? ''), 40)
  }
  const proportions = {}
  for (const [k, v] of Object.entries(avatar.proportions || {}).slice(0, 12)) {
    if (/^[a-zA-Z]{2,20}$/.test(k)) proportions[k] = finite(v, 0.5, 2, 1)
  }
  return { equipped, proportions }
}

function cleanProfile(patch) {
  const out = {}
  if (!patch || typeof patch !== 'object') return out
  for (const f of STRING_FIELDS) if (f in patch) out[f] = text(patch[f], f === 'userId' ? 64 : MAX_NAME)
  for (const f of NUMBER_FIELDS) if (f in patch) out[f] = finite(patch[f], 0, 1e15)
  if ('avatar' in patch) out.avatar = cleanAvatar(patch.avatar)
  return out
}

export class LobbyRoom extends Room {
  maxClients = 8
  /** Keep a short grace period so a quick reconnect lands back in the same lobby. */
  autoDispose = true
  maxMessagesPerSecond = 60

  onCreate() {
    /** sessionId -> { profile, pose } */
    this.players = new Map()

    this.onMessage('s', (client, m) => {
      const p = this.players.get(client.sessionId)
      if (!p || !Array.isArray(m) || m.length < 8) return
      p.pose = [
        finite(m[0], -1e5, 1e5),
        finite(m[1], -500, 500),
        finite(m[2], -1e5, 1e5),
        finite(m[3], -10, 10),
        finite(m[4], 0, 200),
        finite(m[5], 0, 255) | 0,
        finite(m[6], 1, 2, 1) | 0,
        finite(m[7], 0, 99) | 0,
      ]
    })

    this.onMessage('p', (client, m) => {
      const p = this.players.get(client.sessionId)
      if (!p) return
      const patch = cleanProfile(m)
      if (!Object.keys(patch).length) return
      Object.assign(p.profile, patch)
      this.broadcast('prof', { id: client.sessionId, ...patch }, { except: client })
    })

    this.onMessage('fx', (client, m) => {
      if (!m || !FX_KINDS.has(m.k)) return
      this.broadcast('fx', { id: client.sessionId, k: m.k }, { except: client })
    })

    this.clock.setInterval(() => this.broadcastSnapshot(), SNAPSHOT_MS)
  }

  onJoin(client, options) {
    const profile = { id: client.sessionId, name: 'Guest', hero: 'avatar', weapon: 'blades', ...cleanProfile(options) }
    if (!profile.name) profile.name = 'Guest'
    client.send(
      'roster',
      [...this.players.values()].map((p) => p.profile),
    )
    this.players.set(client.sessionId, { profile, pose: null })
    this.broadcast('join', profile, { except: client })
  }

  onLeave(client) {
    this.players.delete(client.sessionId)
    this.broadcast('leave', { id: client.sessionId })
  }

  broadcastSnapshot() {
    if (this.players.size < 2) return
    const snap = []
    for (const [id, p] of this.players) if (p.pose) snap.push([id, ...p.pose])
    if (snap.length) this.broadcast('snap', snap)
  }
}
