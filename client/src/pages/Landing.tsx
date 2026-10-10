import { useState } from 'react'
import { ShieldCheck, Video } from 'lucide-react'
import { Header } from '@/components/Header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

const RULES = [
  'You must be 18 or older.',
  'No nudity, sexual content, or harassment.',
  'No hate speech, threats, or illegal content.',
  "Don't share personal info: yours or anyone else's.",
  'Use Report on anyone breaking the rules.',
]

export function Landing({ onStart }: { onStart: () => void }) {
  const [agreed, setAgreed] = useState(false)

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

            <Button size="lg" className="h-11 w-full text-base" disabled={!agreed} onClick={onStart}>
              <Video /> Start Chat
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
