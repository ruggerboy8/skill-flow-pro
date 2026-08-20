import { useOutletContext } from 'react-router-dom';
import { MoreMenuRows, type ManagementNavItem } from '@/components/mobile/MoreMenuRows';

interface LayoutOutletContext {
  navigation: ManagementNavItem[];
}

/**
 * `/more` is no longer a tab (MOB-1 — the tab bar dropped to three: Home,
 * Explore, Performance) but stays routable as a fallback for stale deep
 * links / back-paths. It renders the same shared row list the header avatar
 * menu uses (MoreMenuRows), fed the role-derived `navigation` array Layout.tsx
 * passes down via Outlet context, so this page and the avatar menu can never
 * drift apart. See docs/features/mobile-build-instructions.md section B.4.
 */
export default function MorePage() {
  const { navigation } = useOutletContext<LayoutOutletContext>();

  return (
    <div>
      <h1 className="text-[22px] font-bold tracking-tight">More</h1>
      <div className="mt-3">
        <MoreMenuRows navigation={navigation} />
      </div>
    </div>
  );
}
