import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Phoenix', label: 'Arizona (MST)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HST)' },
];

function guessTimezone(): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return TIMEZONES.find(t => t.value === tz)?.value || 'America/Chicago';
}

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
  const [timezone, setTimezone] = useState(guessTimezone);
  const [meetingLink, setMeetingLink] = useState('');
  const queryClient = useQueryClient();

  const createSession = useMutation({
    mutationFn: async () => {
      // Build an ISO string that respects the chosen timezone
      // We create a date string and let the backend store UTC
      const dateTimeStr = `${date}T${time}:00`;
      // Use Intl to get the UTC offset for the chosen timezone at that date/time
      const localDate = new Date(dateTimeStr);
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'longOffset',
      });
      // Get offset string like "GMT-05:00"
      const parts = formatter.formatToParts(localDate);
      const offsetPart = parts.find(p => p.type === 'timeZoneName');
      let offsetStr = '+00:00';
      if (offsetPart?.value) {
        const match = offsetPart.value.match(/GMT([+-]\d{2}:\d{2})/);
        if (match) offsetStr = match[1];
      }
      const scheduledAt = `${dateTimeStr}${offsetStr}`;

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
      toast({ title: 'Meeting scheduled', description: 'You can now prepare your meeting agenda.' });
      onOpenChange(false);
      onCreated(data.id);
    },
    onError: (err: any) => {
      toast({ title: 'Error scheduling meeting', description: err.message, variant: 'destructive' });
    },
  });

  const canSubmit = date && time;

  // Preview the selected time in the chosen timezone
  const selectedTzLabel = TIMEZONES.find(t => t.value === timezone)?.label || timezone;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Meeting</DialogTitle>
          <DialogDescription>
            Pick a date, time, and timezone. You'll prepare the agenda next.
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
          <div className="grid grid-cols-2 gap-3">
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
              <Label>Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map(tz => (
                    <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
