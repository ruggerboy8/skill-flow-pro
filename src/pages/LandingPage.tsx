import { useNavigate } from 'react-router-dom';
import { PenLine, Target, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProMovesLogo } from '@/components/ProMovesLogo';
import { SignalP } from '@/components/brand/SignalP';
import { getDomainColorVar, getDomainPastelVar } from '@/lib/domainColors';

// The weekly loop, told as the staff member experiences it. Domain tokens
// here are used purely as an accent palette to tell the three steps apart
// visually -- the steps themselves aren't the four content domains.
const weeklyLoopSteps = [
  {
    icon: PenLine,
    domain: 'Clinical',
    title: 'Check in on confidence',
    copy: "At the start of the week, you rate your own confidence on the moves ahead.",
  },
  {
    icon: Target,
    domain: 'Cultural',
    title: 'Practice three Pro Moves',
    copy: 'You spend the week working three specific, coachable Pro Moves, not a long list.',
  },
  {
    icon: ClipboardCheck,
    domain: 'Case Acceptance',
    title: 'Check out on performance',
    copy: "At week's end, you rate how it actually went. The gap between the two is where coaching starts.",
  },
];

// Who the product serves, one warm line each, in the order the brief lists them.
const audiences = [
  {
    label: 'Staff',
    copy: 'A weekly way to watch yourself get better at real skills, not a performance review in disguise.',
  },
  {
    label: 'Practice leaders',
    copy: "A clear, live view of how your team is growing, without one more spreadsheet to keep up.",
  },
  {
    label: 'Coaches and directors',
    copy: 'The tools to coach with intention, and proof that the coaching is working.',
  },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <ProMovesLogo className="text-xl" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/login')}
          >
            Sign In
          </Button>
        </div>
      </nav>

      {/* 1. Hero */}
      <section className="flex flex-col items-center justify-center px-6 py-20 sm:py-28 bg-gradient-to-b from-background to-muted/30 text-center">
        <SignalP mode="once" size={96} label="Pro Moves" />
        <ProMovesLogo className="mt-6 text-2xl sm:text-3xl" />
        <h1 className="mt-8 text-3xl sm:text-5xl font-bold tracking-tight text-foreground max-w-3xl">
          Turning a job into a career.
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl leading-relaxed">
          Pro Moves turns the small moves you make every week into a career
          you can watch yourself build.
        </p>
        <Button
          className="mt-10 px-8 py-3 text-base"
          size="lg"
          onClick={() => navigate('/login')}
        >
          Sign In
        </Button>
      </section>

      {/* 2. The weekly loop */}
      <section className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-20">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground text-center">
          The weekly loop
        </h2>
        <p className="mt-3 text-muted-foreground text-center max-w-2xl mx-auto leading-relaxed">
          Pro Moves runs on a simple weekly rhythm, the same three steps for
          every staff member, every week.
        </p>
        <div className="mt-12 grid gap-10 sm:grid-cols-3">
          {weeklyLoopSteps.map((step) => (
            <div
              key={step.title}
              className="flex flex-col items-center text-center sm:items-start sm:text-left gap-3"
            >
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full"
                style={{ backgroundColor: getDomainPastelVar(step.domain) }}
              >
                <step.icon
                  className="h-6 w-6"
                  style={{ color: getDomainColorVar(step.domain) }}
                />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {step.copy}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. The delta */}
      <section className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-20">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground text-center">
          The delta
        </h2>
        <p className="mt-3 text-muted-foreground text-center leading-relaxed">
          How you see yourself and how you're observed are rarely the same
          picture. Pro Moves makes that gap visible, quietly, every week,
          because that's exactly where the growth lives.
        </p>
        <div className="mt-10 flex flex-col gap-4" role="img" aria-label="A bar showing self-rated confidence lower than observed performance, with the gap between them labeled as the delta.">
          <div className="flex items-center gap-4">
            <span className="w-36 shrink-0 text-sm text-muted-foreground text-right">
              How you see it
            </span>
            <div className="h-3 flex-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: '55%', backgroundColor: 'hsl(var(--score-2))' }}
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="w-36 shrink-0 text-sm text-muted-foreground text-right">
              How you're observed
            </span>
            <div className="h-3 flex-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: '85%', backgroundColor: 'hsl(var(--score-4))' }}
              />
            </div>
          </div>
          <p className="mt-2 text-center text-sm font-medium text-muted-foreground">
            the delta: where the growth happens
          </p>
        </div>
      </section>

      {/* 4. Who it serves */}
      <section className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-20">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground text-center">
          Who it's for
        </h2>
        <div className="mt-12 grid gap-10 sm:grid-cols-3">
          {audiences.map((audience) => (
            <div key={audience.label} className="flex flex-col items-center text-center sm:items-start sm:text-left gap-2">
              <h3 className="text-lg font-semibold text-foreground">
                {audience.label}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {audience.copy}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Alcan credit + footer */}
      <footer className="border-t border-border/40 py-10 px-6">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 text-center">
          <a
            href="https://alcandentalcooperative.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <img
              src="/brand/alcan-logo.svg"
              alt="Alcan Dental Cooperative"
              className="h-6 w-auto"
            />
            <span>Pro Moves is built by Alcan Dental Cooperative</span>
          </a>
          <p className="text-2xs text-muted-foreground">
            © 2026 Pro Moves. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
