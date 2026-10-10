import { useEffect, useState } from 'react'
import { Chat } from '@/pages/Chat'
import { Landing } from '@/pages/Landing'
import { Terms } from '@/pages/Terms'

// ponytail: two routes don't need a router. #/terms is the only URL; landing
// vs chat is plain state, so refreshing during a chat lands back on the age gate.
export default function App() {
  const [hash, setHash] = useState(location.hash)
  const [chatting, setChatting] = useState(false)

  useEffect(() => {
    const onHash = () => setHash(location.hash)
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  if (hash === '#/terms') return <Terms />
  if (chatting) return <Chat onExit={() => setChatting(false)} />
  return <Landing onStart={() => setChatting(true)} />
}
