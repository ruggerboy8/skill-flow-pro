import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctorStaffId: string;
  coachStaffId: string;
  onCreated: (sessionId: string) => void;
}

export function MeetingScheduleDialog({ open, onOpenChange, doctorStaffId, coachStaffId, onCreated }: Props) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [meetingLink, setMeetingLink] = useState('');
  const queryClient = useQueryClient();

  const createSession = useMutation({
    mutationFn: async () => {
      const scheduledAt = new Date(`${date}T${time}`).toISOString();
      
      // Check existing sessions to determine sequence number
      const { data: existing } = await supabase
        .from('coaching_sessions')
        .select('sequence_number')
        .eq('doctor_staff_id', doctorStaffId)
        .order('sequence_number', { ascending: false })
        .limit(1);

      const nextSeq = (existing?.[0]?.sequence_number ?? 0) + 1;
      const sessionType = nextSeq === 1 ? 'baseline_review' : 'followup';

      const { data, error } = await supabase
        .from('coaching_sessions')
        .insert({
          doctor_staff_id: doctorStaffId,
          coach_staff_id: coachStaffId,
          session_type: sessionType,
          sequence_number: nextSeq,
          status: 'scheduled',
          scheduled_at: scheduledAt,
          meeting_link: meetingLink || null,
        })
        .select('id')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['coaching-sessions'] });
      toast({ title: 'Meeting scheduled', description: 'You can now prepare your discussion notes.' });
      onOpenChange(false);
      onCreated(data.id);
    },
    onError: (err: any) => {
      toast({ title: 'Error scheduling meeting', description: err.message, variant: 'destructive' });
    },
  });

  const canSubmit = date && time;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Baseline Review</DialogTitle>
          <DialogDescription>
            Pick a date and time for the meeting. You'll prepare your discussion notes next.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="meeting-date">Date</Label>
            <Input
              id="meeting-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meeting-time">Time</Label>
            <Input
              id="meeting-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meeting-link">Meeting Link (optional)</Label>
            <Input
              id="meeting-link"
              type="url"
              placeholder="https://zoom.us/j/..."
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button 
            onClick={() => createSession.mutate()} 
            disabled={!canSubmit || createSession.isPending}
          >
            {createSession.isPending ? 'Scheduling...' : 'Schedule & Prepare'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
