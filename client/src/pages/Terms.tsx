import { Header } from '@/components/Header'

export function Terms() {
  return (
    <div className="min-h-dvh">
      <Header />
      <main className="mx-auto max-w-2xl space-y-8 p-4 py-8 text-sm leading-relaxed text-muted-foreground [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc">
        <a href="#" className="underline underline-offset-4">
          ← Back
        </a>
        <h1 className="text-2xl font-semibold text-foreground">Terms & Community Guidelines</h1>

        <section>
          <h2>Community Guidelines</h2>
          <ul>
            <li>Be respectful. Treat strangers the way you want to be treated.</li>
            <li>No nudity, sexual acts, or sexually explicit content.</li>
            <li>No harassment, bullying, threats, hate speech, or discrimination.</li>
            <li>No violence, self-harm, drugs, weapons, or anything illegal.</li>
            <li>No spam, advertising, scams, or asking for money.</li>
            <li>Never share personal information (address, phone, socials, passwords).</li>
            <li>Never show or involve anyone under 18.</li>
          </ul>
          <p className="mt-2">Breaking these rules can get you blocked from the service.</p>
        </section>

        <section>
          <h2>Terms of Use</h2>
          <ul>
            <li>You must be at least 18 years old to use this service.</li>
            <li>You are solely responsible for what you say and show. Strangers can screen-record you; assume anything you share may be saved.</li>
            <li>The service is provided “as is”, without warranties. We may suspend access at any time.</li>
            <li>We are not responsible for the behaviour of other users.</li>
          </ul>
        </section>

        <section>
          <h2>Privacy</h2>
          <ul>
            <li>Video and audio go directly between you and the stranger (peer-to-peer). Our server never receives, records, or stores them.</li>
            <li>When a direct connection isn't possible, media may pass encrypted through a TURN relay; it is not recorded.</li>
            <li>Text chat passes through our server to be delivered and filtered; it is not stored.</li>
            <li>Reports store the time, the anonymous session IDs involved, and the reported user's IP address, for abuse prevention only.</li>
            <li>Your IP address is visible to the person you are connected to, as with any peer-to-peer call.</li>
          </ul>
        </section>

        <section>
          <h2>Reporting</h2>
          <p>
            Use the <strong className="text-foreground">Report</strong> button during a chat. You'll be moved to someone new and
            won't be matched with that person again. If someone is in immediate danger, contact local emergency services.
          </p>
        </section>
      </main>
    </div>
  )
}
