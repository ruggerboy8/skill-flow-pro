import { useNavigate } from 'react-router-dom';
import { ROLE_CONTENT, type RoleType } from '@/lib/content/roleDefinitions';
import { ChevronRight, Users } from 'lucide-react';

const ROLES: { slug: string; label: string; roleType: RoleType }[] = [
  { slug: 'dfi', label: 'DFI', roleType: 'DFI' },
  { slug: 'rda', label: 'RDA', roleType: 'RDA' },
  { slug: 'om', label: 'Office Manager', roleType: 'OM' },
];

export default function TeamRoleExplorer() {
  const navigate = useNavigate();

  return (
    <div className="space-y-3 mt-4">
      <p className="text-sm text-muted-foreground">
        Explore what's expected of each role on your team.
      </p>
      {ROLES.map((role) => {
        const content = ROLE_CONTENT[role.roleType];
        // Grab the first domain description as a teaser
        const firstDomain = Object.values(content)[0];

        return (
          <div
            key={role.slug}
            onClick={() => navigate(`/doctor/my-team/role/${role.slug}`)}
            className="flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-white dark:bg-slate-800 shadow-sm cursor-pointer hover:shadow-md transition-shadow active:scale-[0.99]"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{role.label}</p>
              <p className="text-xs text-muted-foreground line-clamp-1">{firstDomain.description}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
          </div>
        );
      })}
    </div>
  );
}
