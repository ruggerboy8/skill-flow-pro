import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, CheckCircle2, X, Send, Edit2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { addDays, addHours } from 'date-fns';

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role_id: number;
  user_id: string;
  hire_date?: string | null;
  onboarding_weeks: number;
  primary_location_id?: string | null;
}

type TemplateKey = 'confidence' | 'performance';
type Templates = Record<TemplateKey, { subject: string; body: string }>;

function weekOfInTZ(now: Date, tz: string) {
  const dow = Number(formatInTimeZone(now, tz, 'i'));
  const daysToMonday = -(dow - 1);
  const monday = addDays(now, daysToMonday);
  return formatInTimeZone(monday, tz, 'yyyy-MM-dd');
}

function deadlinesForWeek(weekOf: string, tz: string) {
  const mondayLocalMidnightUtc = fromZonedTime(`${weekOf}T00:00:00`, tz);
  const checkinDueUtc = addHours(addDays(mondayLocalMidnightUtc, 1), 12); // Tue 12:00 local
  const checkoutOpenUtc = addHours(addDays(mondayLocalMidnightUtc, 3), 0); // Thu 00:00 local
  return { checkinDueUtc, checkoutOpenUtc };
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

export default function RemindersTab() {
  const { user, isCoach, isLead } = useAuth();
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [confidenceList, setConfidenceList] = useState<StaffMember[]>([]);
  const [performanceList, setPerformanceList] = useState<StaffMember[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

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
    if (error) return; // ignore silently for MVP
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
      // 1) Pull staff in one go, including emails
      const { data: staffRows, error: staffErr } = await supabase
        .from('staff')
        .select(`
          id, name, email, user_id, role_id, is_participant, onboarding_weeks,
          locations:primary_location_id(id, name, timezone, organization_id,
            organizations!locations_organization_id_fkey(id, name)
          ),
          roles:role_id(role_name)
        `)
        .eq('is_participant', true)
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
          role_name: s.roles?.role_name || 'Unknown',
          location_name: s.locations?.name || 'Unknown',
          org_name: s.locations?.organizations?.name || 'Unknown',
          onboarding_weeks: s.onboarding_weeks || 0,
        };
      });

      const staffIds = meta.map(m => m.id);
      const weekKeys = Array.from(new Set(meta.map(m => m.week_of)));

      // 2) Pull all weekly_scores for these staff and week(s) in one shot
      const { data: scoreRows, error: wsErr } = await supabase
        .from('weekly_scores')
        .select('staff_id, week_of, confidence_score, performance_score')
        .in('staff_id', staffIds)
        .in('week_of', weekKeys);
      if (wsErr) throw wsErr;

      // 3) Reduce to booleans (has_conf / has_perf) for the current week
      const byKey = new Map<string, { has_conf: boolean; has_perf: boolean }>();
      for (const m of meta) byKey.set(m.id + '|' + m.week_of, { has_conf: false, has_perf: false });
      for (const r of (scoreRows ?? [])) {
        const k = r.staff_id + '|' + r.week_of;
        const a = byKey.get(k);
        if (!a) continue;
        if (r.confidence_score !== null) a.has_conf = true;
        if (r.performance_score !== null) a.has_perf = true;
      }

      // 4) Build reminder sets based on local deadlines
      const nowUtc = new Date();
      const needConfidence: StaffMember[] = [];
      const needPerformance: StaffMember[] = [];

      for (const m of meta) {
        const k = m.id + '|' + m.week_of;
        const a = byKey.get(k)!;
        const { checkinDueUtc, checkoutOpenUtc } = deadlinesForWeek(m.week_of, m.tz);

        if (!a.has_conf && nowUtc >= checkinDueUtc) {
          needConfidence.push({
            id: m.id,
            name: m.name,
            email: m.email,
            role_id: m.role_id,
            user_id: m.user_id,
            onboarding_weeks: m.onboarding_weeks,
          });
        }

        if (!a.has_perf && nowUtc >= checkoutOpenUtc) {
          needPerformance.push({
            id: m.id,
            name: m.name,
            email: m.email,
            role_id: m.role_id,
            user_id: m.user_id,
            onboarding_weeks: m.onboarding_weeks,
          });
        }
      }

      // Filter to only those with emails and deduplicate
      const withEmail = (x: StaffMember[]) => dedup(x.filter(p => !!p.email));

      setStaff(meta.map(m => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role_id: m.role_id,
        user_id: m.user_id,
        onboarding_weeks: m.onboarding_weeks,
      })));
      setConfidenceList(withEmail(needConfidence));
      setPerformanceList(withEmail(needPerformance));
    } catch (error: any) {
      console.error('Error loading staff data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load staff data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }


  function openPreview(type: TemplateKey) {
    const list = type === 'confidence' ? confidenceList : performanceList;
    const dedupedList = dedup(list);
    setModalType(type);
    setRecipients(dedupedList);
    setSubject(templates[type].subject);
    setBody(templates[type].body);
    setModalOpen(true);
  }

  function removeRecipient(userId: string) {
    setRecipients(prev => prev.filter(r => r.user_id !== userId));
  }

  function addRecipient() {
    if (!newEmail.trim()) return;
    
    // Check if email already exists
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
      onboarding_weeks: 0,
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
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to send reminders', variant: 'destructive' });
    } finally {
      setSending(false);
    }
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
            Use this on <strong>Tuesday afternoons</strong> to remind staff who haven't submitted their confidence scores yet
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {confidenceList.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>No staff members need confidence reminders</span>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {confidenceList.length} staff member{confidenceList.length !== 1 ? 's need' : ' needs'} to submit confidence scores
              </p>
              <Button onClick={() => openPreview('confidence')} className="w-full sm:w-auto">
                <Mail className="h-4 w-4 mr-2" />
                Preview & Send ({confidenceList.length})
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-red-600" />
            Missing Performance Scores
          </CardTitle>
          <CardDescription>
            Use this on <strong>Friday afternoons</strong> to remind staff who haven't submitted their performance scores
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {performanceList.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>No staff members need performance reminders</span>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {performanceList.length} staff member{performanceList.length !== 1 ? 's need' : ' needs'} to submit performance scores
              </p>
              <Button onClick={() => openPreview('performance')} className="w-full sm:w-auto">
                <Mail className="h-4 w-4 mr-2" />
                Preview & Send ({performanceList.length})
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Preview & Send modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Send {modalType === 'confidence' ? 'Confidence' : 'Performance'} Reminders</DialogTitle>
          </DialogHeader>
          {/* Recipients */}
          <div className="space-y-3">
            <div className="text-sm font-medium">Recipients</div>
            
            {/* Add recipient input */}
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
                title="Clear all recipients (testing)"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Recipient pills */}
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
          {/* Subject/Body */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Subject</div>
            <Input value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Body</div>
            <Textarea
              rows={10}
              value={body}
              onChange={e => setBody(e.target.value)}
            />
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
