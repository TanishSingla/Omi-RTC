// Hook point for automated moderation. Off unless VITE_FRAME_SAMPLE_MS is set.
// Every N ms it grabs a tiny JPEG of the *local* camera and hands it to `send`,
// which forwards it to server/moderation.js -> reviewFrame(). Nothing is stored.
// ponytail: client-side sampling can be bypassed by a modified client; real
// enforcement needs server-side media (an SFU) or peer-side sampling + reports.
export function startFrameSampler(stream: MediaStream, send: (jpeg: string) => void) {
  const ms = Number(import.meta.env.VITE_FRAME_SAMPLE_MS)
  if (!ms) return () => {}

  const video = document.createElement('video')
  video.muted = true
  video.srcObject = stream
  video.play().catch(() => {})
  const canvas = Object.assign(document.createElement('canvas'), { width: 160, height: 120 })

  const id = setInterval(() => {
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    send(canvas.toDataURL('image/jpeg', 0.6))
  }, ms)

  return () => {
    clearInterval(id)
    video.srcObject = null
  }
}
