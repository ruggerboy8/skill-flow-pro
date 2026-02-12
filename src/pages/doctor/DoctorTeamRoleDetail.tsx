import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { ROLE_CONTENT, DOMAIN_ORDER, type RoleType } from '@/lib/content/roleDefinitions';
import { getDomainColor, getDomainColorRichRaw } from '@/lib/domainColors';
import { getDomainSlug } from '@/lib/domainUtils';
import { cn } from '@/lib/utils';

const SLUG_TO_ROLE: Record<string, { roleType: RoleType; roleId: number; label: string }> = {
  dfi: { roleType: 'DFI', roleId: 1, label: 'DFI' },
  rda: { roleType: 'RDA', roleId: 2, label: 'RDA' },
  om: { roleType: 'OM', roleId: 3, label: 'Office Manager' },
};

export default function DoctorTeamRoleDetail() {
  const { roleSlug = '' } = useParams<{ roleSlug: string }>();
  const navigate = useNavigate();
  const role = SLUG_TO_ROLE[roleSlug];

  if (!role) {
    return (
      <div className="p-6 text-center">
        <p className="text-destructive">Unknown role</p>
        <Button variant="ghost" onClick={() => navigate('/doctor/my-team')}>← Back</Button>
      </div>
    );
  }

  const roleContent = ROLE_CONTENT[role.roleType];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/doctor/my-team')}
        className="-ml-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to My Team
      </Button>

      <h1 className="text-2xl font-bold">{role.label} — Role Guide</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {DOMAIN_ORDER.map((domain) => {
          const content = roleContent[domain];
          const domainColor = getDomainColor(domain);
          const domainColorRich = `hsl(${getDomainColorRichRaw(domain)})`;

          return (
            <div
              key={domain}
              onClick={() => navigate(`/doctor/my-team/role/${roleSlug}/domain/${getDomainSlug(domain)}`)}
              className={cn(
                "group relative overflow-hidden rounded-xl border transition-all duration-300 cursor-pointer flex",
                "hover:shadow-md hover:scale-[1.01] active:scale-[0.99]",
                "bg-white dark:bg-slate-800 border-border/50 shadow-sm"
              )}
            >
              {/* Spine */}
              <div className="w-8 shrink-0 flex flex-col items-center justify-center" style={{ backgroundColor: domainColor }}>
                <span
                  className="text-[10px] font-bold tracking-widest uppercase"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', color: domainColorRich }}
                >
                  {domain}
                </span>
              </div>

              <div className="flex-1 p-3 md:p-4 flex items-center gap-3">
                <p className="flex-1 text-sm leading-relaxed text-foreground/90">{content.description}</p>
                <ChevronRight className="flex-shrink-0 w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
