import { useEffect, useState } from 'react'
import type { Mode } from '@/lib/useVideoChat'
import { Chat } from '@/pages/Chat'
import { Landing } from '@/pages/Landing'
import { Terms } from '@/pages/Terms'

// ponytail: two routes don't need a router. #/terms is the only URL; landing
// vs chat is plain state, so refreshing during a chat lands back on the age gate.
export default function App() {
  const [hash, setHash] = useState(location.hash)
  const [mode, setMode] = useState<Mode | null>(null)

  useEffect(() => {
    const onHash = () => setHash(location.hash)
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  if (hash === '#/terms') return <Terms />
  if (mode) return <Chat mode={mode} onExit={() => setMode(null)} />
  return <Landing onStart={setMode} />
}
