import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { supabase } from '@/integrations/supabase/client';
import { getDomainColorRichRaw } from '@/lib/domainColors';
import { getDomainSlug } from '@/lib/domainUtils';
import { ROLE_CONTENT, DOMAIN_ORDER, type RoleType } from '@/lib/content/roleDefinitions';
import { Star, ChevronRight } from 'lucide-react';

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

  // Determine role type from role_id (1=DFI, 2=RDA)
  const roleType: RoleType = staffProfile?.role_id === 1 ? 'DFI' : 'RDA';
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
          <Skeleton key={i} className="h-48 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
      {DOMAIN_ORDER.map(domain => {
        const content = roleContent[domain];
        const score = domainScores.get(domain);
        const isScored = score != null && score > 0;
        const richColor = getDomainColorRichRaw(domain);

        return (
          <div
            key={domain}
            onClick={() => navigate(`/my-role/domain/${getDomainSlug(domain)}`)}
            className={`
              relative rounded-2xl border-2 p-4 md:p-6 transition-all cursor-pointer
              hover:scale-[1.02] hover:shadow-lg
              ${isScored 
                ? 'shadow-sm' 
                : 'border-dashed border-muted-foreground/20 bg-muted/5'
              }
            `}
            style={isScored ? {
              backgroundColor: `hsl(${richColor} / 0.08)`,
              borderColor: `hsl(${richColor} / 0.3)`
            } : {}}
          >
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-3">
              <h3 className="text-lg md:text-xl font-bold text-foreground">{domain}</h3>
              <div className="self-start sm:self-auto">
                {isScored ? (
                  <Badge 
                    className="bg-white/60 backdrop-blur text-foreground shadow-sm border-0 flex items-center gap-1"
                  >
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span className="font-semibold">{score.toFixed(1)}</span>
                  </Badge>
                ) : (
                  <Badge 
                    variant="outline" 
                    className="opacity-60 font-normal"
                  >
                    Exploration Mode
                  </Badge>
                )}
              </div>
            </div>

            {/* Description */}
            <p className="mt-4 text-sm leading-relaxed text-foreground/90">
              {content.description}
            </p>

            {/* Value Prop - styled distinctly */}
            <p className="mt-3 text-xs italic text-muted-foreground leading-relaxed">
              {content.valueProp}
            </p>

            {/* Click Hint */}
            <div className="absolute bottom-4 right-4 flex items-center gap-1 text-xs text-muted-foreground">
              <span>Explore</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
