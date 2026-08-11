import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from '@/hooks/use-toast';
import { Target, ChevronDown, CheckCircle2, Bookmark, XCircle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FocusMove } from '@/types/focusMoves';

interface Props {
  doctorStaffId: string;
  doctorName?: string;
}

const ACTIVE_SOFT_CAP = 3;

export function FocusMovesCard({ doctorStaffId }: Props) {
  const { data: myStaff } = useStaffProfile();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftStatement, setDraftStatement] = useState('');
  const [retiringId, setRetiringId] = useState<string | null>(null);
  const [retiredOpen, setRetiredOpen] = useState(false);

  const { data: items, isLoading } = useQuery({
    queryKey: ['doctor-focus-items', doctorStaffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doctor_focus_items')
        .select(`
          id, doctor_staff_id, coach_staff_id, pro_move_id, statement, status,
          retired_outcome, origin_session_id, activated_at, retired_at,
          created_by, created_at, updated_at,
          pro_moves!doctor_focus_items_pro_move_id_fkey (
            action_id, action_statement,
            competencies!fk_pro_moves_competency_id (
              name, domains!competencies_domain_id_fkey (domain_name)
            )
          )
        `)
        .eq('doctor_staff_id', doctorStaffId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as FocusMove[];
    },
    enabled: !!doctorStaffId,
  });

  const invalidate = () => {
    // Every surface that lists Focus Moves — a missed key plus the app's
    // staleTime means a recently viewed screen serves the old list.
    queryClient.invalidateQueries({ queryKey: ['doctor-focus-items', doctorStaffId] });
    queryClient.invalidateQueries({ queryKey: ['my-active-focus-moves', doctorStaffId] });
    queryClient.invalidateQueries({ queryKey: ['baseline-review-prep-focus-items', doctorStaffId] });
    queryClient.invalidateQueries({ queryKey: ['prep-focus-moves', doctorStaffId] });
    queryClient.invalidateQueries({ queryKey: ['my-active-focus-moves-prep', doctorStaffId] });
    queryClient.invalidateQueries({ queryKey: ['capture-active-focus-moves', doctorStaffId] });
  };

  const activateMutation = useMutation({
    mutationFn: async ({ id, statement }: { id: string; statement: string }) => {
      const { error } = await supabase
        .from('doctor_focus_items')
        .update({ status: 'active', statement, activated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      toast({ title: 'Focus Move activated' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateStatementMutation = useMutation({
    mutationFn: async ({ id, statement }: { id: string; statement: string }) => {
      const { error } = await supabase.from('doctor_focus_items').update({ statement }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setEditingId(null); },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const retireMutation = useMutation({
    mutationFn: async ({ id, outcome }: { id: string; outcome: 'landed' | 'set_aside' }) => {
      const { error } = await supabase
        .from('doctor_focus_items')
        .update({ status: 'retired', retired_outcome: outcome, retired_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setRetiringId(null); toast({ title: 'Focus Move retired' }); },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const active = (items || []).filter(i => i.status === 'active');
  const draftAndParked = (items || []).filter(i => i.status === 'draft' || i.status === 'parked');
  const retired = (items || []).filter(i => i.status === 'retired');

  const startEditing = (item: FocusMove) => {
    setEditingId(item.id);
    setDraftStatement(item.statement || '');
  };

  const handleActivate = (item: FocusMove) => {
    if (active.length >= ACTIVE_SOFT_CAP) {
      toast({
        title: 'More than three Focus Moves is hard to focus on',
        description: 'You can still activate this one. Just a nudge, not a limit.',
      });
    }
    // If there's no statement yet, prompt for it inline before activating.
    if (!item.statement?.trim()) {
      startEditing(item);
      return;
    }
    activateMutation.mutate({ id: item.id, statement: item.statement });
  };

  // Plain render function, NOT a nested component: defining a component
  // inside FocusMovesCard gives it a new identity on every render, so React
  // unmounts/remounts each row whenever parent state changes — which made
  // the statement Textarea drop focus after every keystroke.
  const renderItemRow = (item: FocusMove, showActivate: boolean) => {
    const pm = item.pro_moves;
    const isEditing = editingId === item.id;
    const isRetiring = retiringId === item.id;

    return (
      <div className="p-3 rounded-md border bg-background space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{pm?.action_statement || `Pro Move #${item.pro_move_id}`}</p>
            {pm?.competencies?.name && (
              <p className="text-xs text-muted-foreground">{pm.competencies.name}</p>
            )}
          </div>
          {item.status === 'draft' && <Badge variant="outline" className="text-2xs shrink-0">Draft</Badge>}
          {item.status === 'parked' && <Badge variant="secondary" className="text-2xs shrink-0 gap-1"><Bookmark className="h-3 w-3" />Parked</Badge>}
        </div>

        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              autoFocus
              value={draftStatement}
              onChange={(e) => setDraftStatement(e.target.value)}
              placeholder="Our starting point: what are we seeing, and why this one?"
              className="text-sm min-h-[70px]"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!draftStatement.trim() || activateMutation.isPending || updateStatementMutation.isPending}
                onClick={() => {
                  if (item.status === 'active') {
                    updateStatementMutation.mutate({ id: item.id, statement: draftStatement.trim() });
                  } else {
                    activateMutation.mutate({ id: item.id, statement: draftStatement.trim() });
                  }
                }}
              >
                {item.status === 'active' ? 'Save' : 'Activate'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <>
            {item.statement?.trim() ? (
              <p className="text-sm text-muted-foreground italic">"{item.statement}"</p>
            ) : (
              <p className="text-xs text-muted-foreground">No starting-point note yet.</p>
            )}

            {isRetiring ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-muted-foreground mr-1">Retire as:</span>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => retireMutation.mutate({ id: item.id, outcome: 'landed' })}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Landed
                </Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => retireMutation.mutate({ id: item.id, outcome: 'set_aside' })}>
                  <XCircle className="h-3.5 w-3.5" /> Set aside
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRetiringId(null)}>Cancel</Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {showActivate && (
                  <Button size="sm" variant="outline" onClick={() => handleActivate(item)}>
                    Activate
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => startEditing(item)}>
                  {item.statement?.trim() ? 'Edit note' : 'Add note'}
                </Button>
                {item.status === 'active' && (
                  <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setRetiringId(item.id)}>
                    Retire
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Focus Moves</CardTitle>
        </div>
        <CardDescription>
          Pro Moves you and this doctor are working on together, across sessions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!isLoading && (items?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground italic">
            No Focus Moves yet. Create one from the baseline review prep, or from a session.
          </p>
        )}

        {active.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Active
            </p>
            {active.map(item => <div key={item.id}>{renderItemRow(item, false)}</div>)}
          </div>
        )}

        {draftAndParked.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Draft &amp; Parked
            </p>
            {draftAndParked.map(item => <div key={item.id}>{renderItemRow(item, true)}</div>)}
          </div>
        )}

        {retired.length > 0 && (
          <Collapsible open={retiredOpen} onOpenChange={setRetiredOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
                <ChevronDown className={cn('h-3 w-3 transition-transform', retiredOpen && 'rotate-180')} />
                Retired ({retired.length})
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-2">
              {retired.map(item => (
                <div key={item.id} className="p-3 rounded-md border bg-muted/20 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      {item.pro_moves?.action_statement || `Pro Move #${item.pro_move_id}`}
                    </p>
                    <Badge variant="secondary" className="text-2xs shrink-0">
                      {item.retired_outcome === 'landed' ? 'Landed' : 'Set aside'}
                    </Badge>
                  </div>
                  {item.statement?.trim() && (
                    <p className="text-xs text-muted-foreground italic">"{item.statement}"</p>
                  )}
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
