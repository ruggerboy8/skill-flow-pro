import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface ProMove {
  action_id: number;
  action_statement: string;
}

interface ProMovesAccordionProps {
  competencyId: number;
  className?: string;
}

export function ProMovesAccordion({ competencyId, className }: ProMovesAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [proMoves, setProMoves] = useState<ProMove[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedForCompetency, setLoadedForCompetency] = useState<number | null>(null);

  // Reset state when competencyId changes
  useEffect(() => {
    if (loadedForCompetency !== competencyId) {
      setProMoves([]);
      setLoadedForCompetency(null);
      setIsOpen(false);
    }
  }, [competencyId, loadedForCompetency]);

  const loadProMoves = async () => {
    if (loadedForCompetency === competencyId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pro_moves')
        .select('action_id, action_statement')
        .eq('competency_id', competencyId)
        .eq('active', true)
        .order('action_statement');

      if (error) throw error;
      setProMoves(data || []);
      setLoadedForCompetency(competencyId);
    } catch (error) {
      console.error('[ProMovesAccordion] Error loading pro moves:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    if (!isOpen && loadedForCompetency !== competencyId) {
      loadProMoves();
    }
    setIsOpen(!isOpen);
  };

  return (
    <div className={cn('mt-2', className)}>
      <button
        onClick={handleToggle}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        <span>
          {loading ? 'Loading...' : `View Associated Pro Moves${loadedForCompetency === competencyId ? ` (${proMoves.length})` : ''}`}
        </span>
      </button>
      
      {isOpen && loadedForCompetency === competencyId && (
        <div className="mt-2 pl-4 border-l-2 border-muted">
          {proMoves.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No pro moves defined for this competency
            </p>
          ) : (
            <ul className="space-y-1">
              {proMoves.map((move) => (
                <li key={move.action_id} className="text-xs text-muted-foreground">
                  • {move.action_statement}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
