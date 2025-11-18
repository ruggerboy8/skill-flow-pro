import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { getDomainColor, getDomainColorRaw } from '@/lib/domainColors';

interface Competency {
  competency_id: number;
  name: string;
  domain_name: string;
}

interface CompetencyGridProps {
  selectedRole: number | null;
  onCompetencySelect: (competencyId: number) => void;
  selectedCompetency: number | null;
}

export function CompetencyGrid({ selectedRole, onCompetencySelect, selectedCompetency }: CompetencyGridProps) {
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [domains] = useState(['Clinical', 'Clerical', 'Cultural', 'Case Acceptance']);

  useEffect(() => {
    if (selectedRole) {
      loadCompetencies();
    } else {
      setCompetencies([]);
    }
  }, [selectedRole]);

  const loadCompetencies = async () => {
    if (!selectedRole) return;

    const { data } = await supabase
      .from('competencies')
      .select(`
        competency_id,
        name,
        domains!inner(domain_name)
      `)
      .eq('role_id', selectedRole)
      .order('name');

    if (data) {
      const formattedData = data.map(item => ({
        competency_id: item.competency_id,
        name: item.name,
        domain_name: (item.domains as any).domain_name
      }));
      setCompetencies(formattedData);
    }
  };

  const getCompetenciesByDomain = (domain: string) => {
    return competencies.filter(comp => comp.domain_name === domain);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Competency</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {domains.map(domain => (
            <div key={domain} className="space-y-2">
              <h3 className="font-semibold text-sm" style={{ color: getDomainColor(domain) }}>
                {domain}
              </h3>
              <div className="space-y-1">
                {getCompetenciesByDomain(domain).map(competency => (
                  <Badge
                    key={competency.competency_id}
                    variant={selectedCompetency === competency.competency_id ? "default" : "outline"}
                    className={`
                      w-full justify-start text-xs p-2 h-auto cursor-pointer text-slate-800
                      ${selectedCompetency === competency.competency_id ? '' : 'hover:bg-opacity-20'}
                    `}
                    style={{ 
                      backgroundColor: selectedCompetency === competency.competency_id 
                        ? getDomainColor(domain) 
                        : `hsl(${getDomainColorRaw(domain)} / 0.25)`
                    }}
                    onClick={() => onCompetencySelect(competency.competency_id)}
                  >
                    {competency.name}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}