import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';
import { useDoctorDomainDetail, type DoctorProMoveDetail } from '@/hooks/useDoctorDomainDetail';
import { getDomainColorRichRaw } from '@/lib/domainColors';
import { DOCTOR_ROLE_CONTENT } from '@/lib/content/doctorRoleDefinitions';
import { DoctorCompetencyAccordion } from '@/components/doctor/DoctorCompetencyAccordion';
import { DoctorProMoveDrawer } from '@/components/doctor/DoctorProMoveDrawer';

export default function DoctorDomainDetail() {
  const { domainSlug = '' } = useParams<{ domainSlug: string }>();
  const navigate = useNavigate();
  const [selectedMove, setSelectedMove] = useState<DoctorProMoveDetail | null>(null);
  
  const { data, isLoading, error } = useDoctorDomainDetail(domainSlug);

  const domainContent = data?.domainName ? DOCTOR_ROLE_CONTENT[data.domainName] : null;
  const richColor = data?.domainName ? getDomainColorRichRaw(data.domainName) : '0 0% 50%';

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-destructive">Failed to load domain details</p>
        <Button variant="ghost" onClick={() => navigate('/doctor/my-role')} className="mt-4">
          ← Back to Overview
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Hero Header */}
      <div 
        className="px-4 py-6 md:px-6 md:py-12"
        style={{
          background: `linear-gradient(to bottom right, hsl(${richColor} / 0.15), transparent)`
        }}
      >
        <div className="max-w-3xl mx-auto">
          {/* Back Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/doctor/my-role')}
            className="mb-6 -ml-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Overview
          </Button>

          {/* Title */}
          <div className="flex-1">
            {isLoading ? (
              <>
                <Skeleton className="h-10 w-64 mb-3" />
                <Skeleton className="h-5 w-full max-w-md" />
              </>
            ) : (
              <>
                <h1 
                  className="text-2xl md:text-4xl font-bold"
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
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 md:px-6 md:py-8">
        <div className="max-w-3xl mx-auto space-y-4">
          {isLoading ? (
            <>
              {[1, 2, 3].map(i => (
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
                <DoctorCompetencyAccordion
                  title={comp.title}
                  subtitle={comp.subtitle}
                  description={comp.description}
                  proMoves={comp.proMoves}
                  domainColor={richColor}
                  onSelectMove={(move) => setSelectedMove(move)}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Study Drawer */}
      <DoctorProMoveDrawer 
        open={!!selectedMove}
        onOpenChange={(open) => !open && setSelectedMove(null)}
        move={selectedMove}
        domainName={data?.domainName || ''}
      />
    </div>
  );
}
