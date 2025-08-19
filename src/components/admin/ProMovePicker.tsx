import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ProMove {
  action_id: number;
  action_statement: string;
  description: string | null;
  competency_id: number;
  competency_name: string;
}

interface Competency {
  competency_id: number;
  name: string;
}

interface ProMovePickerProps {
  roleFilter: number;
  competencyFilter?: string;
  excludeActionIds: number[];
  onSelect: (proMove: ProMove) => void;
  onClose: () => void;
}

export function ProMovePicker({ 
  roleFilter, 
  competencyFilter, 
  excludeActionIds, 
  onSelect, 
  onClose 
}: ProMovePickerProps) {
  const [proMoves, setProMoves] = useState<ProMove[]>([]);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompetency, setSelectedCompetency] = useState<string>(competencyFilter || 'all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadCompetencies();
    loadProMoves();
  }, [roleFilter, selectedCompetency, searchTerm]);

  const loadCompetencies = async () => {
    try {
      const { data, error } = await supabase
        .from('competencies')
        .select('competency_id, name')
        .eq('role_id', roleFilter)
        .order('name');

      if (error) throw error;
      setCompetencies(data || []);
    } catch (error) {
      console.error('Error loading competencies:', error);
    }
  };

  const loadProMoves = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('pro_moves')
        .select(`
          action_id,
          action_statement,
          description,
          competency_id,
          competencies!competency_id(name)
        `)
        .eq('role_id', roleFilter)
        .eq('active', true)
        .order('action_statement');

      if (selectedCompetency && selectedCompetency !== 'all') {
        query = query.eq('competency_id', parseInt(selectedCompetency));
      }

      if (searchTerm) {
        query = query.ilike('action_statement', `%${searchTerm}%`);
      }

      // Exclude already selected action_ids
      if (excludeActionIds.length > 0) {
        query = query.not('action_id', 'in', `(${excludeActionIds.join(',')})`);
      }

      const { data, error } = await query;

      if (error) throw error;

      const formattedData = data?.map(item => ({
        action_id: item.action_id,
        action_statement: item.action_statement,
        description: item.description,
        competency_id: item.competency_id,
        competency_name: (item.competencies as any)?.name || 'Unknown'
      })) || [];

      setProMoves(formattedData);
    } catch (error) {
      console.error('Error loading pro-moves:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[600px]">
        <DialogHeader>
          <DialogTitle>Select Pro-Move</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Competency</Label>
              <Select value={selectedCompetency} onValueChange={setSelectedCompetency}>
                <SelectTrigger>
                  <SelectValue placeholder="All competencies" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="all">All competencies</SelectItem>
                  {competencies.map(competency => (
                    <SelectItem key={competency.competency_id} value={competency.competency_id.toString()}>
                      {competency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search pro-moves..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          {/* Pro-moves list */}
          <div className="max-h-[300px] overflow-y-auto space-y-2">
            {loading ? (
              <div className="text-center py-8">Loading pro-moves...</div>
            ) : proMoves.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No pro-moves found matching your criteria.</p>
              </div>
            ) : (
              proMoves.map((proMove) => (
                <div
                  key={proMove.action_id}
                  className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                  onClick={() => onSelect(proMove)}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <p className="font-medium text-sm">{proMove.action_statement}</p>
                      <Badge variant="outline" className="ml-2 shrink-0">
                        {proMove.competency_name}
                      </Badge>
                    </div>
                    {proMove.description && (
                      <p className="text-xs text-muted-foreground">{proMove.description}</p>
                    )}
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