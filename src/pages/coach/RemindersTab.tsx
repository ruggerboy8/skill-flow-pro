import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, CheckCircle2, X, Send, Edit2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { formatInTimeZone } from 'date-fns-tz';
import { addDays, formatDistanceToNow } from 'date-fns';
import { getSubmissionPolicy, getPolicyOffsetsForLocation } from '@/lib/submissionPolicy';

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role_id: number;
  user_id: string;
  role_name?: string;
}

interface ReminderInfo {
  sent_at: string;
  sender_user_id: string;
}

type TemplateKey = 'confidence' | 'performance';
type Templates = Record<TemplateKey, { subject: string; body: string }>;

function weekOfInTZ(now: Date, tz: string) {
  const dow = Number(formatInTimeZone(now, tz, 'i'));
  const daysToMonday = -(dow - 1);
  const monday = addDays(now, daysToMonday);
  return formatInTimeZone(monday, tz, 'yyyy-MM-dd');
}

function deadlinesForWeek(weekOf: string, tz: string, loc?: { conf_due_day?: number | null; conf_due_time?: string | null; perf_due_day?: number | null; perf_due_time?: string | null }) {
  const mondayDate = new Date(`${weekOf}T12:00:00Z`);
  const offsets = loc ? getPolicyOffsetsForLocation(loc) : undefined;
  const policy = getSubmissionPolicy(mondayDate, tz, offsets);
  return { checkinDueUtc: policy.confidence_due, checkoutOpenUtc: policy.checkout_open };
}

