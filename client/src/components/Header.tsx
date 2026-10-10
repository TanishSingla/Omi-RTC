import { Badge } from '@/components/ui/badge'
import { useServerStatus } from '@/lib/socket'

export function Header({ onHome }: { onHome?: () => void }) {
  const { online, connected, error } = useServerStatus()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
      <a href="#" onClick={onHome} className="text-lg font-semibold tracking-tight">
        strangr<span className="text-emerald-400">.</span>
      </a>
      <Badge variant="outline" className="gap-2" title={error ?? undefined}>
        <span className={`size-2 rounded-full ${connected ? 'bg-emerald-400' : 'animate-pulse bg-amber-400'}`} />
        {connected ? `${online} online` : error === 'rate-limited' ? 'Too many connections' : 'Connecting to server…'}
      </Badge>
    </header>
  )
}
