import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getDomainColor } from '@/lib/domainColors';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Competency {
  competency_id: number;
  name: string;
  domain_name: string;
}

interface CompetencyPickerProps {
  roleFilter: number;
  onSelect: (competency: Competency) => void;
  onClose: () => void;
}

export function CompetencyPicker({ 
  roleFilter, 
  onSelect, 
  onClose 
}: CompetencyPickerProps) {
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCompetencies();
  }, [roleFilter]);

  const loadCompetencies = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('competencies')
        .select(`
          competency_id,
          name,
          domains!competencies_domain_id_fkey (
            domain_name
          )
        `)
        .eq('role_id', roleFilter)
        .order('name');

      if (error) throw error;

      const formattedData = data?.map(item => ({
        competency_id: item.competency_id,
        name: item.name,
        domain_name: (item.domains as any)?.domain_name || 'Unknown'
      })) || [];

      setCompetencies(formattedData);
    } catch (error) {
      console.error('Error loading competencies:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[600px]">
        <DialogHeader>
          <DialogTitle>Select Competency for Self-Select</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose which competency users will select their own pro-move from:
          </p>

          {/* Competencies list */}
          <div className="max-h-[400px] overflow-y-auto space-y-2">
            {loading ? (
              <div className="text-center py-8">Loading competencies...</div>
            ) : competencies.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No competencies found for this role.</p>
              </div>
            ) : (
              competencies.map((competency) => (
                <div
                  key={competency.competency_id}
                  className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer"
                  onClick={() => onSelect(competency)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-4 h-4 rounded-full" 
                        style={{ backgroundColor: getDomainColor(competency.domain_name) }}
                      />
                      <div>
                        <p className="font-medium">{competency.name}</p>
                        <p className="text-sm text-muted-foreground">{competency.domain_name}</p>
                      </div>
                    </div>
                    <Badge variant="outline">
                      {competency.domain_name}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}