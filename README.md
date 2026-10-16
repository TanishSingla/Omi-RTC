# strangr

A free, open-source random 1-on-1 video chat (Omegle-style). React + Vite + shadcn/ui on the front, Node + Express + Socket.IO for signaling, and native browser WebRTC for the video. It costs $0 to run.

```
client/                     React app (Vite, Tailwind v4, shadcn/ui, dark theme)
  src/lib/useVideoChat.ts   ← all WebRTC + matchmaking logic (start reading here)
  src/lib/socket.ts         the single Socket.IO connection + online count
  src/lib/moderation.ts     optional frame-sampling hook (off by default)
  src/pages/                Landing (age gate), Chat, Terms
  src/components/ui/        shadcn components
server/
  index.js                  Socket.IO signaling, rate limits, chat relay, reports
  matchmaker.js             in-memory queue, pairs, skip/report avoidance
  moderation.js             profanity filter, report log, reviewFrame() hook
  test.js                   unit + end-to-end socket test (npm test)
```

## Run locally

Requirements: Node 22 or newer.

```bash
npm install      # installs root, server/ and client/
npm run dev      # starts both: server :3001 + client :5173
```

Or run each one separately:

```bash
# 1. server
cd server
npm install
cp .env.example .env        # optional, the defaults work locally
npm run dev                 # http://localhost:3001

# 2. client (second terminal)
cd client
npm install
cp .env.example .env.local  # optional
npm run dev                 # http://localhost:5173
```

Open http://localhost:5173 in **two browser windows** (for example a normal window and an incognito one), tick the 18+ box in both, and press Start. You should see each other.

`cd server && npm test` runs the matchmaker, the profanity filter, and a real two-client socket session (match, signal relay, chat filter, skip, report, rate limit).

## How the WebRTC flow works

The server never touches audio or video. It only introduces two browsers to each other. After that, media flows directly between them.

```
 Browser A (initiator)            Server              Browser B (receiver)
  getUserMedia()                                       getUserMedia()
  emit 'find'  ──────────────────▶ queue  ◀─────────── emit 'find'
               ◀── 'matched' {initiator:true}  'matched' {initiator:false} ──▶
  new RTCPeerConnection + addTrack                     new RTCPeerConnection + addTrack
  createOffer → setLocalDescription
  'signal' {offer}  ─────────────▶ relay ────────────▶ setRemoteDescription(offer)
                                                       createAnswer → setLocalDescription
  setRemoteDescription(answer) ◀── relay ◀──────────── 'signal' {answer}
  'signal' {candidate} ◀────────▶ relay ◀────────────▶ 'signal' {candidate}  (both ways)
  ════════════════ peer-to-peer audio/video (DTLS-SRTP encrypted) ═════════════════
```

- **Offer/answer (SDP)**: each side describes the codecs and media it can send. Only one side makes the offer. The server picks that side (the one who joined the queue last), which avoids "glare" (both sides offering at once).
- **ICE candidates** are possible network addresses: your LAN IP, your public IP (found with **STUN**), or a **TURN** relay address. Both sides swap them and the browser tries pairs until one connects. Candidates can arrive before the offer/answer has been applied, so `useVideoChat.ts` queues them in `pendingCandidates`.
- **`connectionState === 'failed'`** means no pair worked. The app moves on to the next stranger. This usually means one side is behind a strict NAT and you haven't configured TURN.
- **Text chat** goes over Socket.IO rather than a data channel so the server can filter profanity and rate-limit it.
- **Mute/camera off** set `track.enabled = false`, which sends silence or black frames without renegotiating.
- **Cleanup**: on Next/Stop/partner-left we `pc.close()`. When you leave the chat page we also `track.stop()` every local track, so the camera light turns off.

## Private rooms (call a friend)

Besides random matching, two people can meet on purpose:

