import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { supabase } from '@/integrations/supabase/client';
import { getDomainColor, getDomainColorRichRaw } from '@/lib/domainColors';
import { getDomainSlug } from '@/lib/domainUtils';
import { ROLE_CONTENT, DOMAIN_ORDER, getRoleType, type RoleType } from '@/lib/content/roleDefinitions';
import { ChevronRight, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DomainScore {
  domain_name: string;
  avg_observer: number | null;
}

export default function RoleRadar() {
  const navigate = useNavigate();
  const { data: staffProfile, isLoading: profileLoading } = useStaffProfile({ 
    redirectToSetup: false, 
    showErrorToast: false 
  });
  
  const [loading, setLoading] = useState(true);
  const [domainScores, setDomainScores] = useState<Map<string, number>>(new Map());

  // Determine role type from role_id (1=DFI, 2=RDA, 3=OM)
  const roleType: RoleType = getRoleType(staffProfile?.role_id);
  const roleContent = ROLE_CONTENT[roleType];

  useEffect(() => {
    if (profileLoading) return;
    if (!staffProfile?.id) { 
      setLoading(false); 
      return; 
    }
    
    (async () => {
      try {
        // Get submitted evaluations and extract most recent observer scores by domain
        const { data } = await supabase.rpc('get_evaluations_summary', { 
          p_staff_id: staffProfile.id,
          p_only_submitted: true 
        });

        if (data && data.length > 0) {
          // Group by eval_id to find the most recent evaluation
          const evalGroups = new Map<string, { submitted_at: string; domains: DomainScore[] }>();
          
          for (const row of data) {
            if (!evalGroups.has(row.eval_id)) {
              evalGroups.set(row.eval_id, { 
                submitted_at: row.submitted_at, 
                domains: [] 
              });
            }
            evalGroups.get(row.eval_id)!.domains.push({
              domain_name: row.domain_name,
              avg_observer: row.avg_observer
            });
          }

          // Find most recent evaluation
          let mostRecent: { submitted_at: string; domains: DomainScore[] } | null = null;
          for (const evalData of evalGroups.values()) {
            if (!mostRecent || new Date(evalData.submitted_at) > new Date(mostRecent.submitted_at)) {
              mostRecent = evalData;
            }
          }

          // Build domain -> score map
          if (mostRecent) {
            const scoreMap = new Map<string, number>();
            for (const d of mostRecent.domains) {
              if (d.avg_observer != null) {
                scoreMap.set(d.domain_name, d.avg_observer);
              }
            }
            setDomainScores(scoreMap);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [staffProfile?.id, profileLoading]);

  if (profileLoading || loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-48 rounded-3xl bg-white/40 dark:bg-slate-800/40" />
        ))}
      </div>
    );
  }

  const hasAnyScores = domainScores.size > 0;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {DOMAIN_ORDER.map(domain => {
          const content = roleContent[domain];
          const score = domainScores.get(domain);
          const isScored = score != null && score > 0;
          const domainColor = getDomainColor(domain);
          const domainColorRich = `hsl(${getDomainColorRichRaw(domain)})`;

          return (
            <div
              key={domain}
              onClick={() => navigate(`/my-role/domain/${getDomainSlug(domain)}`)}
              className={cn(
                "group relative overflow-hidden rounded-xl border transition-all duration-300 cursor-pointer flex",
                "hover:shadow-md hover:scale-[1.01] active:scale-[0.99]",
                "bg-white dark:bg-slate-800 border-border/50 dark:border-slate-700/50 shadow-sm"
              )}
            >
              {/* THE SPINE: Vertical Domain Label - matches ThisWeekPanel */}
              <div 
                className="w-8 shrink-0 flex flex-col items-center justify-center"
                style={{ backgroundColor: domainColor }}
              >
                <span 
                  className="text-[10px] font-bold tracking-widest uppercase"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', color: domainColorRich }}
                >
                  {domain}
                </span>
              </div>

              {/* Main Content */}
              <div className="flex-1 p-3 md:p-4 flex items-center gap-3">
                {/* Description */}
                <p className="flex-1 text-sm leading-relaxed text-foreground/90">
                  {content.description}
                </p>

                {/* Score Square */}
                <div 
                  className={cn(
                    "flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border",
                    isScored 
                      ? "bg-muted/30 border-border/50" 
                      : "bg-muted/20 border-dashed border-muted-foreground/30"
                  )}
                >
                  {isScored ? (
                    <span className="text-lg font-bold text-foreground">{score.toFixed(1)}</span>
                  ) : (
                    <Compass className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>

                {/* Chevron */}
                <ChevronRight className="flex-shrink-0 w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Footnote */}
      {hasAnyScores && (
        <p className="text-xs text-muted-foreground text-center">
          * Domain averages from most recent evaluation
        </p>
      )}
    </div>
  );
}
