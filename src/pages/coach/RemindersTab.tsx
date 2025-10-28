import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, CheckCircle2 } from 'lucide-react';
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

export default function RemindersTab() {
  const { user, isCoach, isLead } = useAuth();
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [confidenceList, setConfidenceList] = useState<StaffMember[]>([]);
  const [performanceList, setPerformanceList] = useState<StaffMember[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    loadStaffData();
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

  const copyEmails = (list: StaffMember[], type: 'confidence' | 'performance') => {
    const emails = list.map(s => s.email).join(', ');
    
    navigator.clipboard.writeText(emails).then(() => {
      toast({
        title: "Copied!",
        description: `${list.length} email address${list.length !== 1 ? 'es' : ''} copied to clipboard`,
      });
    }).catch(() => {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive"
      });
    });
  };

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
              <Button 
                onClick={() => copyEmails(confidenceList, 'confidence')}
                className="w-full sm:w-auto"
                variant="default"
              >
                <Mail className="h-4 w-4 mr-2" />
                Copy Emails - Missing Confidence ({confidenceList.length})
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
              <Button 
                onClick={() => copyEmails(performanceList, 'performance')}
                className="w-full sm:w-auto"
                variant="default"
              >
                <Mail className="h-4 w-4 mr-2" />
                Copy Emails - Missing Performance ({performanceList.length})
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
