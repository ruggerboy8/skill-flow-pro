import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { Search } from 'lucide-react';
import { getDomainColor } from '@/lib/domainColors';

interface ProMove {
  action_id: number;
  action_statement: string;
  competency_id: number;
  competencies: {
    name: string;
    domain_id: number;
    domains: {
      domain_name: string;
    };
  };
}

interface ProMovePickerDialogProps {
  open: boolean;
  onClose: () => void;
  roleId: number;
  onSelect: (actionId: number) => void;
}

export function ProMovePickerDialog({ open, onClose, roleId, onSelect }: ProMovePickerDialogProps) {
  const [proMoves, setProMoves] = useState<ProMove[]>([]);
  const [filteredMoves, setFilteredMoves] = useState<ProMove[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      loadProMoves();
    }
  }, [open, roleId]);

  useEffect(() => {
    filterMoves();
  }, [searchQuery, selectedDomain, proMoves]);

  const loadProMoves = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('pro_moves')
      .select(`
        action_id,
        action_statement,
        competency_id,
        competencies:fk_pro_moves_competency_id!inner (
          name,
          domain_id,
          domains:fk_competencies_domain_id!inner (
            domain_name
          )
        )
      `)
      .eq('role_id', roleId)
      .eq('active', true)
      .order('action_statement');

    setProMoves((data as any) || []);
    setLoading(false);
  };

  const filterMoves = () => {
    let filtered = proMoves;

    if (selectedDomain) {
      filtered = filtered.filter(
        (pm) => (pm.competencies as any)?.domains?.domain_name === selectedDomain
      );
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (pm) =>
          pm.action_statement.toLowerCase().includes(query) ||
          (pm.competencies as any)?.name?.toLowerCase().includes(query)
      );
    }

    setFilteredMoves(filtered);
  };

  const domains = Array.from(
    new Set(proMoves.map((pm) => (pm.competencies as any)?.domains?.domain_name).filter(Boolean))
  ).sort();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Choose Pro-Move from Library</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or competency..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Domain filter */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={selectedDomain === null ? 'default' : 'outline'}
              onClick={() => setSelectedDomain(null)}
            >
              All Domains
            </Button>
            {domains.map((domain) => (
              <Button
                key={domain}
                size="sm"
                variant={selectedDomain === domain ? 'default' : 'outline'}
                onClick={() => setSelectedDomain(domain)}
              >
                {domain}
              </Button>
            ))}
          </div>

          {/* Results */}
          <ScrollArea className="h-[400px] border rounded-lg">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Loading...</div>
            ) : filteredMoves.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No pro-moves found</div>
            ) : (
              <div className="p-2 space-y-2">
                {filteredMoves.map((pm) => (
                  <Button
                    key={pm.action_id}
                    variant="outline"
                    className="w-full justify-start h-auto py-3 px-4"
                    onClick={() => {
                      onSelect(pm.action_id);
                      onClose();
                    }}
                  >
                      <div className="text-left space-y-1 w-full">
                        <div className="font-medium">{pm.action_statement}</div>
                        <div className="flex gap-2">
                          <Badge 
                            variant="secondary" 
                            className="text-xs"
                            style={{ backgroundColor: `hsl(${getDomainColor((pm.competencies as any)?.domains?.domain_name)})` }}
                          >
                            {(pm.competencies as any)?.domains?.domain_name}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {(pm.competencies as any)?.name}
                          </span>
                        </div>
                      </div>
                  </Button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
