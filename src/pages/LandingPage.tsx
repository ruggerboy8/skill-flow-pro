import { useNavigate } from 'react-router-dom';
import { CalendarCheck, Users, BarChart2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const valueProps = [
  {
    icon: CalendarCheck,
    title: 'Weekly rhythms',
    copy: 'A structured weekly cadence keeps skills top-of-mind without disrupting your team\'s flow.',
  },
  {
    icon: Users,
    title: 'Role-specific coaching',
    copy: 'Pro moves built for every role — clinical, clerical, and cultural — focused on what actually moves the needle.',
  },
  {
    icon: BarChart2,
    title: 'Real-time visibility',
    copy: 'Coaches and directors get an instant view of team progress, completion, and areas that need attention.',
  },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <span className="text-xl font-semibold text-brand-600 tracking-tight">
            ProMoves
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/login')}
          >
            Sign In
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-20 sm:py-28 bg-gradient-to-b from-background to-muted/30">
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground text-center max-w-3xl">
          Coaching that sticks.
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-muted-foreground text-center max-w-2xl leading-relaxed">
          ProMoves is a weekly coaching platform that helps dental practices
          build consistent, measurable habits across every role — from front
          desk to doctor.
        </p>
        <Button
          className="mt-10 px-8 py-3 text-base"
          size="lg"
          onClick={() => navigate('/login')}
        >
          Sign In →
        </Button>
      </section>

      {/* Value Props */}
      <section className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-20">
        <div className="grid gap-12 sm:grid-cols-3">
          {valueProps.map((vp) => (
            <div key={vp.title} className="flex flex-col items-center text-center sm:items-start sm:text-left gap-3">
              <vp.icon className="h-8 w-8 text-brand-600" />
              <h3 className="text-lg font-semibold text-foreground">
                {vp.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {vp.copy}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 text-center text-sm text-muted-foreground">
        © 2026 ProMoves. All rights reserved.
      </footer>
    </div>
  );
}
