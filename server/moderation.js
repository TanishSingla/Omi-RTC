// Everything moderation-related lives here, so adding real automated moderation
// later means editing this file, not the socket wiring.
import { appendFile } from 'node:fs/promises'

const REPORT_LOG = process.env.REPORT_LOG || 'reports.log'

// ---- Profanity filter -------------------------------------------------------
// ponytail: tiny word list + whole-word match. Won't catch l33tspeak or spacing
// tricks; swap in a maintained list (or an ML classifier) if that matters.
const WORDS = [
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'asshole', 'bastard',
  'slut', 'whore', 'nigger', 'nigga', 'faggot', 'fag', 'retard', 'motherfucker',
]
const PROFANITY = new RegExp(`\\b(${WORDS.join('|')})(s|es|er|ers|ed|ing|y|ty|head)?\\b`, 'gi')

export const cleanText = (text) => text.replace(PROFANITY, (m) => '*'.repeat(m.length))

// ---- Reports ----------------------------------------------------------------
// One JSON object per line. Also printed so it shows up in your host's log viewer
// (free hosts like Render have ephemeral disks: the file is lost on redeploy).
export async function logReport(report) {
  const line = JSON.stringify({ time: new Date().toISOString(), ...report })
  console.log('[report]', line)
  await appendFile(REPORT_LOG, line + '\n').catch((err) => console.error('report log failed', err))
}

// ---- Automated moderation hook ---------------------------------------------
// The client sends a small JPEG of its own camera every VITE_FRAME_SAMPLE_MS ms
// (off by default, see client/src/lib/moderation.ts). Plug a classifier in here
// (e.g. a self-hosted NSFW model). Frames are only inspected in memory, never stored.
// Return { ok: false, reason } to flag the user.
export async function reviewFrame(_socketId, _jpegDataUrl) {
  return { ok: true }
}
