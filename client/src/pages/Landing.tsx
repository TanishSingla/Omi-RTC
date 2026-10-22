import { useState } from 'react'
import { LogIn, Plus, ShieldCheck, Video } from 'lucide-react'
import { Header } from '@/components/Header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Mode } from '@/lib/useVideoChat'

const RULES = [
  'You must be 18 or older.',
  'No nudity, sexual content, or harassment.',
  'No hate speech, threats, or illegal content.',
  "Don't share personal info: yours or anyone else's.",
  'Use Report on anyone breaking the rules.',
]

export function Landing({ onStart }: { onStart: (mode: Mode) => void }) {
  const [agreed, setAgreed] = useState(false)
  const [code, setCode] = useState('')

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">Talk to strangers, face to face.</CardTitle>
            <CardDescription>
              Random 1-on-1 video chat. Calls are peer-to-peer and never recorded.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="size-4 text-emerald-400" /> House rules
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {RULES.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>

            <Label className="items-start gap-3 text-sm leading-snug font-normal">
              <Checkbox checked={agreed} onCheckedChange={setAgreed} className="mt-0.5" />
              <span>
                I confirm I am <strong>18 or older</strong> and agree to the{' '}
                <a href="#/terms" className="underline underline-offset-4">
                  Terms & Community Guidelines
                </a>
                .
              </span>
            </Label>

            <Button size="lg" className="h-11 w-full text-base" disabled={!agreed} onClick={() => onStart({ type: 'random' })}>
              <Video /> Start Chat
            </Button>

            {/* Private 1-on-1: one person generates an ID, the other enters it. */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or call a friend <span className="h-px flex-1 bg-border" />
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                onStart({ type: 'join', code })
              }}
            >
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                maxLength={6}
                placeholder="Enter room ID"
                aria-label="Room ID"
                className="h-10 font-mono tracking-widest"
                disabled={!agreed}
              />
              <Button type="submit" variant="secondary" className="h-10" disabled={!agreed || code.length !== 6}>
                <LogIn /> Join
              </Button>
            </form>
            <Button variant="outline" className="h-10 w-full" disabled={!agreed} onClick={() => onStart({ type: 'host' })}>
              <Plus /> Generate room ID
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
