import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send } from 'lucide-react';

interface NotifyDoctorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctorName: string;
  doctorEmail: string;
  doctorStaffId: string;
  onSuccess?: () => void;
}

const DEFAULT_NOTE = `Hi {{first_name}},

I've reviewed your baseline self-assessment. Great work completing it! I'd love to schedule a conversation to discuss your results and talk about your development goals.

Please use the link below to find a time that works for you.`;

export function NotifyDoctorDialog({
  open,
  onOpenChange,
  doctorName,
  doctorEmail,
  doctorStaffId,
  onSuccess,
}: NotifyDoctorDialogProps) {
  const { toast } = useToast();
  const [note, setNote] = useState(DEFAULT_NOTE);
  const [calendlyUrl, setCalendlyUrl] = useState('');

  const sendMutation = useMutation({
    mutationFn: async () => {
      const body = calendlyUrl.trim()
        ? `${note}\n\nSchedule here: ${calendlyUrl.trim()}`
        : note;

      const { error } = await supabase.functions.invoke('coach-remind', {
        body: {
          template_key: 'doctor_prep_note',
          subject: `A note from your clinical director`,
          body,
          recipients: [{
            user_id: doctorStaffId,
            email: doctorEmail,
            name: doctorName,
          }],
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Note sent', description: `${doctorName} will receive your message via email.` });
      onOpenChange(false);
      setNote(DEFAULT_NOTE);
      setCalendlyUrl('');
      onSuccess?.();
    },
    onError: (e: Error) => {
      toast({ title: 'Failed to send', description: e.message, variant: 'destructive' });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send a note to {doctorName}</DialogTitle>
          <DialogDescription>
            Write a personal message. It will be sent via email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="note">Personal note</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={6}
              placeholder="Write a personal note..."
            />
            <p className="text-xs text-muted-foreground">
              Use {'{{first_name}}'} to insert the doctor's first name.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="calendly">Scheduling link (optional)</Label>
            <Input
              id="calendly"
              value={calendlyUrl}
              onChange={(e) => setCalendlyUrl(e.target.value)}
              placeholder="https://calendly.com/your-link"
              type="url"
            />
            <p className="text-xs text-muted-foreground">
              Paste a Calendly or other scheduling link. It will be appended to your note.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={sendMutation.isPending || !note.trim()}
            className="gap-2"
          >
            {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send Note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
