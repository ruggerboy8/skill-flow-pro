import { useNavigate, useLocation } from 'react-router-dom';
import { Home, BookOpen, TrendingUp, MoreHorizontal } from 'lucide-react';

type TabKey = 'home' | 'my-role' | 'performance' | 'more';

const TABS: { key: TabKey; label: string; to: string; icon: typeof Home }[] = [
  { key: 'home', label: 'Home', to: '/', icon: Home },
  { key: 'my-role', label: 'My Role', to: '/my-role', icon: BookOpen },
  { key: 'performance', label: 'Performance', to: '/performance', icon: TrendingUp },
  { key: 'more', label: 'More', to: '/more', icon: MoreHorizontal },
];

/**
 * Which tab owns a given pathname, for highlighting nested routes. See
 * docs/features/mobile-build-instructions.md section B.2 for the map.
 */
export function ownerTabFor(pathname: string): TabKey | null {
  // Performance owns the eval and practice-log surfaces even though they
  // live under /my-role and /evaluation, so check these exceptions before
  // the broader My Role match.
  if (pathname === '/my-role/evaluations') return 'performance';
  if (pathname === '/my-role/practice-log') return 'performance';
  if (pathname.startsWith('/evaluation/')) return 'performance';
  if (pathname === '/performance') return 'performance';

  if (pathname.startsWith('/my-role')) return 'my-role';

  if (
    pathname === '/' ||
    pathname.startsWith('/confidence') ||
    pathname.startsWith('/performance/') || // the wizard: /performance/:week/*
    pathname.startsWith('/team') ||
    pathname.startsWith('/survey') // PendingSurveysCard lives on Home (and every page); Home is the closest owner
  ) {
    return 'home';
  }

  if (pathname === '/more' || pathname === '/profile') return 'more';

  return null;
}

/**
 * Fixed bottom tab bar for the mobile shell. Lives inside the layout flow
 * (not position:fixed) so it reserves its own height rather than overlapping
 * content. Only rendered when useMobileShell() is true — see Layout.tsx.
 */
export function MobileTabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const owner = ownerTabFor(location.pathname);

  return (
    <nav
      role="tablist"
      aria-label="Main navigation"
      className="flex border-t border-border bg-card flex-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map(({ key, label, to, icon: Icon }) => {
        const active = owner === key;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={active}
            onClick={() => navigate(to)}
            className="flex-1 flex flex-col items-center gap-1 py-2 min-h-[52px] text-muted-foreground active:bg-primary/5"
            style={active ? { color: 'hsl(var(--primary))', fontWeight: 700 } : undefined}
          >
            <Icon className="h-6 w-6" strokeWidth={1.9} />
            <span style={{ fontSize: '10px', fontWeight: active ? 700 : 500 }}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