1. One person clicks **Generate room ID** and gets a one-time code like `K7Q2XM` with a Copy button.
2. They share it. The friend types it into **Enter room ID** and clicks **Join**.
3. Both are connected 1-on-1. From here it's the same WebRTC flow and the same chat, mute and report controls.

Rules, enforced on the server (`server/matchmaker.js` `createRoom`/`joinRoom`):
- **Single use, 2 people max**: the code is deleted the moment someone joins, so a third person gets "Room not found".
- **One room per person**: you can't generate a new ID while you're in a call or already have an open one.
- **No random fallback**: Next is hidden. When either person leaves, the call ends for both, and the room closes if the host leaves before anyone joins.
- Codes use 6 characters from a 31-character alphabet without look-alikes (no 0/O, 1/I/L), which gives about 887 million combinations. `room:create`/`room:join` are limited to 10 attempts per minute per IP, so guessing codes isn't practical.

## Safety features

| Feature | Where |
|---|---|
| 18+ age gate + rules before starting | `client/src/pages/Landing.tsx` |
| Terms, Community Guidelines, Privacy | `client/src/pages/Terms.tsx` (`/#/terms`) |
| Report → JSON line in `reports.log` (time, reporter id, reported id, reported IP, reason) | `server/moderation.js` `logReport` |
| Skipped/reported users aren't re-matched for 10 minutes (both directions) | `server/matchmaker.js` `avoidPair` |
| Per-IP rate limits: connections (20/min, max 5 at once), Next (20/min), find (40/min), chat (20/10s), reports (5/min) | `server/index.js` `limits` |
| Profanity filter, applied server-side so clients can't skip it | `server/moderation.js` `cleanText` |
| No recording: media is peer-to-peer and the server has no media code | by design |
| Automated moderation hook: set `VITE_FRAME_SAMPLE_MS=5000` and the client sends a 160×120 JPEG of its own camera to `reviewFrame()` every 5 s. Return `{ ok: false }` there to log and disconnect the user. Frames are only checked in memory, never stored. | `client/src/lib/moderation.ts`, `server/moderation.js` |

## STUN and TURN

