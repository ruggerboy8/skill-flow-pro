import { useNavigate } from 'react-router-dom';
import { getDomainInk } from '@/lib/domainColors';

export interface ExploreBreadcrumbItem {
  label: string;
  to: string;
}

/**
 * Tappable breadcrumb trail for the Explore move page (level 4) — "Explore ›
 * Domain › Competency", colored to the current domain, every ancestor
 * tappable (per docs/specs/mob-explore-rebuild.md §2 level 4 acceptance
 * criteria). Only the move level uses this; the domain and competency pages
 * use a plain BackPill instead — see the "Components: reworked vs new" list
 * in the spec.
 */
export function ExploreBreadcrumb({ items, domainName }: { items: ExploreBreadcrumbItem[]; domainName: string }) {
  const navigate = useNavigate();
  const ink = getDomainInk(domainName);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Trail"
      className="flex items-center gap-1 overflow-x-auto -mx-1 px-1 pb-0.5 text-2xs font-semibold whitespace-nowrap"
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={item.to} className="flex items-center gap-1 flex-none">
            {i > 0 && <span className="text-muted-foreground/50">›</span>}
            <button
              type="button"
              onClick={() => navigate(item.to)}
              className="max-w-[150px] truncate"
              style={{ color: isLast ? ink : 'hsl(var(--muted-foreground))' }}
            >
              {item.label}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
