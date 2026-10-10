import { useEffect, useRef, useState } from 'react'
import { CameraOff, Flag, Loader2, Mic, MicOff, Play, Send, SkipForward, Square, Video, VideoOff } from 'lucide-react'
import { Header } from '@/components/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useVideoChat, type Message } from '@/lib/useVideoChat'
import { cn } from '@/lib/utils'

function VideoView({ stream, muted, className }: { stream: MediaStream | null; muted?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])
  // playsInline: without it iOS Safari forces fullscreen playback.
  return <video ref={ref} autoPlay playsInline muted={muted} className={cn('size-full object-cover', className)} />
}

export function Chat({ onExit }: { onExit: () => void }) {
  const chat = useVideoChat()
  const { status, mediaError } = chat
  const inCall = status === 'connecting' || status === 'connected'

  return (
    <div className="flex h-dvh flex-col">
      <Header onHome={onExit} />
      <main className="grid min-h-0 flex-1 grid-rows-[1fr_auto] gap-3 p-3 lg:grid-cols-[1fr_360px] lg:grid-rows-1">
        <section className="flex min-h-0 flex-col gap-3">
          {/* Stranger's video, with ours picture-in-picture */}
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border bg-black">
            {chat.remoteStream && <VideoView stream={chat.remoteStream} />}

            {!chat.remoteStream && (
              <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground">
                {mediaError ? (
                  <div className="max-w-xs space-y-3">
                    <CameraOff className="mx-auto size-8 text-destructive" />
                    <p>{mediaError}</p>
                    <Button variant="outline" onClick={chat.retryMedia}>
                      Try again
                    </Button>
                  </div>
                ) : status === 'idle' ? (
                  <p>Press Start to meet someone new.</p>
                ) : (
                  <p className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    {status === 'searching' ? 'Looking for a stranger…' : 'Connecting…'}
                  </p>
                )}
              </div>
            )}

            {chat.localStream && (
              <div className="absolute right-3 bottom-3 aspect-[3/4] w-24 overflow-hidden rounded-lg border-2 border-background shadow-lg sm:aspect-video sm:w-44">
                {/* Mirrored so it feels like a mirror; the stranger sees it un-mirrored. */}
                <VideoView stream={chat.localStream} muted className="-scale-x-100" />
                {!chat.camOn && (
                  <div className="absolute inset-0 grid place-items-center bg-muted">
                    <VideoOff className="size-5 text-muted-foreground" />
                  </div>
                )}
              </div>
            )}
          </div>

          <Controls chat={chat} disabled={!chat.localStream} />
        </section>

        <ChatPanel messages={chat.messages} onSend={chat.sendChat} enabled={inCall} />
      </main>
    </div>
  )
}

function Controls({ chat, disabled }: { chat: ReturnType<typeof useVideoChat>; disabled: boolean }) {
  const idle = chat.status === 'idle'
  const inCall = chat.status === 'connecting' || chat.status === 'connected'
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {idle ? (
        <Button size="lg" className="h-11 min-w-28" onClick={chat.start} disabled={disabled}>
          <Play /> Start
        </Button>
      ) : (
        <Button size="lg" className="h-11 min-w-28" onClick={chat.next} disabled={disabled}>
          <SkipForward /> Next
        </Button>
      )}
      <Button size="lg" variant="secondary" className="h-11" onClick={chat.stop} disabled={disabled || idle}>
        <Square /> <span className="hidden sm:inline">Stop</span>
      </Button>
      <Button
        size="icon-lg"
        variant={chat.micOn ? 'secondary' : 'destructive'}
        className="size-11"
        onClick={chat.toggleMic}
        disabled={disabled}
        aria-label={chat.micOn ? 'Mute microphone' : 'Unmute microphone'}
      >
        {chat.micOn ? <Mic /> : <MicOff />}
      </Button>
      <Button
        size="icon-lg"
        variant={chat.camOn ? 'secondary' : 'destructive'}
        className="size-11"
        onClick={chat.toggleCam}
        disabled={disabled}
        aria-label={chat.camOn ? 'Turn camera off' : 'Turn camera on'}
      >
        {chat.camOn ? <Video /> : <VideoOff />}
      </Button>
      <Button size="lg" variant="destructive" className="h-11" onClick={chat.report} disabled={!inCall}>
        <Flag /> <span className="hidden sm:inline">Report</span>
      </Button>
    </div>
  )
}

function ChatPanel({ messages, onSend, enabled }: { messages: Message[]; onSend: (t: string) => void; enabled: boolean }) {
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  return (
    <aside className="flex h-56 min-h-0 flex-col overflow-hidden rounded-xl border bg-card lg:h-auto">
      <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
        {messages.map((m, i) =>
          m.from === 'system' ? (
            <p key={i} className="text-center text-xs text-muted-foreground">
              {m.text}
            </p>
          ) : (
            <p
              key={i}
              className={cn(
                'w-fit max-w-[85%] rounded-2xl px-3 py-1.5 break-words',
                m.from === 'me' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted',
              )}
            >
              {m.text}
            </p>
          ),
        )}
        <div ref={endRef} />
      </div>
      <form
        className="flex gap-2 border-t p-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          onSend(text.trim())
          setText('')
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder={enabled ? 'Type a message…' : 'Waiting for a stranger…'}
          disabled={!enabled}
          aria-label="Message"
        />
        <Button type="submit" size="icon" disabled={!enabled || !text.trim()} aria-label="Send">
          <Send />
        </Button>
      </form>
    </aside>
  )
}
