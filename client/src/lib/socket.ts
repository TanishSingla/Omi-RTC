import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'

export const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

// One socket for the whole app. Connecting on page load also lets the landing
// page show the online count (and wakes a sleeping free-tier server early).
export const socket = io(SERVER_URL, { transports: ['websocket'] })

// Kept at module level so components that mount later (e.g. the chat page's
// header) see the current values instead of starting from scratch.
let lastOnline = 0
let lastError: string | null = null
socket.on('online', (n: number) => (lastOnline = n))
socket.on('connect', () => (lastError = null))
socket.on('connect_error', (err) => {
  lastError = err.message
  // Socket.IO won't auto-retry when the server itself rejected us (e.g. rate limit). Retry slowly.
  if (!socket.active) setTimeout(() => socket.connect(), 10_000)
})

export function useServerStatus() {
  const [online, setOnline] = useState(lastOnline)
  const [connected, setConnected] = useState(socket.connected)
  const [error, setError] = useState(lastError)

  useEffect(() => {
    const onConnect = () => (setConnected(true), setError(null))
    const onDisconnect = () => setConnected(false)
    const onError = (err: Error) => setError(err.message)
    socket.on('online', setOnline)
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onError)
    return () => {
      socket.off('online', setOnline)
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onError)
    }
  }, [])

  return { online, connected, error }
}
