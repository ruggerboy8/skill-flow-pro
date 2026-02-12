import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getDomainIdFromSlug, getDomainNameFromSlug } from '@/lib/domainUtils';
import { getDomainColorRichRaw } from '@/lib/domainColors';
import { ROLE_CONTENT, type RoleType } from '@/lib/content/roleDefinitions';
import CompetencyAccordion from '@/components/my-role/CompetencyAccordion';
import { ProMoveDrawer } from '@/components/my-role/ProMoveDrawer';
import { useState } from 'react';
import type { ProMoveDetail } from '@/hooks/useDomainDetail';

const SLUG_TO_ROLE: Record<string, { roleType: RoleType; roleId: number; label: string }> = {
  dfi: { roleType: 'DFI', roleId: 1, label: 'DFI' },
  rda: { roleType: 'RDA', roleId: 2, label: 'RDA' },
  om: { roleType: 'OM', roleId: 3, label: 'Office Manager' },
};

export default function DoctorTeamDomainDetail() {
  const { roleSlug = '', domainSlug = '' } = useParams<{ roleSlug: string; domainSlug: string }>();
  const navigate = useNavigate();
  const [selectedMove, setSelectedMove] = useState<ProMoveDetail | null>(null);

  const role = SLUG_TO_ROLE[roleSlug];
  const domainId = getDomainIdFromSlug(domainSlug);
  const domainName = getDomainNameFromSlug(domainSlug) || '';
  const richColor = domainName ? getDomainColorRichRaw(domainName) : '0 0% 50%';
  const domainContent = role ? ROLE_CONTENT[role.roleType]?.[domainName] : null;

  const { data, isLoading } = useQuery({
    queryKey: ['team-domain-detail', roleSlug, domainSlug],
    queryFn: async () => {
      if (!role || !domainId) return { competencies: [] };

      const { data: competencies } = await supabase
        .from('competencies')
        .select('competency_id, code, name, tagline, friendly_description')
        .eq('domain_id', domainId)
        .eq('role_id', role.roleId)
        .eq('status', 'Active')
        .order('competency_id');

      const compIds = (competencies || []).map(c => c.competency_id);
      const proMovesByComp = new Map<number, ProMoveDetail[]>();

      if (compIds.length > 0) {
        const { data: moves } = await supabase
          .from('pro_moves')
          .select('action_id, action_statement, competency_id')
          .in('competency_id', compIds)
          .eq('active', true);

        (moves || []).forEach(pm => {
          if (!pm.competency_id) return;
          const list = proMovesByComp.get(pm.competency_id) || [];
          list.push({
            action_id: pm.action_id,
            action_statement: pm.action_statement || '',
            lastPracticed: null,
            avgConfidence: null,
          });
          proMovesByComp.set(pm.competency_id, list);
        });
      }

      return {
        competencies: (competencies || []).map(c => ({
          competency_id: c.competency_id,
          code: c.code || '',
          title: c.name || '',
          subtitle: c.tagline,
          description: (c as any).friendly_description || null,
          observerScore: null,
          proMoves: proMovesByComp.get(c.competency_id) || [],
        })),
      };
    },
    enabled: !!role && !!domainId,
  });

  if (!role) {
    return (
      <div className="p-6 text-center">
        <p className="text-destructive">Unknown role</p>
        <Button variant="ghost" onClick={() => navigate('/doctor/my-team')}>← Back</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <div
        className="px-4 py-6 md:px-6 md:py-12"
        style={{ background: `linear-gradient(to bottom right, hsl(${richColor} / 0.15), transparent)` }}
      >
        <div className="max-w-3xl mx-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/doctor/my-team/role/${roleSlug}`)}
            className="mb-6 -ml-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to {role.label} Guide
          </Button>

          {isLoading ? (
            <Skeleton className="h-10 w-64" />
          ) : (
            <>
              <p className="text-sm text-muted-foreground font-medium mb-1">{role.label}</p>
              <h1 className="text-2xl md:text-4xl font-bold" style={{ color: `hsl(${richColor})` }}>
                {domainName}
              </h1>
              {domainContent && (
                <p className="mt-3 text-lg text-foreground/80 italic leading-relaxed">
                  "{domainContent.valueProp}"
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Competencies */}
      <div className="px-4 py-6 md:px-6 md:py-8">
        <div className="max-w-3xl mx-auto space-y-4">
          {isLoading ? (
            [1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)
          ) : data?.competencies.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">No competencies found.</p>
          ) : (
            data?.competencies.map((comp, i) => (
              <div key={comp.competency_id} className="animate-in slide-in-from-bottom-4" style={{ animationDelay: `${i * 75}ms`, animationFillMode: 'backwards' }}>
                <CompetencyAccordion
                  title={comp.title}
                  subtitle={comp.subtitle}
                  description={comp.description}
                  score={null}
                  proMoves={comp.proMoves}
                  domainColor={richColor}
                  onSelectMove={(move) => setSelectedMove(move)}
                />
              </div>
            ))
          )}
        </div>
      </div>

      <ProMoveDrawer
        open={!!selectedMove}
        onOpenChange={(open) => !open && setSelectedMove(null)}
        move={selectedMove}
        domainName={domainName}
      />
    </div>
  );
}
