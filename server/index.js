// Signaling + matchmaking server. It never touches video/audio: media flows
// browser-to-browser over WebRTC. This server only:
//   1. pairs strangers (matchmaker.js)
//   2. relays WebRTC "signals" (offer / answer / ICE candidates) between a pair
//   3. relays text chat (profanity-filtered) and records reports
import { createServer } from 'node:http'
import express from 'express'
import { Server } from 'socket.io'
import { Matchmaker } from './matchmaker.js'
import { cleanText, logReport, reviewFrame } from './moderation.js'

const PORT = Number(process.env.PORT) || 3001
const ORIGINS = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim())
const TRUST_PROXY = process.env.TRUST_PROXY === '1' // set on Render/Railway/Fly (they sit behind a proxy)
const MAX_SOCKETS_PER_IP = 10 // households, campuses and mobile carriers share IPs

// ---- ICE servers (STUN + optional TURN) -------------------------------------
// STUN tells each browser its public address; enough for most home networks.
// TURN relays the media when a direct path is impossible (strict NAT, some mobile
// carriers, corporate wifi). Sent to clients on request so creds live in one place.
const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
if (process.env.TURN_URLS) {
  ICE_SERVERS.push({
    urls: process.env.TURN_URLS.split(',').map((s) => s.trim()),
    username: process.env.TURN_USERNAME,
    credential: process.env.TURN_CREDENTIAL,
  })
}

// ---- Rate limiting ----------------------------------------------------------
// Fixed-window counter: `limit` hits per `windowMs` per key (IP).
// ponytail: all windows reset together and it's per-process; use Redis if you scale out.
function limiter(limit, windowMs) {
  const hits = new Map()
  setInterval(() => hits.clear(), windowMs).unref()
  return (key) => {
    const n = (hits.get(key) || 0) + 1
    hits.set(key, n)
    return n <= limit
  }
}
const limits = {
  connect: limiter(20, 60_000), // new socket connections
  find: limiter(40, 60_000), // re-queue (also fired automatically when a partner leaves)
  next: limiter(20, 60_000), // "Next" spam
  chat: limiter(20, 10_000),
  report: limiter(5, 60_000),
  frame: limiter(30, 60_000),
}

// ---- Server setup -----------------------------------------------------------
const app = express()
const server = createServer(app)
const io = new Server(server, { cors: { origin: ORIGINS }, maxHttpBufferSize: 200_000 })
const mm = new Matchmaker()
const socketsPerIp = new Map()

// Health check: free hosts ping this, and it's handy to wake a sleeping server.
app.get('/', (_req, res) => res.json({ ok: true, online: io.of('/').sockets.size }))

const clientIp = (socket) =>
  (TRUST_PROXY && socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim()) || socket.handshake.address

// Reject connection floods before a socket is created.
io.use((socket, next) => {
  const ip = clientIp(socket)
  socket.data.ip = ip
  if (!limits.connect(ip) || (socketsPerIp.get(ip) || 0) >= MAX_SOCKETS_PER_IP) return next(new Error('rate-limited'))
  next()
})

// Online count: broadcast every few seconds instead of on every connect,
// so 1000 users joining doesn't mean 1000 broadcasts to 1000 users.
let lastOnline = -1
setInterval(() => {
  const n = io.of('/').sockets.size
  if (n !== lastOnline) io.emit('online', (lastOnline = n))
}, 3000).unref()

io.on('connection', (socket) => {
  const { ip } = socket.data
  socketsPerIp.set(ip, (socketsPerIp.get(ip) || 0) + 1)
  socket.emit('online', io.of('/').sockets.size)

  const partnerOf = () => mm.partners.get(socket.id)

  // Returns false (and tells the client) when over the limit.
  const allowed = (name, what) => {
    if (limits[name](ip)) return true
    socket.emit('rate-limited', what)
    return false
  }

  // Leave the current pair/queue; the old partner is told and re-queues on their side.
  const leave = ({ avoid = false } = {}) => {
    const partner = mm.leave(socket.id)
    if (!partner) return
    if (avoid) mm.avoidPair(socket.id, partner)
    io.to(partner).emit('partner-left')
  }

  // Join the queue. If someone compatible is waiting, pair now.
  // The newcomer is the "initiator" (creates the WebRTC offer); the waiting user answers.
  const find = () => {
    const partner = mm.enqueue(socket.id)
    if (!partner) return
    socket.emit('matched', { initiator: true })
    io.to(partner).emit('matched', { initiator: false })
  }

  socket.on('ice', (ack) => typeof ack === 'function' && ack(ICE_SERVERS))

  socket.on('find', () => {
    leave()
    if (allowed('find', 'search')) find()
  })

  socket.on('next', () => {
    leave({ avoid: true }) // skipped people aren't re-matched for 10 minutes
    if (allowed('next', 'search')) find()
  })

  socket.on('stop', () => leave())

  // WebRTC signaling: opaque relay to the current partner only.
  socket.on('signal', (data) => {
    const partner = partnerOf()
    if (partner) io.to(partner).emit('signal', data)
  })

  // Text chat. The sender gets the filtered text back via ack, so both sides see the same thing.
  socket.on('chat', (text, ack) => {
    const partner = partnerOf()
    if (!partner || typeof text !== 'string' || !allowed('chat', 'chat')) return
    const clean = cleanText(text.slice(0, 500)).trim()
    if (!clean) return
    io.to(partner).emit('chat', clean)
    if (typeof ack === 'function') ack(clean)
  })

  socket.on('report', (reason) => {
    const partner = partnerOf()
    if (!partner || !allowed('report', 'report')) return
    logReport({
      reporter: socket.id,
      reported: partner,
      reportedIp: io.sockets.sockets.get(partner)?.data.ip,
      reason: String(reason ?? '').slice(0, 200),
    })
    leave({ avoid: true })
    find()
  })

  // Automated moderation hook (client sends nothing unless VITE_FRAME_SAMPLE_MS is set).
  socket.on('frame', async (jpeg) => {
    if (typeof jpeg !== 'string' || !limits.frame(ip)) return
    const verdict = await reviewFrame(socket.id, jpeg)
    if (verdict.ok) return
    logReport({ reporter: 'auto', reported: socket.id, reportedIp: ip, reason: verdict.reason })
    socket.disconnect(true)
  })

  socket.on('disconnect', () => {
    leave()
    mm.remove(socket.id)
    const n = socketsPerIp.get(ip) - 1
    n > 0 ? socketsPerIp.set(ip, n) : socketsPerIp.delete(ip)
  })
})

server.listen(PORT, () => console.log(`signaling server on :${PORT}, allowing ${ORIGINS.join(', ')}`))
