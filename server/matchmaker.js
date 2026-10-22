// In-memory matchmaking. Knows nothing about sockets, so it's easy to test and
// easy to swap for Redis later (see README "Scaling").
//
// ponytail: single process only. Two server instances would each have their own
// queue; move this state to Redis when you need more than one instance.
import { randomInt } from 'node:crypto'

// Room codes skip look-alike characters (0/O, 1/I/L) so they're easy to read out.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export class Matchmaker {
  constructor({ avoidMs = 10 * 60_000 } = {}) {
    this.queue = [] // socket ids waiting for a partner, oldest first
    this.partners = new Map() // id -> partner id. Each pair is a private "room" of two.
    this.avoid = new Map() // id -> Map(otherId -> expiresAt): people this id skipped/reported
    this.avoidMs = avoidMs
    this.rooms = new Map() // private room code -> host id, waiting for exactly one guest
    this.roomOf = new Map() // host id -> their open room code
  }

  // Put `id` in the queue, or pair it with the first compatible waiting user.
  // Returns the partner id, or null if `id` is now waiting.
  // ponytail: O(n) scan of the queue, fine for thousands of waiting users.
  enqueue(id, now = Date.now()) {
    if (this.partners.has(id) || this.queue.includes(id)) return this.partners.get(id) ?? null
    const i = this.queue.findIndex((other) => !this.isAvoided(id, other, now))
    if (i === -1) {
      this.queue.push(id)
      return null
    }
    const [partner] = this.queue.splice(i, 1)
    this.pair(id, partner)
    return partner
  }

  pair(a, b) {
    this.partners.set(a, b)
    this.partners.set(b, a)
  }

  // Private rooms: the host gets a one-time code; the first guest to use it is paired
  // with the host and the code is deleted, so a room never holds more than 2 people.
  // Returns null if `id` is already in a call or already holds an open code.
  createRoom(id) {
    if (this.partners.has(id) || this.roomOf.has(id)) return null
    this.queue = this.queue.filter((q) => q !== id)
    let code
    do code = Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('')
    while (this.rooms.has(code))
    this.rooms.set(code, id)
    this.roomOf.set(id, code)
    return code
  }

  // Returns { host } on success or { error }. Caller must have made `id` leave() first.
  joinRoom(code, id) {
    const host = this.rooms.get(code)
    if (!host) return { error: 'Room not found. It may have been used already or closed.' }
    this.closeRoom(host)
    this.pair(host, id)
    return { host }
  }

  closeRoom(id) {
    this.rooms.delete(this.roomOf.get(id))
    this.roomOf.delete(id)
  }

  // Leave the queue, the current pair, and close any open room. Returns the old partner id (or null).
  leave(id) {
    this.queue = this.queue.filter((q) => q !== id)
    this.closeRoom(id)
    const partner = this.partners.get(id) ?? null
    if (partner) {
      this.partners.delete(id)
      this.partners.delete(partner)
    }
    return partner
  }

  // Don't re-match these two for a while (both directions).
  avoidPair(a, b, now = Date.now()) {
    for (const [x, y] of [[a, b], [b, a]]) {
      if (!this.avoid.has(x)) this.avoid.set(x, new Map())
      this.avoid.get(x).set(y, now + this.avoidMs)
    }
  }

  isAvoided(a, b, now = Date.now()) {
    return [[a, b], [b, a]].some(([x, y]) => {
      const exp = this.avoid.get(x)?.get(y)
      if (exp === undefined) return false
      if (exp > now) return true
      this.avoid.get(x).delete(y) // expired, clean up lazily
      return false
    })
  }

  // Socket disconnected for good.
  // ponytail: other users' avoid maps keep this id until they expire; harmless at MVP scale.
  remove(id) {
    const partner = this.leave(id)
    this.avoid.delete(id)
    return partner
  }
}
