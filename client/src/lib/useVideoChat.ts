// All the WebRTC + matchmaking logic, in one hook.
//
// The flow, in order:
//  1. getUserMedia()            -> our camera/mic stream (local preview)
//  2. socket 'find'             -> server puts us in the queue
//  3. socket 'matched'          -> server paired us. We create an RTCPeerConnection
//                                  and add our tracks to it.
//  4. initiator: createOffer()  -> setLocalDescription(offer) -> send offer via server
//     receiver:  gets offer     -> setRemoteDescription(offer) -> createAnswer()
//                                  -> setLocalDescription(answer) -> send answer back
//     initiator: gets answer    -> setRemoteDescription(answer)
//  5. Meanwhile both sides emit ICE candidates (possible network paths: local IP,
//     public IP found via STUN, TURN relay) and send them through the server.
//     The browser tries pairs of candidates until one works.
//  6. pc 'track' event          -> stranger's stream arrives, we show it.
//  From here media goes peer-to-peer; the server only relays chat and control events.
import { useEffect, useRef, useState } from 'react'
import { startFrameSampler } from './moderation'
import { socket } from './socket'

export type Status = 'idle' | 'searching' | 'connecting' | 'connected'
export type Message = { from: 'me' | 'stranger' | 'system'; text: string }
// random: Omegle-style queue. host: get a one-time room ID to share. join: use a friend's ID.
export type Mode = { type: 'random' } | { type: 'host' } | { type: 'join'; code: string }
type RoomResult = { code?: string; error?: string }
type Signal = { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }

const FALLBACK_ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

async function getMedia(): Promise<{ stream?: MediaStream; error?: string }> {
  // mediaDevices is undefined on plain http:// (except localhost).
  if (!navigator.mediaDevices?.getUserMedia) {
    return { error: 'Camera access needs a secure (https://) connection.' }
  }
  try {
    return { stream: await navigator.mediaDevices.getUserMedia({ video: true, audio: true }) }
  } catch (err) {
    const name = (err as DOMException).name
    const errors: Record<string, string> = {
      NotAllowedError: 'Camera/microphone permission was denied. Allow it from the icon in your address bar, then retry.',
      NotFoundError: 'No camera or microphone was found on this device.',
      NotReadableError: 'Your camera or microphone is being used by another app.',
    }
    return { error: errors[name] ?? `Could not start your camera (${name}).` }
  }
}