function dedup(arr: StaffMember[]) {
  const seen = new Set<string>();
  return arr.filter(x => {
    const key = (x.email || '').toLowerCase();
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const RECENT_REMINDER_HOURS = 24;

export default function RemindersTab() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [confidenceList, setConfidenceList] = useState<StaffMember[]>([]);
  const [performanceList, setPerformanceList] = useState<StaffMember[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Per-(user_id|type) most-recent reminder this week
  const [reminderMap, setReminderMap] = useState<Map<string, ReminderInfo>>(new Map());
  // sender_user_id -> first name
  const [senderNames, setSenderNames] = useState<Map<string, string>>(new Map());

  // Selection state per type
  const [selectedConfidence, setSelectedConfidence] = useState<Set<string>>(new Set());
  const [selectedPerformance, setSelectedPerformance] = useState<Set<string>>(new Set());

  // Templates + modal state
  const [templates, setTemplates] = useState<Templates>({
    confidence: {
      subject: 'Quick reminder: confidence check-in',
      body:
        'Hi {{first_name}},\n\nYour confidence check-in for {{week_label}} is still outstanding. Please complete when you\'re next on shift.\n\nThanks,\n{{coach_name}}',
    },
    performance: {
      subject: 'Quick reminder: performance check-out',
      body:
        'Hi {{first_name}},\n\nYour performance check-out for {{week_label}} is still outstanding. Please complete when you\'re next on shift.\n\nThanks,\n{{coach_name}}',
    },
  });
  const [editingTemplates, setEditingTemplates] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<TemplateKey>('confidence');
  const [recipients, setRecipients] = useState<StaffMember[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');

  useEffect(() => {
    loadStaffData();
    loadTemplates();
  }, []);

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

  async function loadTemplates() {
    const { data, error } = await supabase
      .from('reminder_templates')
      .select('key,subject,body');
    if (error) return;
    if (data && data.length) {
      const next = { ...templates };
      for (const row of data as any[]) {
        if (row.key === 'confidence' || row.key === 'performance') {
          next[row.key] = { subject: row.subject, body: row.body };
        }
      }
      setTemplates(next);
    }
  }

  async function saveTemplates() {
    if (!isSuperAdmin) return;
    const rows = [
      { key: 'confidence', subject: templates.confidence.subject, body: templates.confidence.body },
      { key: 'performance', subject: templates.performance.subject, body: templates.performance.body },
    ];
    const { error } = await supabase.from('reminder_templates').upsert(rows);
    if (error) {
      toast({ title: 'Error', description: 'Failed to save templates', variant: 'destructive' });
    } else {
      toast({ title: 'Saved', description: 'Templates updated' });
      setEditingTemplates(false);
    }
  }

  async function loadStaffData() {
    if (!user) return;
    setLoading(true);
    try {
      const { data: staffRows, error: staffErr } = await supabase
        .from('staff')
        .select(`
          id, name, email, user_id, role_id, is_participant,
          locations:primary_location_id(id, name, timezone, group_id, conf_due_day, conf_due_time, perf_due_day, perf_due_time,
            practice_group:practice_groups!locations_org_fkey(id, name)
          ),
          roles:role_id(role_name)
        `)
        .eq('is_participant', true)
        .eq('is_paused', false)
        .not('primary_location_id', 'is', null);
      if (staffErr) throw staffErr;

      const now = new Date();
      const meta = (staffRows ?? []).map((s: any) => {
        const tz = s.locations?.timezone || 'America/Chicago';
        const week_of = weekOfInTZ(now, tz);
        return {
          id: s.id,
          name: s.name,
          email: s.email || '',
          user_id: s.user_id,
          tz,
          week_of,
          role_id: s.role_id,
          role_name: s.roles?.role_name || '',
          location_id: s.locations?.id || '',
          loc: {
            conf_due_day: s.locations?.conf_due_day,
            conf_due_time: s.locations?.conf_due_time,
            perf_due_day: s.locations?.perf_due_day,
            perf_due_time: s.locations?.perf_due_time,
          },
        };
      });

      const staffIds = meta.map(m => m.id);
      const weekKeys = Array.from(new Set(meta.map(m => m.week_of)));

      const { data: scoreRows, error: wsErr } = await supabase
        .from('weekly_scores')
        .select('staff_id, week_of, confidence_score, performance_score')
        .in('staff_id', staffIds)
        .in('week_of', weekKeys);
      if (wsErr) throw wsErr;

      const locationIds = Array.from(new Set(meta.map(m => m.location_id).filter(Boolean)));
      const { data: locExcuseRows } = await supabase
        .from('excused_locations')
        .select('location_id, metric')
        .in('week_of', weekKeys)
        .in('location_id', locationIds);
      const locExcuseSet = new Set((locExcuseRows ?? []).map(e => `${e.location_id}:${e.metric}`));

      const { data: staffExcuseRows } = await supabase
        .from('excused_submissions')
        .select('staff_id, metric, week_of')
        .in('staff_id', staffIds)
        .in('week_of', weekKeys);
      const staffExcuseSet = new Set((staffExcuseRows ?? []).map(e => `${e.staff_id}:${e.week_of}:${e.metric}`));

      const byKey = new Map<string, { has_conf: boolean; has_perf: boolean }>();
      for (const m of meta) byKey.set(m.id + '|' + m.week_of, { has_conf: false, has_perf: false });
      for (const r of (scoreRows ?? [])) {
        const k = r.staff_id + '|' + r.week_of;
        const a = byKey.get(k);
        if (!a) continue;
        if (r.confidence_score !== null) a.has_conf = true;
        if (r.performance_score !== null) a.has_perf = true;
      }

      const nowUtc = new Date();
      const needConfidence: StaffMember[] = [];
      const needPerformance: StaffMember[] = [];

      for (const m of meta) {
        const k = m.id + '|' + m.week_of;
        const a = byKey.get(k)!;
        const { checkinDueUtc, checkoutOpenUtc } = deadlinesForWeek(m.week_of, m.tz, m.loc);

        const confExcused = locExcuseSet.has(`${m.location_id}:confidence`) ||
          staffExcuseSet.has(`${m.id}:${m.week_of}:confidence`);
        const perfExcused = locExcuseSet.has(`${m.location_id}:performance`) ||
          staffExcuseSet.has(`${m.id}:${m.week_of}:performance`);

        const member: StaffMember = {
          id: m.id, name: m.name, email: m.email,
          role_id: m.role_id, user_id: m.user_id, role_name: m.role_name,
        };

        if (!confExcused && !a.has_conf && nowUtc >= checkinDueUtc) needConfidence.push(member);
        if (!perfExcused && !a.has_perf && nowUtc >= checkoutOpenUtc) needPerformance.push(member);
      }

      const withEmail = (x: StaffMember[]) => dedup(x.filter(p => !!p.email));
      const finalConf = withEmail(needConfidence);
      const finalPerf = withEmail(needPerformance);

      // Fetch reminder log entries for the earliest Monday this week (UTC-safe lower bound)
      const earliestMonday = weekKeys.sort()[0];
      const allTargetUserIds = Array.from(new Set([
        ...finalConf.map(s => s.user_id),
        ...finalPerf.map(s => s.user_id),
      ].filter(Boolean)));

      const newReminderMap = new Map<string, ReminderInfo>();
      const senderIds = new Set<string>();

      if (earliestMonday && allTargetUserIds.length > 0) {
        const lowerBoundUtc = new Date(`${earliestMonday}T00:00:00Z`).toISOString();
        const { data: logRows } = await supabase
          .from('reminder_log')
          .select('target_user_id, type, sent_at, sender_user_id')
          .in('target_user_id', allTargetUserIds)
          .in('type', ['confidence', 'performance'])
          .gte('sent_at', lowerBoundUtc)
          .order('sent_at', { ascending: false });

        for (const row of (logRows ?? []) as any[]) {
          const key = `${row.target_user_id}|${row.type}`;
          if (!newReminderMap.has(key)) {
            newReminderMap.set(key, { sent_at: row.sent_at, sender_user_id: row.sender_user_id });
            if (row.sender_user_id) senderIds.add(row.sender_user_id);
          }
        }
      }

      // Resolve sender names
      const newSenderNames = new Map<string, string>();
      if (senderIds.size > 0) {
        const { data: senders } = await supabase
          .from('staff')
          .select('user_id, name')
          .in('user_id', Array.from(senderIds));
        for (const s of (senders ?? []) as any[]) {
          if (s.user_id && s.name) {
            newSenderNames.set(s.user_id, s.name.split(' ')[0]);
          }
        }
      }

      // Default selection: pre-check anyone who has NOT been reminded recently
      const buildDefaults = (list: StaffMember[], type: TemplateKey) => {
        const sel = new Set<string>();
        for (const m of list) {
          const info = newReminderMap.get(`${m.user_id}|${type}`);
          if (!info) { sel.add(m.user_id); continue; }
          const ageHours = (Date.now() - new Date(info.sent_at).getTime()) / 36e5;
          if (ageHours >= RECENT_REMINDER_HOURS) sel.add(m.user_id);
        }
        return sel;
      };

      setConfidenceList(finalConf);
      setPerformanceList(finalPerf);
      setReminderMap(newReminderMap);
      setSenderNames(newSenderNames);
      setSelectedConfidence(buildDefaults(finalConf, 'confidence'));
      setSelectedPerformance(buildDefaults(finalPerf, 'performance'));
    } catch (error: any) {
      console.error('Error loading staff data:', error);
      toast({ title: 'Error', description: 'Failed to load staff data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function statusFor(userId: string, type: TemplateKey): { label: string; recent: boolean } | null {
    const info = reminderMap.get(`${userId}|${type}`);
    if (!info) return null;
    const ageHours = (Date.now() - new Date(info.sent_at).getTime()) / 36e5;
    const senderName = senderNames.get(info.sender_user_id) ||
      (user?.id === info.sender_user_id ? 'you' : 'a manager');
    const rel = formatDistanceToNow(new Date(info.sent_at), { addSuffix: true });
    return { label: `Reminded ${rel} by ${senderName}`, recent: ageHours < RECENT_REMINDER_HOURS };
  }

  function toggleSelected(type: TemplateKey, userId: string) {
    const setter = type === 'confidence' ? setSelectedConfidence : setSelectedPerformance;
    setter(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  }

  function selectNotYetReminded(type: TemplateKey) {
    const list = type === 'confidence' ? confidenceList : performanceList;
    const setter = type === 'confidence' ? setSelectedConfidence : setSelectedPerformance;
    const next = new Set<string>();
    for (const m of list) {
      if (!reminderMap.has(`${m.user_id}|${type}`)) next.add(m.user_id);
    }
    setter(next);
  }

  function selectAll(type: TemplateKey) {
    const list = type === 'confidence' ? confidenceList : performanceList;
    const setter = type === 'confidence' ? setSelectedConfidence : setSelectedPerformance;
    setter(new Set(list.map(m => m.user_id)));
  }

  function clearSelection(type: TemplateKey) {
    const setter = type === 'confidence' ? setSelectedConfidence : setSelectedPerformance;
    setter(new Set());
  }

  function openPreview(type: TemplateKey) {
    const list = type === 'confidence' ? confidenceList : performanceList;
    const sel = type === 'confidence' ? selectedConfidence : selectedPerformance;
    const picked = list.filter(m => sel.has(m.user_id));
    setModalType(type);
    setRecipients(dedup(picked));
    setSubject(templates[type].subject);
    setBody(templates[type].body);
    setModalOpen(true);
  }

  function removeRecipient(userId: string) {
    setRecipients(prev => prev.filter(r => r.user_id !== userId));
  }

  function addRecipient() {
    if (!newEmail.trim()) return;
    if (recipients.some(r => r.email.toLowerCase() === newEmail.toLowerCase())) {
      toast({ title: 'Already added', description: 'This email is already in the recipient list' });
      return;
    }
    const recipient: StaffMember = {
      id: `manual-${Date.now()}`,
      user_id: `manual-${Date.now()}`,
      name: newName.trim() || newEmail.split('@')[0],
      email: newEmail.trim(),
      role_id: 0,
    };
    setRecipients(prev => [...prev, recipient]);
    setNewEmail('');
    setNewName('');
  }

  async function sendReminders() {
    try {
      setSending(true);
      const payload = {
        template_key: modalType,
        subject,
        body,
        recipients: recipients.map(r => ({ user_id: r.user_id, email: r.email, name: r.name })),
      };
      const { error } = await supabase.functions.invoke('coach-remind', { body: payload });
      if (error) throw error;
      toast({
        title: 'Sent',
        description: `Sent ${recipients.length} reminder${recipients.length !== 1 ? 's' : ''}`,
      });
      setModalOpen(false);
      // Refresh so the new sends appear as "Reminded just now by you"
      await loadStaffData();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to send reminders', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  }

  function renderRow(m: StaffMember, type: TemplateKey) {
    const sel = type === 'confidence' ? selectedConfidence : selectedPerformance;
    const checked = sel.has(m.user_id);
    const status = statusFor(m.user_id, type);
    return (
      <div key={m.user_id} className="flex items-start justify-between gap-3 py-2 border-b last:border-b-0">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <Checkbox
            checked={checked}
            onCheckedChange={() => toggleSelected(type, m.user_id)}
            className="mt-0.5"
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">
              {m.name}
              {m.role_name && <span className="text-muted-foreground font-normal"> · {m.role_name}</span>}
            </div>
            {status ? (
              <div className={`text-xs mt-0.5 ${status.recent ? 'text-muted-foreground' : 'text-amber-700'}`}>
                {status.label}
              </div>
            ) : (
              <div className="text-xs mt-0.5 text-muted-foreground">Not yet reminded this week</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderCardBody(type: TemplateKey) {
    const list = type === 'confidence' ? confidenceList : performanceList;
    const sel = type === 'confidence' ? selectedConfidence : selectedPerformance;

    if (list.length === 0) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span>No staff members need {type} reminders</span>
        </div>
      );
    }

    const remindedCount = list.filter(m => reminderMap.has(`${m.user_id}|${type}`)).length;
    const notYetCount = list.length - remindedCount;

    return (
      <div className="space-y-3">
        <div className="text-sm text-muted-foreground">
          <strong>{list.length}</strong> missing
          {' · '}
          <strong>{remindedCount}</strong> already reminded
          {' · '}
          <strong>{notYetCount}</strong> not yet contacted
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => selectNotYetReminded(type)}>
            Select not-yet-reminded ({notYetCount})
          </Button>
          <Button size="sm" variant="outline" onClick={() => selectAll(type)}>
            Select all
          </Button>
          <Button size="sm" variant="ghost" onClick={() => clearSelection(type)}>
            Clear
          </Button>
        </div>

        <div className="rounded-md border px-3 py-1 max-h-80 overflow-y-auto">
          {list.map(m => renderRow(m, type))}
        </div>

        <Button onClick={() => openPreview(type)} disabled={sel.size === 0} className="w-full sm:w-auto">
          <Mail className="h-4 w-4 mr-2" />
          Preview & Send to {sel.size} selected
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Templates editor (Super Admin only) */}
      {isSuperAdmin && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Edit2 className="h-5 w-5" />
                Reminder Templates
              </CardTitle>
              <CardDescription>Define the Tuesday (confidence) and Friday (performance) emails.</CardDescription>
            </div>
            <Button variant={editingTemplates ? 'secondary' : 'default'} onClick={() => setEditingTemplates(v => !v)}>
              {editingTemplates ? 'Cancel' : 'Edit'}
            </Button>
          </CardHeader>
          {editingTemplates && (
            <CardContent className="grid gap-6 md:grid-cols-2">
              {(['confidence','performance'] as TemplateKey[]).map(k => (
                <div key={k} className="space-y-3">
                  <div className="text-sm font-medium capitalize">{k}</div>
                  <Input
                    value={templates[k].subject}
                    onChange={e => setTemplates(t => ({ ...t, [k]: { ...t[k], subject: e.target.value } }))}
                    placeholder="Subject"
                  />
                  <Textarea
                    rows={8}
                    value={templates[k].body}
                    onChange={e => setTemplates(t => ({ ...t, [k]: { ...t[k], body: e.target.value } }))}
                    placeholder="Body (use {{first_name}}, {{coach_name}}, {{week_label}})"
                  />
                </div>
              ))}
              <div className="md:col-span-2">
                <Button onClick={saveTemplates}>Save Templates</Button>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-yellow-600" />
            Missing Confidence Scores
          </CardTitle>
          <CardDescription>
            Use this on <strong>Tuesday afternoons</strong>. Pre-checked = not reminded in the last {RECENT_REMINDER_HOURS}h.
          </CardDescription>
        </CardHeader>
        <CardContent>{renderCardBody('confidence')}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-red-600" />
            Missing Performance Scores
          </CardTitle>
          <CardDescription>
            Use this on <strong>Friday afternoons</strong>. Pre-checked = not reminded in the last {RECENT_REMINDER_HOURS}h.
          </CardDescription>
        </CardHeader>
        <CardContent>{renderCardBody('performance')}</CardContent>
      </Card>

      {/* Preview & Send modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Send {modalType === 'confidence' ? 'Confidence' : 'Performance'} Reminders</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm font-medium">Recipients</div>
            <div className="flex gap-2">
              <Input
                placeholder="Name (optional)"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="flex-1"
                onKeyDown={e => e.key === 'Enter' && addRecipient()}
              />
              <Input
                placeholder="email@example.com"
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                className="flex-[2]"
                onKeyDown={e => e.key === 'Enter' && addRecipient()}
              />
              <Button onClick={addRecipient} variant="outline" size="icon">
                <Mail className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => setRecipients([])}
                variant="outline"
                size="icon"
                title="Clear all recipients"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recipients.map(r => (
                <span key={r.user_id} className="inline-flex items-center rounded-full border px-3 py-1 text-sm">
                  {r.name} <span className="mx-1 text-muted-foreground">·</span> {r.email}
                  <button
                    className="ml-2 hover:text-red-600"
                    onClick={() => removeRecipient(r.user_id)}
                    aria-label={`Remove ${r.name}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </span>
              ))}
              {recipients.length === 0 && (
                <div className="text-sm text-muted-foreground">No recipients selected. Add emails above.</div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Subject</div>
            <Input value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Body</div>
            <Textarea rows={10} value={body} onChange={e => setBody(e.target.value)} />
            <div className="text-xs text-muted-foreground">
              Available tags: <code>{'{{first_name}}'}</code>, <code>{'{{coach_name}}'}</code>, <code>{'{{week_label}}'}</code>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={sendReminders} disabled={sending || recipients.length === 0}>
              <Send className="h-4 w-4 mr-2" />
              {sending ? 'Sending…' : `Send ${recipients.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
