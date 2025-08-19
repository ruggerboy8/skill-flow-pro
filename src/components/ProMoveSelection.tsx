import React, { useState, useEffect } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, CheckCircle } from 'lucide-react';
import { getDomainColor } from '@/lib/domainColors';

interface ProMove {
  action_id: number;
  action_statement: string;
  competency_id: number;
  domain_name: string;
}

interface SelectionSlot {
  weekly_focus_id: string;
  competency_id: number;
  domain_name: string;
  slot_index: number;
}

interface ProMoveSelectionProps {
  userId: string;
  selections: SelectionSlot[];
  onSelectionChange: (slotIndex: number, proMoveId: number) => void;
  selectedProMoves: { [slotIndex: number]: number };
  disabled?: boolean;
}

export default function ProMoveSelection({ 
  userId, 
  selections, 
  onSelectionChange, 
  selectedProMoves,
  disabled = false 
}: ProMoveSelectionProps) {
  const [proMoves, setProMoves] = useState<{ [competencyId: number]: ProMove[] }>({});
  const [recentlyUsed, setRecentlyUsed] = useState<ProMove[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [validationError, setValidationError] = useState<string>('');

  useEffect(() => {
    loadProMoves();
    loadRecentlyUsed();
  }, []);

  // Validate selections for duplicates
  useEffect(() => {
    const selectedValues = Object.values(selectedProMoves).filter(Boolean);
    const uniqueValues = new Set(selectedValues);
    
    if (selectedValues.length !== uniqueValues.size) {
      setValidationError('Cannot select the same Pro Move for multiple slots');
    } else {
      setValidationError('');
    }
  }, [selectedProMoves]);

  const loadProMoves = async () => {
    try {
      // Get unique competency IDs from selections
      const competencyIds = [...new Set(selections.map(s => s.competency_id))];
      
      const movesData: { [competencyId: number]: ProMove[] } = {};
      
      for (const competencyId of competencyIds) {
        const { data } = await supabase
          .from('pro_moves')
          .select(`
            action_id,
            action_statement,
            competency_id,
            competencies!inner(
              domains!inner(domain_name)
            )
          `)
          .eq('competency_id', competencyId)
          .eq('status', 'active')
          .order('action_statement');

        if (data) {
          movesData[competencyId] = data.map((move: any) => ({
            action_id: move.action_id,
            action_statement: move.action_statement,
            competency_id: move.competency_id,
            domain_name: move.competencies?.domains?.domain_name || ''
          }));
        }
      }
      
      setProMoves(movesData);
    } catch (error) {
      console.error('Error loading pro moves:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRecentlyUsed = async () => {
    try {
      // Get user's last 8 weeks of selections and then fetch pro move details
      const { data: selections } = await supabase
        .from('weekly_self_select')
        .select('selected_pro_move_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(8);

      if (selections && selections.length > 0) {
        const proMoveIds = [...new Set(selections.map(s => s.selected_pro_move_id))];
        
        const { data: proMovesData } = await supabase
          .from('pro_moves')
          .select(`
            action_id,
            action_statement,
            competency_id,
            competencies!inner(
              domains!inner(domain_name)
            )
          `)
          .in('action_id', proMoveIds);

        if (proMovesData) {
          const recent = proMovesData.map((move: any) => ({
            action_id: move.action_id,
            action_statement: move.action_statement,
            competency_id: move.competency_id,
            domain_name: move.competencies?.domains?.domain_name || ''
          }));
          
          setRecentlyUsed(recent.slice(0, 5));
        }
      }
    } catch (error) {
      console.error('Error loading recently used:', error);
    }
  };

  const handleSelection = (slotIndex: number, proMoveId: number) => {
    if (disabled) return;
    
    onSelectionChange(slotIndex, proMoveId);
  };

  const isSelected = (slotIndex: number, proMoveId: number) => {
    return selectedProMoves[slotIndex] === proMoveId;
  };

  const isDuplicate = (proMoveId: number, currentSlotIndex: number) => {
    return Object.entries(selectedProMoves).some(([slotIndex, selectedId]) => 
      selectedId === proMoveId && parseInt(slotIndex) !== currentSlotIndex
    );
  };

  const filterProMoves = (moves: ProMove[]) => {
    if (!searchTerm.trim()) return moves;
    
    return moves.filter(move =>
      move.action_statement.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-muted animate-pulse rounded" />
        <div className="h-32 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search Pro Moves..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
          disabled={disabled}
        />
      </div>

      {/* Validation Error */}
      {validationError && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
          {validationError}
        </div>
      )}

      {/* Recently Used */}
      {recentlyUsed.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground">Recently Used</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentlyUsed.map((move) => (
              <div
                key={move.action_id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent cursor-pointer"
                onClick={() => {
                  // Auto-assign to first available slot
                  const availableSlot = selections.find((_, index) => !selectedProMoves[index]);
                  if (availableSlot) {
                    const slotIndex = selections.findIndex(s => s === availableSlot);
                    handleSelection(slotIndex, move.action_id);
                  }
                }}
              >
                <div className="flex-1">
                  <p className="text-sm font-medium">{move.action_statement}</p>
                  <Badge 
                    variant="secondary" 
                    className={`text-xs ${getDomainColor(move.domain_name)}`}
                  >
                    {move.domain_name}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Selection by Slot */}
      {selections.map((slot, slotIndex) => (
        <Card key={slot.weekly_focus_id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">
                Slot {slotIndex + 1}: {slot.domain_name}
              </CardTitle>
              {selectedProMoves[slotIndex] && (
                <CheckCircle className="h-4 w-4 text-primary" />
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {filterProMoves(proMoves[slot.competency_id] || []).map((move) => (
              <Button
                key={move.action_id}
                variant={isSelected(slotIndex, move.action_id) ? "default" : "outline"}
                className={`w-full text-left justify-start h-auto p-3 ${
                  isDuplicate(move.action_id, slotIndex) ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                onClick={() => handleSelection(slotIndex, move.action_id)}
                disabled={disabled || isDuplicate(move.action_id, slotIndex)}
              >
                <div className="flex-1">
                  <p className="text-sm font-medium">{move.action_statement}</p>
                </div>
                {isSelected(slotIndex, move.action_id) && (
                  <CheckCircle className="h-4 w-4 ml-2" />
                )}
              </Button>
            ))}
            
            {filterProMoves(proMoves[slot.competency_id] || []).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {searchTerm ? 'No matching Pro Moves found' : 'No Pro Moves available'}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}