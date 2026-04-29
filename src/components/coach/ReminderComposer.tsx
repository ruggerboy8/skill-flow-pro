import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import type { ReminderMap } from '@/hooks/useReminderLog';

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
  reminderMap?: ReminderMap;
  onSent?: () => void;
}

const RECENT_REMINDER_HOURS = 24;

export default function ReminderComposer({
  type,
  recipients,
  open,
  onOpenChange,
  reminderMap,
  onSent,
}: ReminderComposerProps) {
  const { user } = useAuth();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [localRecipients, setLocalRecipients] = useState<Recipient[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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

  // Load template + reset selection when modal opens
  useEffect(() => {
    if (open) {
      loadTemplate();
      const deduped = dedup(recipients);
      setLocalRecipients(deduped);
      // Default: select everyone (manager decides who to drop)
      setSelected(new Set(deduped.map(r => r.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setSelected(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function toggleSelected(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
    setSelected(prev => new Set(prev).add(recipient.id));
    setNewEmail('');
    setNewName('');
  }

  // Lookup reminder info for a recipient
  function infoFor(r: Recipient) {
    if (!reminderMap || !r.user_id) return null;
    return reminderMap.get(`${r.user_id}|${type}`) || null;
  }

  // Categorise for the helper button + summary
  const { recentlyRemindedIds, anyRemindedCount } = useMemo(() => {
    const recent = new Set<string>();
    let anyCount = 0;
    for (const r of localRecipients) {
      const info = infoFor(r);
      if (!info) continue;
      anyCount += 1;
      const ageHours = (Date.now() - new Date(info.sent_at).getTime()) / 36e5;
      if (ageHours < RECENT_REMINDER_HOURS) recent.add(r.id);
    }
    return { recentlyRemindedIds: recent, anyRemindedCount: anyCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localRecipients, reminderMap, type]);

  function deselectRecentlyReminded() {
    setSelected(prev => {
      const next = new Set(prev);
      for (const id of recentlyRemindedIds) next.delete(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(localRecipients.map(r => r.id)));
  }

  async function sendReminders() {
    const toSend = localRecipients.filter(r => selected.has(r.id));
    if (toSend.length === 0) {
      toast({ title: 'No recipients', description: 'Select at least one recipient', variant: 'destructive' });
      return;
    }

    try {
      setSending(true);
      const payload = {
        template_key: type,
        subject,
        body,
        recipients: toSend.map(r => ({ user_id: r.user_id, email: r.email, name: r.name })),
      };
      const { error } = await supabase.functions.invoke('coach-remind', { body: payload });
      if (error) throw error;
      toast({
        title: 'Sent',
        description: `Sent ${toSend.length} reminder${toSend.length !== 1 ? 's' : ''}`,
      });
      onSent?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to send reminders', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  }

  const selectedCount = selected.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Send {type === 'confidence' ? 'Confidence' : 'Performance'} Reminders
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Recipients summary + helpers */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm text-muted-foreground">
              <strong className="text-foreground">{selectedCount}</strong> of {localRecipients.length} selected
              {anyRemindedCount > 0 && (
                <> · <strong className="text-foreground">{anyRemindedCount}</strong> already reminded this week</>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAll}>Select all</Button>
              {recentlyRemindedIds.size > 0 && (
                <Button variant="ghost" size="sm" onClick={deselectRecentlyReminded}>
                  Deselect reminded &lt;24h
                </Button>
              )}
            </div>
          </div>

          {/* Recipients list */}
          <div className="border rounded-md max-h-64 overflow-y-auto">
            {localRecipients.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">No recipients</div>
            ) : (
              localRecipients.map(r => {
                const info = infoFor(r);
                const isChecked = selected.has(r.id);
                const ageHours = info ? (Date.now() - new Date(info.sent_at).getTime()) / 36e5 : null;
                const isRecent = ageHours !== null && ageHours < RECENT_REMINDER_HOURS;
                return (
                  <div
                    key={r.id}
                    className="flex items-start gap-3 px-3 py-2 border-b last:border-b-0 hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleSelected(r.id)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {r.name}
                        <span className="text-muted-foreground font-normal"> · {r.email}</span>
                      </div>
                      {info ? (
                        <div className={`text-xs mt-0.5 ${isRecent ? 'text-muted-foreground' : 'text-amber-700'}`}>
                          ↪ Reminded {formatDistanceToNow(new Date(info.sent_at), { addSuffix: true })} by {info.sender_name}
                        </div>
                      ) : (
                        <div className="text-xs mt-0.5 text-muted-foreground">Not yet reminded this week</div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRecipient(r.id)}
                      title="Remove from list"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>

          {/* Add recipient manually */}
          <div className="flex gap-2">
            <Input placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} />
            <Input placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
            <Button variant="outline" onClick={addRecipient}>Add</Button>
          </div>

          {/* Subject */}
          <div>
            <label className="text-sm font-medium mb-2 block">Subject</label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject" />
          </div>

          {/* Body */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Body (use {'{{first_name}}'}, {'{{coach_name}}'}, {'{{week_label}}'})
            </label>
            <Textarea rows={10} value={body} onChange={e => setBody(e.target.value)} placeholder="Email body" />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {isSuperAdmin && (
            <Button variant="outline" onClick={saveAsTemplate}>Save as Template</Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={sendReminders} disabled={sending || selectedCount === 0}>
            {sending ? 'Sending...' : `Send ${selectedCount} Reminder${selectedCount !== 1 ? 's' : ''}`}
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
