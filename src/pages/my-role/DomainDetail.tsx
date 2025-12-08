import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Sparkles, Trophy, TrendingUp } from 'lucide-react';
import { useDomainDetail } from '@/hooks/useDomainDetail';
import { getDomainColorRichRaw } from '@/lib/domainColors';
import { ROLE_CONTENT, type RoleType } from '@/lib/content/roleDefinitions';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import CompetencyAccordion from '@/components/my-role/CompetencyAccordion';
import { cn } from '@/lib/utils';

function getAverageBadge(score: number | null) {
  if (score === null) {
    return { label: 'Exploration Mode', icon: TrendingUp, className: 'bg-muted/80 text-muted-foreground' };
  }
  if (score >= 3.5) {
    return { label: 'Mastery', icon: Trophy, className: 'bg-amber-100 text-amber-800' };
  }
  if (score >= 2.5) {
    return { label: 'Proficient', icon: Sparkles, className: 'bg-blue-100 text-blue-800' };
  }
  return { label: 'Building', icon: TrendingUp, className: 'bg-orange-100 text-orange-800' };
}

export default function DomainDetail() {
  const { domainSlug = '' } = useParams<{ domainSlug: string }>();
  const navigate = useNavigate();
  const { data: staffProfile } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  
  const { data, isLoading, error } = useDomainDetail(domainSlug);

  const roleType: RoleType = staffProfile?.role_id === 1 ? 'DFI' : 'RDA';
  const domainContent = data?.domainName ? ROLE_CONTENT[roleType]?.[data.domainName] : null;
  const richColor = data?.domainName ? getDomainColorRichRaw(data.domainName) : '0 0% 50%';
  
  const avgBadge = getAverageBadge(data?.averageScore ?? null);
  const BadgeIcon = avgBadge.icon;

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-destructive">Failed to load domain details</p>
        <Button variant="ghost" onClick={() => navigate('/my-role')} className="mt-4">
          ← Back to Overview
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Hero Header */}
      <div 
        className="px-4 py-8 md:px-6 md:py-12"
        style={{
          background: `linear-gradient(to bottom right, hsl(${richColor} / 0.15), transparent)`
        }}
      >
        <div className="max-w-3xl mx-auto">
          {/* Back Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/my-role')}
            className="mb-6 -ml-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Overview
          </Button>

          {/* Title Row */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex-1">
              {isLoading ? (
                <>
                  <Skeleton className="h-10 w-64 mb-3" />
                  <Skeleton className="h-5 w-full max-w-md" />
                </>
              ) : (
                <>
                  <h1 
                    className="text-3xl md:text-4xl font-bold"
                    style={{ color: `hsl(${richColor})` }}
                  >
                    {data?.domainName}
                  </h1>
                  {domainContent && (
                    <p className="mt-3 text-lg text-foreground/80 italic leading-relaxed">
                      "{domainContent.valueProp}"
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Score Badge */}
            {!isLoading && (
              <Badge className={cn('px-4 py-2 text-sm font-medium shrink-0', avgBadge.className)}>
                <BadgeIcon className="w-4 h-4 mr-2" />
                {avgBadge.label}
                {data?.averageScore !== null && (
                  <span className="ml-2 font-bold">{data.averageScore}</span>
                )}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 md:px-6 md:py-8">
        <div className="max-w-3xl mx-auto space-y-4">
          {isLoading ? (
            <>
              {[1, 2, 3, 4].map(i => (
                <Skeleton 
                  key={i} 
                  className="h-20 rounded-xl animate-in slide-in-from-bottom-4"
                  style={{ animationDelay: `${i * 100}ms` }}
                />
              ))}
            </>
          ) : data?.competencies.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No competencies found for this domain.</p>
            </div>
          ) : (
            data?.competencies.map((comp, index) => (
              <div 
                key={comp.competency_id}
                className="animate-in slide-in-from-bottom-4"
                style={{ animationDelay: `${index * 75}ms`, animationFillMode: 'backwards' }}
              >
                <CompetencyAccordion
                  title={comp.title}
                  subtitle={comp.subtitle}
                  description={comp.description}
                  score={comp.observerScore}
                  proMoves={comp.proMoves}
                  domainColor={richColor}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
