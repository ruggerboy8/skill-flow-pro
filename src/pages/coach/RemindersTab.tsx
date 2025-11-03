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
import { computeStaffStatusNew } from '@/lib/coachStatus';
import { toast } from '@/hooks/use-toast';

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

  const loadStaffData = async () => {
    try {
      const now = new Date();
      
      // Get current user's organization for Lead RDA scoping
      let myOrgId: string | null = null;
      if (isLead && !isCoach && !isSuperAdmin) {
        const { data: myStaff } = await supabase
          .from('staff')
          .select(`
            id,
            primary_location_id,
            locations!primary_location_id(organization_id)
          `)
          .eq('user_id', user?.id)
          .maybeSingle();
        
        myOrgId = myStaff?.locations?.organization_id ?? null;
      }
      
      // Get staff roster
      const { data: staffData, error } = await supabase
        .from('staff')
        .select(`
          id,
          name,
          email,
          user_id,
          primary_location_id,
          role_id,
          hire_date,
          onboarding_weeks,
          is_participant,
          locations(organization_id)
        `)
        .eq('is_participant', true);

      if (error) throw error;

      // Process staff data
      const processedStaff: StaffMember[] = (staffData as any[])
        .filter((member: any) => member.user_id !== user?.id) // Exclude self
        .filter((member: any) => {
          // Lead RDAs only see their organization
          if (isLead && !isCoach && !isSuperAdmin) {
            return member.locations?.organization_id === myOrgId;
          }
          return true;
        })
        .map((member: any) => ({
          id: member.id,
          name: member.name,
          email: member.email,
          role_id: member.role_id,
          user_id: member.user_id,
          hire_date: member.hire_date,
          onboarding_weeks: member.onboarding_weeks || 6,
          primary_location_id: member.primary_location_id,
        }));

      setStaff(processedStaff);
      
      // Compute statuses and filter
      await computeReminderLists(processedStaff, now);
    } catch (error) {
      console.error('Error loading staff data:', error);
      toast({
        title: "Error",
        description: "Failed to load staff data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const computeReminderLists = async (staffList: StaffMember[], now: Date) => {
    const statusPromises = staffList.map(async (s) => {
      const status = await computeStaffStatusNew(
        s.user_id, 
        { 
          id: s.id, 
          role_id: s.role_id, 
          hire_date: s.hire_date, 
          onboarding_weeks: s.onboarding_weeks,
          primary_location_id: s.primary_location_id
        }, 
        now
      );
      
      return { staff: s, status };
    });

    const results = await Promise.all(statusPromises);

    // Filter for confidence reminders: can_checkin or missed_checkin
    const needConfidence = results
      .filter(({ status }) => 
        status.state === 'can_checkin' || status.state === 'missed_checkin'
      )
      .map(({ staff }) => staff);

    // Filter for performance reminders: can_checkout, missed_checkout, or missed_checkin
    const needPerformance = results
      .filter(({ status }) => 
        status.state === 'can_checkout' || 
        status.state === 'missed_checkout' || 
        status.state === 'missed_checkin'
      )
      .map(({ staff }) => staff);

    setConfidenceList(needConfidence);
    setPerformanceList(needPerformance);
  };

  function openPreview(type: TemplateKey) {
    const list = type === 'confidence' ? confidenceList : performanceList;
    setModalType(type);
    setRecipients(list);
    setSubject(templates[type].subject);
    setBody(templates[type].body);
    setModalOpen(true);
  }

  function removeRecipient(userId: string) {
    setRecipients(prev => prev.filter(r => r.user_id !== userId));
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
          <div className="space-y-2">
            <div className="text-sm font-medium">Recipients</div>
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
                <div className="text-sm text-muted-foreground">No recipients selected.</div>
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
