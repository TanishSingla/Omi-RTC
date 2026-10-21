// Run with: npm test
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { io } from 'socket.io-client'
import { Matchmaker } from './matchmaker.js'
import { cleanText } from './moderation.js'

test('matchmaker pairs, leaves, and avoids skipped users', () => {
  const mm = new Matchmaker({ avoidMs: 1000 })
  assert.equal(mm.enqueue('a', 0), null)
  assert.equal(mm.enqueue('b', 0), 'a')
  assert.equal(mm.partners.get('a'), 'b')

  assert.equal(mm.leave('a'), 'b')
  mm.avoidPair('a', 'b', 0)
  assert.equal(mm.enqueue('a', 10), null)
  assert.equal(mm.enqueue('b', 10), null, 'skipped pair must not re-match')
  assert.equal(mm.enqueue('c', 10), 'a', 'third user matches the oldest waiter')

  mm.leave('a'); mm.leave('b'); mm.leave('c')
  mm.enqueue('a', 2000)
  assert.equal(mm.enqueue('b', 2000), 'a', 'avoidance expires')
})

test('profanity filter masks whole words only', () => {
  assert.equal(cleanText('what the fuck, shitty'), 'what the ****, ******')
  assert.equal(cleanText('Scunthorpe classic dickens'), 'Scunthorpe classic dickens')
})

test('server: match, signal relay, chat filter, next, report', { timeout: 10_000 }, async (t) => {
  const port = 4000 + Math.floor(Math.random() * 1000)
  const reportLog = join(mkdtempSync(join(tmpdir(), 'omi-')), 'reports.log')
  const srv = spawn(process.execPath, ['index.js'], {
    cwd: import.meta.dirname,
    env: { ...process.env, PORT: String(port), REPORT_LOG: reportLog },
  })
  t.after(() => srv.kill())
  await new Promise((r) => srv.stdout.once('data', r))

  const url = `http://localhost:${port}`
  const connect = () => io(url, { transports: ['websocket'], extraHeaders: { origin: 'http://localhost:5173' } })
  const once = (s, ev) => new Promise((r) => s.once(ev, r))
  const [a, b, c] = [connect(), connect(), connect()]
  t.after(() => [a, b, c].forEach((s) => s.close()))
  await Promise.all([a, b, c].map((s) => once(s, 'connect')))

  // a and b both look for someone. Separate sockets have no ordering guarantee,
  // so either may arrive second; whoever does is the initiator. Exactly one must be.
  const aMatched = once(a, 'matched')
  const bMatched = once(b, 'matched')
  a.emit('find')
  b.emit('find')
  const [ma, mb] = await Promise.all([aMatched, bMatched])
  assert.notEqual(ma.initiator, mb.initiator, 'exactly one side makes the offer')

  // signals are relayed untouched
  const sig = once(a, 'signal')
  b.emit('signal', { description: { type: 'offer', sdp: 'x' } })
  assert.deepEqual(await sig, { description: { type: 'offer', sdp: 'x' } })

  // chat is filtered for both sides
  const got = once(a, 'chat')
  const echoed = await b.emitWithAck('chat', 'hi shit')
  assert.equal(echoed, 'hi ****')
  assert.equal(await got, 'hi ****')

  // b skips a (b re-queues); a is told. a and b must not re-match, so a waits too.
  const left = once(a, 'partner-left')
  b.emit('next')
  await left
  let aRematched = false
  a.once('matched', () => (aRematched = true))
  a.emit('find')
  await new Promise((r) => setTimeout(r, 200))
  assert.equal(aRematched, false, 'skipped pair must not re-match')
  // c arrives and gets the oldest waiter: b
  const bMatched2 = once(b, 'matched')
  c.emit('find')
  await bMatched2

  // report is written to the log with reporter + reported socket ids
  const reported = once(b, 'partner-left')
  c.emit('report', 'test')
  await reported
  await new Promise((r) => setTimeout(r, 100))
  const entry = JSON.parse(readFileSync(reportLog, 'utf8').trim())
  assert.equal(entry.reporter, c.id)
  assert.equal(entry.reported, b.id)
  assert.ok(entry.time)

  // "Next" spam gets rate-limited
  const limited = once(a, 'rate-limited')
  for (let i = 0; i < 25; i++) a.emit('next')
  assert.equal(await limited, 'search')
})
