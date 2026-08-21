import { useNavigate } from 'react-router-dom';
import { getDomainInk } from '@/lib/domainColors';

export interface ExploreBreadcrumbItem {
  label: string;
  /** Omit for the trail's last item when it represents the current page — it
   * renders as plain, non-tappable "here" text instead of a nav button. */
  to?: string;
}

/**
 * Tappable breadcrumb trail for the Explore drill (levels 2-4) — "Explore ›
 * Domain[ › Competency]", colored to the current domain. Every item with a
 * `to` navigates there; an item without one (the current page, e.g. the
 * domain on ExploreDomain or the competency on CraftAtlasArea) renders as
 * non-tappable "here" text instead (per
 * docs/specs/mob-explore-rebuild.md §2 level 4 acceptance criteria, extended
 * to levels 2-3 by the explore-fixes punch list).
 */
export function ExploreBreadcrumb({ items, domainName }: { items: ExploreBreadcrumbItem[]; domainName: string }) {
  const navigate = useNavigate();
  const ink = getDomainInk(domainName);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Trail"
      className="flex items-center gap-1 overflow-x-auto -mx-1 px-1 text-2xs font-semibold whitespace-nowrap"
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        const color = isLast ? ink : 'hsl(var(--muted-foreground))';
        return (
          <span key={`${item.label}-${i}`} className="flex items-center gap-1 flex-none">
            {i > 0 && <span className="text-muted-foreground/50">›</span>}
            {item.to ? (
              <button
                type="button"
                onClick={() => navigate(item.to!)}
                className="max-w-[150px] truncate min-h-11 flex items-center py-2.5"
                style={{ color }}
              >
                {item.label}
              </button>
            ) : (
              <span
                className="max-w-[150px] truncate min-h-11 flex items-center py-2.5"
                style={{ color }}
                aria-current="page"
              >
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