- **STUN** (Google's free public servers, always on) lets each browser learn its public IP. That's enough for roughly 80–90% of connections.
- **TURN** relays the media when a direct connection is impossible: symmetric NATs, many mobile carriers, corporate or school Wi-Fi. Without TURN, those users just get "Connection failed". The relay sees only encrypted packets.

TURN is configured on the server (`TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`) and sent to clients via the `ice` socket event. Free options:

1. **Metered "Open Relay"**: sign up free at metered.ca and copy the TURN URLs and credentials from the dashboard into the env vars. The free tier has a small monthly bandwidth cap (around 20 GB when this was written; check their current plan). Video uses roughly 1–2 GB per relayed hour, so this suits testing and small launches only.
2. **Cloudflare Realtime TURN**: a generous free allowance, but it issues short-lived credentials from an API. You'd generate them in the server's `ice` handler instead of reading static env vars (a small change).
3. **Self-hosted coturn** on a free VM (for example Oracle Cloud Always Free). There's no bandwidth bill up to the VM's allowance:
   ```bash
   sudo apt install coturn
   # /etc/turnserver.conf
   listening-port=3478
   fingerprint
   lt-cred-mech
   user=strangr:CHANGE_ME
   realm=yourdomain.com
   external-ip=<VM public IP>
   min-port=49152
   max-port=65535
   # open UDP/TCP 3478 and UDP 49152-65535 in the VM firewall/security list
   sudo systemctl enable --now coturn
   ```
   Then set `TURN_URLS=turn:<VM IP>:3478`, `TURN_USERNAME=strangr`, `TURN_CREDENTIAL=CHANGE_ME`.

TURN credentials sent to browsers are always visible to users. That's normal, and it's why the free tiers cap bandwidth.

## Free deployment

### Backend → Render (free web service)

1. Push this repo to GitHub.
2. On render.com: New → Web Service, pick the repo.
   - Root directory: `server`
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance type: Free
3. Environment variables: `CLIENT_ORIGIN=https://<your-frontend-domain>`, `TRUST_PROXY=1`, plus the TURN vars if you have them.
4. Note the URL, for example `https://strangr-server.onrender.com`. Opening it should return `{"ok":true,...}`.

Render free-tier limits:
- The service **sleeps after about 15 minutes without traffic**. The next visitor waits roughly 30–60 seconds while it wakes; the header shows "Connecting to server…" until then. A free uptime pinger (UptimeRobot, cron-job.org) hitting `/` every 10 minutes keeps it awake, but that uses up the free instance hours (about 750/month, enough for one always-on service).
- The disk is ephemeral, so `reports.log` is wiped on every deploy or restart. Reports are also printed to stdout, so they appear in Render's Logs tab. For permanent storage, send them to a free database (Supabase or Neon free tier).
- WebSockets are supported. There's a single instance, which is fine because state is in memory.

Other hosts: **Railway** now gives only a one-off trial credit, and **Fly.io** no longer has a free tier for new accounts. Both work with the same settings (`npm start`, `TRUST_PROXY=1`) but aren't guaranteed $0. Koyeb's free instance is another option, with similar sleep behaviour.

### Frontend → Vercel / Netlify / Cloudflare Pages

- Root directory: `client`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `VITE_SERVER_URL=https://strangr-server.onrender.com`

The app uses hash URLs (`/#/terms`), so no SPA rewrite rules are needed. After the first deploy, put the frontend URL into the server's `CLIENT_ORIGIN` and redeploy the server.

## HTTPS and testing on two devices

Browsers only allow camera access on **https://** or **http://localhost**. `navigator.mediaDevices` doesn't exist on plain `http://192.168.x.x`, and the app shows a "needs a secure connection" message.

- **Same computer**: two windows on `localhost:5173` work as is.
- **Phone + laptop on your LAN**: tunnel both ports over HTTPS. For example, with `cloudflared` (free, no account needed):
  ```bash
  cloudflared tunnel --url http://localhost:3001   # copy the https URL → client/.env.local VITE_SERVER_URL
  cloudflared tunnel --url http://localhost:5173   # open this https URL on both devices
  ```
  Also add the frontend tunnel URL to the server's `CLIENT_ORIGIN`, and add `server: { allowedHosts: true }` to `vite.config.ts` so Vite accepts the tunnel hostname.
- **Production**: Vercel/Netlify/Pages and Render all give you HTTPS automatically.
- Phone on mobile data plus laptop on Wi-Fi is the real NAT test. If that fails with "Connection failed", you need TURN.

## Known limitations, and how to scale later

- **One server process.** The queue, pairs, rate limits and avoid lists all live in memory. To run several instances, move them to Redis (free tier at Upstash) and add `@socket.io/redis-adapter`.
- **Socket IDs aren't identities.** Skip/report avoidance is per session, so a reload gets a fresh ID. Bans need an IP- or account-based ban list (the reported IP is already logged).
- **The age gate is self-declared.** Real age assurance needs a third-party provider.
- **The profanity filter is a small word list** and is easy to evade. Swap in a maintained list or a text classifier.
- **Client-side frame sampling can be bypassed** by a modified client. Strong moderation needs the media routed through an SFU (for example a self-hosted LiveKit or mediasoup) where the server can sample frames, and that costs real bandwidth.
- **Peers see each other's IP address**, as in any peer-to-peer call. Forcing TURN-only (`iceTransportPolicy: 'relay'`) hides it but sends all traffic through the relay.
- **No interests or language matching.** Add a tag to `find` and keep one queue per tag in `matchmaker.js`.
- **Reports aren't durable on free hosts.** Write them to Postgres or SQLite on a persistent volume, and build a small admin view.
- **Scaling cost** is mostly TURN bandwidth, because signaling is tiny. One small Node instance can handle thousands of concurrent users.
