import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getDomainColor } from '@/lib/domainColors';

interface ProMove {
  action_id: number;
  action_statement: string;
  domain_name: string;
}

interface ProMovePanelProps {
  selectedCompetency: number | null;
  onProMoveSelect: (proMove: ProMove | null, selfSelect: boolean) => void;
}

export function ProMovePanel({ selectedCompetency, onProMoveSelect }: ProMovePanelProps) {
  const [proMoves, setProMoves] = useState<ProMove[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProMoveId, setSelectedProMoveId] = useState<number | null>(null);
  const [selfSelect, setSelfSelect] = useState(false);

  useEffect(() => {
    if (selectedCompetency) {
      loadProMoves();
    } else {
      setProMoves([]);
      setSelectedProMoveId(null);
    }
  }, [selectedCompetency]);

  const loadProMoves = async () => {
    if (!selectedCompetency) return;

    const { data } = await supabase
      .from('pro_moves')
      .select(`
        action_id,
        action_statement,
        competencies!inner(
          domains!inner(domain_name)
        )
      `)
      .eq('competency_id', selectedCompetency)
      .eq('status', 'Active')
      .order('action_statement');

    if (data) {
      const formattedData = data.map(item => ({
        action_id: item.action_id,
        action_statement: item.action_statement,
        domain_name: (item.competencies as any).domains.domain_name
      }));
      setProMoves(formattedData);
    }
  };

  const filteredProMoves = proMoves.filter(move =>
    move.action_statement.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleProMoveSelect = (proMove: ProMove) => {
    setSelectedProMoveId(proMove.action_id);
    onProMoveSelect(proMove, selfSelect);
  };

  const handleSelfSelectToggle = (checked: boolean) => {
    setSelfSelect(checked);
    if (checked) {
      setSelectedProMoveId(null);
      onProMoveSelect(null, true);
    } else {
      onProMoveSelect(null, false);
    }
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Pro Moves
          <div className="flex items-center space-x-2">
            <Switch
              id="self-select"
              checked={selfSelect}
              onCheckedChange={handleSelfSelectToggle}
            />
            <Label htmlFor="self-select" className="text-sm">Self-Select</Label>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!selfSelect && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search pro moves... (Ctrl+K)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                onKeyDown={(e) => {
                  if (e.ctrlKey && e.key === 'k') {
                    e.preventDefault();
                    e.currentTarget.focus();
                  }
                }}
              />
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredProMoves.map(move => (
                <div
                  key={move.action_id}
                  className={`
                    p-3 border rounded-lg cursor-pointer transition-colors
                    border-l-4 hover:bg-gray-50
                    ${selectedProMoveId === move.action_id ? 'bg-blue-50 border-blue-200' : 'border-gray-200'}
                  `}
                  style={{ 
                    borderLeftColor: getDomainColor(move.domain_name),
                  }}
                  onClick={() => handleProMoveSelect(move)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <input
                      type="radio"
                      checked={selectedProMoveId === move.action_id}
                      onChange={() => handleProMoveSelect(move)}
                      className="text-blue-600"
                    />
                    <Badge 
                      variant="secondary" 
                      className="text-xs"
                      style={{ backgroundColor: getDomainColor(move.domain_name) }}
                    >
                      {move.domain_name}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {move.action_statement}
                  </p>
                </div>
              ))}
              {filteredProMoves.length === 0 && selectedCompetency && (
                <p className="text-muted-foreground text-center py-8">
                  No pro moves found for this competency.
                </p>
              )}
            </div>
          </>
        )}

        {selfSelect && (
          <div className="flex items-center justify-center py-12">
            <Badge variant="outline" className="text-sm px-4 py-2">
              Self-Select Placeholder
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}