import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

interface Recipient {
  id: string;
  name: string;
  email: string;
  role_id: number;
  user_id: string;
}

interface ReminderComposerProps {
  type: 'confidence' | 'performance';
  recipients: Recipient[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ReminderComposer({ type, recipients, open, onOpenChange }: ReminderComposerProps) {
  const { user } = useAuth();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [localRecipients, setLocalRecipients] = useState<Recipient[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Check super admin status
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

  // Load template when modal opens
  useEffect(() => {
    if (open) {
      loadTemplate();
      setLocalRecipients(dedup(recipients));
    }
  }, [open, type, recipients]);

  async function loadTemplate() {
    const { data, error } = await supabase
      .from('reminder_templates')
      .select('subject, body')
      .eq('key', type)
      .maybeSingle();

    if (!error && data) {
      setSubject(data.subject);
      setBody(data.body);
    } else {
      // Fallback defaults
      if (type === 'confidence') {
        setSubject('Quick reminder: confidence check-in');
        setBody(
          'Hi {{first_name}},\n\nYour confidence check-in for {{week_label}} is still outstanding. Please complete when you\'re next on shift.\n\nThanks,\n{{coach_name}}'
        );
      } else {
        setSubject('Quick reminder: performance check-out');
        setBody(
          'Hi {{first_name}},\n\nYour performance check-out for {{week_label}} is still outstanding. Please complete when you\'re next on shift.\n\nThanks,\n{{coach_name}}'
        );
      }
    }
  }

  async function saveAsTemplate() {
    if (!isSuperAdmin) {
      toast({ title: 'Permission denied', description: 'Only super admins can save templates', variant: 'destructive' });
      return;
    }

    const { error } = await supabase
      .from('reminder_templates')
      .upsert({ key: type, subject, body });

    if (error) {
      toast({ title: 'Error', description: 'Failed to save template', variant: 'destructive' });
    } else {
      toast({ title: 'Saved', description: 'Template updated successfully' });
    }
  }

  function removeRecipient(id: string) {
    setLocalRecipients(prev => prev.filter(r => r.id !== id));
  }

  function addRecipient() {
    if (!newEmail.trim() || !newName.trim()) return;

    const recipient: Recipient = {
      id: `manual-${Date.now()}`,
      name: newName.trim(),
      email: newEmail.trim(),
      role_id: 0,
      user_id: '',
    };

    setLocalRecipients(prev => [...prev, recipient]);
    setNewEmail('');
    setNewName('');
  }

  async function sendReminders() {
    if (localRecipients.length === 0) {
      toast({ title: 'No recipients', description: 'Add at least one recipient', variant: 'destructive' });
      return;
    }

    try {
      setSending(true);
      const payload = {
        template_key: type,
        subject,
        body,
        recipients: localRecipients.map(r => ({ user_id: r.user_id, email: r.email, name: r.name })),
      };
      const { error } = await supabase.functions.invoke('coach-remind', { body: payload });
      if (error) throw error;
      toast({
        title: 'Sent',
        description: `Sent ${localRecipients.length} reminder${localRecipients.length !== 1 ? 's' : ''}`,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to send reminders', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Send {type === 'confidence' ? 'Confidence' : 'Performance'} Reminders
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Recipients list */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Recipients ({localRecipients.length})
            </label>
            <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
              {localRecipients.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No recipients
                </div>
              ) : (
                localRecipients.map(r => (
                  <div key={r.id} className="flex items-center justify-between bg-muted/50 rounded px-2 py-1">
                    <span className="text-sm">{r.name} ({r.email})</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRecipient(r.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Add recipient manually */}
          <div className="flex gap-2">
            <Input
              placeholder="Name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
            />
            <Input
              placeholder="Email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
            />
            <Button variant="outline" onClick={addRecipient}>
              Add
            </Button>
          </div>

          {/* Subject */}
          <div>
            <label className="text-sm font-medium mb-2 block">Subject</label>
            <Input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Email subject"
            />
          </div>

          {/* Body */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Body (use {'{{first_name}}'}, {'{{coach_name}}'}, {'{{week_label}}'})
            </label>
            <Textarea
              rows={10}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Email body"
            />
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
          <Button onClick={sendReminders} disabled={sending || localRecipients.length === 0}>
            {sending ? 'Sending...' : `Send ${localRecipients.length} Reminder${localRecipients.length !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function dedup(recipients: Recipient[]): Recipient[] {
  const seen = new Set<string>();
  return recipients.filter(r => {
    const key = (r.email || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
