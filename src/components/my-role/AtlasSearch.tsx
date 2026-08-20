import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { AtlasCompetency } from '@/hooks/useCraftAtlas';
import { searchAtlasMoves } from '@/lib/atlasSearch';
import { getDomainColorVar } from '@/lib/domainColors';

interface AtlasSearchProps {
  competencies: AtlasCompetency[];
  /** Lets the overview hide the domain bands while a query is active. */
  onActiveChange?: (isActive: boolean) => void;
}

/**
 * Search field + in-memory matcher + flat result list for the Craft Atlas
 * (see docs/specs/mob-6-craft-atlas.md). Client-side only, over the
 * already-loaded useCraftAtlas corpus — no query per keystroke. A tap on a
 * result opens the new Explore move page (/my-role/move/:actionId) — the
 * old ProMoveDrawer is the pre-redesign surface and must not appear on this
 * mobile Explore search path (see docs/specs/mob-explore-rebuild.md).
 */
export function AtlasSearch({ competencies, onActiveChange }: AtlasSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const trimmed = query.trim();
  const isActive = trimmed.length > 0;

  const results = useMemo(() => searchAtlasMoves(competencies, query), [competencies, query]);

  function handleChange(value: string) {
    setQuery(value);
    onActiveChange?.(value.trim().length > 0);
  }

  function clear() {
    handleChange('');
  }

  return (
    <div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Search your moves, skill areas, or domains"
          aria-label="Search your role's moves"
          className="pl-9 pr-9 rounded-2xl"
        />
        {isActive && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isActive && (
        <div className="mt-3 space-y-1.5">
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground px-1 py-6 text-center">
              No moves match &ldquo;{trimmed}&rdquo;.
            </p>
          ) : (
            <>
              <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                {results.length} result{results.length === 1 ? '' : 's'}
              </p>
              {results.map(({ move, competency }) => (
                <button
                  key={move.action_id}
                  type="button"
                  onClick={() => navigate(`/my-role/move/${move.action_id}`)}
                  className="w-full text-left rounded-xl border border-border bg-card p-3 active:scale-[0.99] transition-transform"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span
                      className="h-2 w-2 flex-none rounded-sm"
                      style={{ backgroundColor: getDomainColorVar(competency.domainName) }}
                    />
                    <span className="text-2xs font-semibold text-muted-foreground truncate">
                      {competency.domainName} · {competency.title}
                    </span>
                  </div>
                  <p className="text-[13.5px] font-medium leading-snug text-foreground">{move.action_statement}</p>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
