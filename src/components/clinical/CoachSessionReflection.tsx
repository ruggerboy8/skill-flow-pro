import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Props {
  sessionId: string;
  onDone: () => void;
}

type ScaleKey = 'r_talk' | 'r_ask' | 'r_candor' | 'r_specificity' | 'r_continuity';

const SCALES: { key: ScaleKey; question: string; low: string; high: string }[] = [
  { key: 'r_talk', question: 'Who did most of the talking?', low: 'Mostly me', high: 'Mostly them' },
  { key: 'r_ask', question: 'Was I more directive or more curious?', low: 'Telling', high: 'Asking' },
  { key: 'r_candor', question: 'How honest was I about what I’m seeing?', low: 'Guarded', high: 'Candid' },
  { key: 'r_specificity', question: 'How concrete were the next steps we left with?', low: 'Vague', high: 'Could picture them' },
  { key: 'r_continuity', question: 'How well did we build on last session?', low: 'Started fresh', high: 'Picked up the thread' },
];

/**
 * Thirty-second self-reflection after a coaching session. Coach-private,
 * skippable, partial submits allowed. The point is the exercise of
 * reflecting, not the data — no aggregation or CD visibility this round.
 */
export function CoachSessionReflection({ sessionId, onDone }: Props) {
  const { data: myStaff } = useStaffProfile();
  const [ratings, setRatings] = useState<Partial<Record<ScaleKey, number>>>({});
  const [note, setNote] = useState('');

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!myStaff?.id) throw new Error('Not authenticated');
      const { error } = await supabase.from('coach_session_reflections').upsert(
        {
          session_id: sessionId,
          coach_staff_id: myStaff.id,
          ...ratings,
          note: note.trim() || null,
        } as any,
        { onConflict: 'session_id' }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Thanks for reflecting' });
      onDone();
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-lg">Thirty seconds for you</CardTitle>
        <CardDescription>How did that go, for you as the coach? This is private to you.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {SCALES.map(scale => (
          <div key={scale.key} className="space-y-2">
            <p className="text-sm font-medium">{scale.question}</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-24 shrink-0">{scale.low}</span>
              <div className="flex gap-1.5 flex-1 justify-center">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRatings(prev => ({ ...prev, [scale.key]: n }))}
                    className={cn(
                      'w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-medium transition-all',
                      ratings[scale.key] === n
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-muted-foreground/30 hover:border-primary/50 text-muted-foreground'
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground w-24 shrink-0 text-right">{scale.high}</span>
            </div>
          </div>
        ))}

        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything you'd try differently next time? (optional)"
          rows={2}
          className="resize-none text-sm"
        />

        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1" onClick={onDone}>
            Skip
          </Button>
          <Button className="flex-1" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
