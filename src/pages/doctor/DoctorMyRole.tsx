import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { getDomainColor, getDomainColorRichRaw } from '@/lib/domainColors';
import { getDomainSlug } from '@/lib/domainUtils';
import { DOCTOR_ROLE_CONTENT, DOCTOR_DOMAIN_ORDER } from '@/lib/content/doctorRoleDefinitions';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const DOCTOR_ROLE_ID = 4;

interface DomainSummary {
  domain_name: string;
  pro_move_count: number;
}

export default function DoctorMyRole() {
  const navigate = useNavigate();

  // Fetch domains with pro move counts for doctors
  const { data: domains, isLoading } = useQuery({
    queryKey: ['doctor-domains-summary'],
    queryFn: async (): Promise<DomainSummary[]> => {
      const { data, error } = await supabase
        .from('pro_moves')
        .select(`
          action_id,
          competencies!fk_pro_moves_competency_id (
            domain_id,
            domains!competencies_domain_id_fkey (
              domain_name
            )
          )
        `)
        .eq('role_id', DOCTOR_ROLE_ID)
        .eq('active', true);

      if (error) throw error;

      // Aggregate by domain
      const domainCounts = new Map<string, number>();
      for (const pm of data || []) {
        const domainName = (pm.competencies as any)?.domains?.domain_name;
        if (domainName) {
          domainCounts.set(domainName, (domainCounts.get(domainName) || 0) + 1);
        }
      }

      return DOCTOR_DOMAIN_ORDER
        .filter(d => domainCounts.has(d))
        .map(d => ({
          domain_name: d,
          pro_move_count: domainCounts.get(d) || 0
        }));
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="px-4 md:px-0">
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="grid grid-cols-1 gap-4 px-4 md:px-0">
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="px-4 md:px-0">
        <h1 className="text-2xl md:text-3xl font-bold">My Role</h1>
        <p className="text-muted-foreground mt-1">Doctor Competency Blueprint</p>
      </div>

      {/* Domain Cards */}
      <div className="grid grid-cols-1 gap-4 px-4 md:px-0">
        {domains?.map(domain => {
          const content = DOCTOR_ROLE_CONTENT[domain.domain_name];
          const domainColor = getDomainColor(domain.domain_name);
          const domainColorRich = `hsl(${getDomainColorRichRaw(domain.domain_name)})`;

          return (
            <div
              key={domain.domain_name}
              onClick={() => navigate(`/doctor/my-role/domain/${getDomainSlug(domain.domain_name)}`)}
              className={cn(
                "group relative overflow-hidden rounded-xl border transition-all duration-300 cursor-pointer flex",
                "hover:shadow-md hover:scale-[1.01] active:scale-[0.99]",
                "bg-white dark:bg-slate-800 border-border/50 dark:border-slate-700/50 shadow-sm"
              )}
            >
              {/* Vertical Domain Label */}
              <div 
                className="w-8 shrink-0 flex flex-col items-center justify-center"
                style={{ backgroundColor: domainColor }}
              >
                <span 
                  className="text-[10px] font-bold tracking-widest uppercase"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', color: domainColorRich }}
                >
                  {domain.domain_name}
                </span>
              </div>

              {/* Main Content */}
              <div className="flex-1 p-4 flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm leading-relaxed text-foreground/90">
                    {content?.description || domain.domain_name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {domain.pro_move_count} pro move{domain.pro_move_count !== 1 ? 's' : ''}
                  </p>
                </div>

                <ChevronRight className="flex-shrink-0 w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </div>
          );
        })}

        {(!domains || domains.length === 0) && (
          <div className="text-center py-12 text-muted-foreground">
            <p>No domains available yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