export function useVideoChat(mode: Mode) {
  const isPrivate = mode.type !== 'random'
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [messages, setMessages] = useState<Message[]>([])
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [roomCode, setRoomCode] = useState<string | null>(null) // host: the ID to share
  const [notice, setNotice] = useState<string | null>(null) // why a private call ended

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localRef = useRef<MediaStream | null>(null)
  const iceServers = useRef<RTCIceServer[]>(FALLBACK_ICE)
  // ICE candidates can arrive before the offer/answer is applied; park them until then.
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([])

  const addMessage = (from: Message['from'], text: string) => setMessages((m) => [...m, { from, text }])

  // Tear down the current call (not our camera).
  const closePeer = () => {
    if (pcRef.current) {
      pcRef.current.ontrack = pcRef.current.onicecandidate = pcRef.current.onconnectionstatechange = null
      pcRef.current.close()
      pcRef.current = null
    }
    pendingCandidates.current = []
    setRemoteStream(null)
  }

  // 'find' = join queue, 'next' = skip current stranger (won't be re-matched).
  // Clears the old conversation; callers may add a notice right after.
  const search = (event: 'find' | 'next') => {
    closePeer()
    setMessages([])
    setStatus('searching')
    socket.emit(event)
  }

  // Private calls don't fall back to random matching; they just end.
  const endCall = (reason: string) => {
    closePeer()
    setRoomCode(null)
    setStatus('idle')
    setNotice(reason)
  }

  // Step 2: random -> join the queue. host -> get a room ID. join -> enter the friend's room.
  const begin = async (isCancelled: () => boolean) => {
    setStatus('searching')
    // Buffered by Socket.IO until connected, so this also waits out a cold start.
    iceServers.current = await socket.emitWithAck('ice').catch(() => FALLBACK_ICE)
    if (isCancelled()) return
    if (mode.type === 'random') return search('find')
    const res: RoomResult =
      mode.type === 'host' ? await socket.emitWithAck('room:create') : await socket.emitWithAck('room:join', mode.code)
    if (isCancelled()) return
    if (res.error) endCall(res.error)
    else if (res.code) setRoomCode(res.code)
  }

  useEffect(() => {
    let cancelled = false

    // Step 3: we've been paired.
    const onMatched = async ({ initiator }: { initiator: boolean }) => {
      closePeer()
      setRoomCode(null) // the ID is used up now
      setStatus('connecting')
      addMessage('system', isPrivate ? 'Your friend joined. Say hi!' : "You're now chatting with a stranger. Say hi!")

      const pc = new RTCPeerConnection({ iceServers: iceServers.current })
      pcRef.current = pc
      const local = localRef.current
      local?.getTracks().forEach((track) => pc.addTrack(track, local))

      // Step 5: send each ICE candidate to the stranger as we discover it.
      pc.onicecandidate = (e) => e.candidate && socket.emit('signal', { candidate: e.candidate.toJSON() })
      // Step 6: the stranger's media arrived.
      pc.ontrack = (e) => setRemoteStream(e.streams[0])
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') setStatus('connected')
        // 'failed' = no candidate pair worked (often: strict NAT and no TURN configured).
        if (pc.connectionState === 'failed') {
          if (isPrivate) return endCall('Could not connect to your friend. One of your networks may block direct calls (needs a TURN server).')
          search('next')
          addMessage('system', 'Connection failed. Finding someone else…')
        }
      }

      // Step 4 (initiator side): create and send the offer.
      if (initiator) {
        try {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          socket.emit('signal', { description: pc.localDescription })
        } catch (err) {
          console.warn('offer error', err) // pc was closed mid-offer (user hit Next)
        }
      }
    }

    // Step 4/5: an offer, answer or ICE candidate from the stranger.
    const onSignal = async ({ description, candidate }: Signal) => {
      const pc = pcRef.current
      if (!pc) return
      try {
        if (description) {
          await pc.setRemoteDescription(description)
          if (description.type === 'offer') {
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            socket.emit('signal', { description: pc.localDescription })
          }
          for (const c of pendingCandidates.current.splice(0)) await pc.addIceCandidate(c)
        } else if (candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(candidate)
          else pendingCandidates.current.push(candidate)
        }
      } catch (err) {
        // Usually a signal for a call we already closed (e.g. after Next). Safe to ignore.
        console.warn('signal error', err)
      }
    }

    const onPartnerLeft = () => {
      if (isPrivate) return endCall('Your friend left the call.')
      search('find')
      addMessage('system', 'Stranger disconnected. Finding someone new…')
    }

    const onChat = (text: string) => addMessage('stranger', text)

    const onRateLimited = (what: string) => {
      if (what === 'search') {
        closePeer()
        setStatus('idle')
        addMessage('system', "You're skipping too fast. Wait a minute, then press Start.")
      } else {
        addMessage('system', `Slow down, too many ${what} requests.`)
      }
    }

    // Server restarted / network dropped: matchmaking state is gone, start over.
    const onDisconnect = () => {
      if (isPrivate) return endCall('Lost connection to the server.')
      closePeer()
      setStatus('idle')
      addMessage('system', 'Lost connection to the server. Press Start when it is back.')
    }

    socket.on('matched', onMatched)
    socket.on('signal', onSignal)
    socket.on('partner-left', onPartnerLeft)
    socket.on('chat', onChat)
    socket.on('rate-limited', onRateLimited)
    socket.on('disconnect', onDisconnect)

    // Step 1: camera first, so the preview shows even while the server is waking up.
    // Then fetch ICE servers (STUN/TURN config lives on the server) and do step 2.
    ;(async () => {
      const { stream, error } = await getMedia()
      if (cancelled) return stream?.getTracks().forEach((t) => t.stop())
      if (!stream) return setMediaError(error!)
      localRef.current = stream
      setLocalStream(stream)
      begin(() => cancelled)
    })()

    return () => {
      cancelled = true
      socket.off('matched', onMatched)
      socket.off('signal', onSignal)
      socket.off('partner-left', onPartnerLeft)
      socket.off('chat', onChat)
      socket.off('rate-limited', onRateLimited)
      socket.off('disconnect', onDisconnect)
      socket.emit('stop')
      closePeer()
      // Turn the camera light off when leaving the page.
      localRef.current?.getTracks().forEach((t) => t.stop())
      localRef.current = null
    }
    // Runs once per chat page. `mode` can't change while mounted (App remounts Chat for a new mode).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Optional automated-moderation sampling while in a call.
  useEffect(() => {
    if (status !== 'connected' || !localStream) return
    return startFrameSampler(localStream, (jpeg) => socket.emit('frame', jpeg))
  }, [status, localStream])

  return {
    localStream,
    remoteStream,
    mediaError,
    status,
    messages,
    micOn,
    camOn,
    isPrivate,
    roomCode,
    notice,

    async retryMedia() {
      setMediaError(null)
      const { stream, error } = await getMedia()
      if (!stream) return setMediaError(error!)
      localRef.current = stream
      setLocalStream(stream)
      begin(() => false)
    },
    start: () => search('find'),
    next: () => search('next'),
    stop() {
      closePeer()
      setStatus('idle')
      socket.emit('stop')
    },
    report() {
      const after = isPrivate ? 'The call will end.' : 'You will be moved to someone new.'
      if (!confirm(`Report this person for breaking the rules? ${after}`)) return
      socket.emit('report', 'user report')
      if (isPrivate) return endCall("Reported. Thanks, the call has ended.")
      search('find')
      setMessages([{ from: 'system', text: "Thanks, they've been reported and you won't be matched with them again." }])
    },
    sendChat(text: string) {
      // The server returns the profanity-filtered version, so we show exactly what they saw.
      socket.emit('chat', text, (clean: string) => addMessage('me', clean))
    },
    // Disabling a track keeps the connection but sends silence / black frames.
    toggleMic() {
      localRef.current?.getAudioTracks().forEach((t) => (t.enabled = !micOn))
      setMicOn(!micOn)
    },
    toggleCam() {
      localRef.current?.getVideoTracks().forEach((t) => (t.enabled = !camOn))
      setCamOn(!camOn)
    },
  }
}
