import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { toast } from '@/hooks/use-toast';

const TEMPLATE_KEY = 'scheduling_invite';

const DEFAULT_SUBJECT = '{{coach_name}} would like to schedule your coaching session';
const DEFAULT_BODY = `Hi {{first_name}},

{{coach_name}} has completed their review and is ready to meet with you to discuss your baseline assessment.

Please use the link below to schedule a time that works for you:
{{scheduling_link}}

Before the meeting, please complete your meeting prep on the Pro Moves site:
{{prep_link}}

In your prep, you'll:
  • Review the meeting agenda your coach has prepared
  • Select 1–2 Pro Moves you'd like to focus on
  • Add any questions or topics you want to discuss

Looking forward to connecting!
— {{coach_name}}`;

interface SchedulingInviteComposerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctorName: string;
  doctorEmail: string;
  doctorStaffId: string;
  sessionId?: string;
  onSuccess?: () => void;
}

export function SchedulingInviteComposer({
  open,
  onOpenChange,
  doctorName,
  doctorEmail,
  doctorStaffId,
  sessionId,
  onSuccess,
}: SchedulingInviteComposerProps) {
  const { user } = useAuth();
  const { data: myStaff } = useStaffProfile();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('staff')
          .select('is_super_admin')
          .eq('user_id', user.id)
          .maybeSingle();
        setIsSuperAdmin(Boolean((data as any)?.is_super_admin));
      } catch {
        // ignore
      }
    })();
  }, [user]);

  useEffect(() => {
    if (open) loadTemplate();
  }, [open]);

  async function loadTemplate() {
    const { data, error } = await supabase
      .from('reminder_templates')
      .select('subject, body')
      .eq('key', TEMPLATE_KEY)
      .maybeSingle();

    if (!error && data) {
      setSubject(data.subject);
      setBody(data.body);
    } else {
      setSubject(DEFAULT_SUBJECT);
      setBody(DEFAULT_BODY);
    }
  }

  async function saveAsTemplate() {
    if (!isSuperAdmin) {
      toast({ title: 'Permission denied', description: 'Only super admins can save templates', variant: 'destructive' });
      return;
    }
    const { error } = await supabase
      .from('reminder_templates')
      .upsert({ key: TEMPLATE_KEY, subject, body });

    if (error) {
      toast({ title: 'Error', description: 'Failed to save template', variant: 'destructive' });
    } else {
      toast({ title: 'Saved', description: 'Scheduling invite template updated' });
    }
  }

  function getPreview(template: string) {
    const coachName = myStaff?.name || 'Coach';
    const firstName = doctorName.split(' ')[0];
    return template
      .replace(/\{\{coach_name\}\}/g, coachName)
      .replace(/\{\{first_name\}\}/g, firstName)
      .replace(/\{\{doctor_name\}\}/g, doctorName)
      .replace(/\{\{scheduling_link\}\}/g, myStaff?.scheduling_link || '[scheduling link]');
  }

  async function sendInvite() {
    try {
      setSending(true);
      const { data, error } = await supabase.functions.invoke('invite-to-schedule', {
        body: {
          doctor_staff_id: doctorStaffId,
          session_id: sessionId || null,
          custom_subject: subject,
          custom_body: body,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: 'Scheduling invite sent',
        description: data.email_sent
          ? `Email sent to ${doctorName}.`
          : `Session created. Email could not be sent — share the link manually.`,
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to send invite', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send Scheduling Invite</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Recipient (read-only) */}
          <div>
            <Label className="mb-2 block">To</Label>
            <div className="bg-muted/50 rounded-md px-3 py-2 text-sm">
              {doctorName} ({doctorEmail})
            </div>
          </div>

          {/* Subject */}
          <div>
            <Label className="mb-2 block">Subject</Label>
            <Input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Email subject"
            />
          </div>

          {/* Body */}
          <div>
            <Label className="mb-2 block">
              Body
              <span className="text-muted-foreground font-normal ml-2 text-xs">
                {'{{first_name}}'} {'{{coach_name}}'} {'{{scheduling_link}}'}
              </span>
            </Label>
            <Textarea
              rows={12}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Email body"
            />
          </div>

          {/* Preview */}
          <div>
            <Label className="mb-2 block text-muted-foreground">Preview</Label>
            <div className="bg-muted/30 border rounded-md p-3 text-sm whitespace-pre-wrap">
              <p className="font-medium mb-1">{getPreview(subject)}</p>
              <hr className="my-2 border-border" />
              {getPreview(body)}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {isSuperAdmin && (
            <Button variant="outline" onClick={saveAsTemplate}>
              Save as Template
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={sendInvite} disabled={sending} className="gap-2">
            <Mail className="h-4 w-4" />
            {sending ? 'Sending…' : 'Send Invite'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
