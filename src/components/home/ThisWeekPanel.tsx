import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { nowUtc, nextMondayStr, getWeekAnchors, CT_TZ } from '@/lib/centralTime';
import { useNow } from '@/providers/NowProvider';
import { getDomainColor } from '@/lib/domainColors';
import { assembleCurrentWeek, WeekAssignment } from '@/lib/weekAssembly';
import { computeWeekState, StaffStatus, getLocationWeekContext, LocationWeekContext } from '@/lib/locationState';
import { useSim } from '@/devtools/SimProvider';
import { formatInTimeZone } from 'date-fns-tz';
import ConfPerfDelta from '@/components/ConfPerfDelta';

interface Staff { id: string; role_id: number; }
interface WeeklyScore { 
  weekly_focus_id: string; 
  confidence_score: number | null; 
  performance_score: number | null; 
}

export default function ThisWeekPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const now = useNow();
  const { overrides } = useSim();

  const [staff, setStaff] = useState<Staff | null>(null);
  const [weekContext, setWeekContext] = useState<StaffStatus | null>(null);
  const [locationWeekContext, setLocationWeekContext] = useState<LocationWeekContext | null>(null);
  const [weekAssignments, setWeekAssignments] = useState<WeekAssignment[]>([]);
  const [weeklyScores, setWeeklyScores] = useState<WeeklyScore[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [SimBannerComponent, setSimBannerComponent] = useState<React.ComponentType | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Check if user is super admin
  useEffect(() => {
    if (user) {
      checkSuperAdminStatus();
    }
  }, [user]);

  async function checkSuperAdminStatus() {
    try {
      const { data } = await supabase.rpc('is_super_admin', { _user_id: user!.id });
      setIsSuperAdmin(!!data);
    } catch (error) {
      console.error('Error checking super admin status:', error);
    }
  }

  // Delete latest week data function
  async function handleDeleteLatestWeek() {
    if (!user) return;
    
    setDeleteLoading(true);
    try {
      const { data, error } = await supabase.rpc('delete_latest_week_data', { 
        p_user_id: user.id 
      });
      
      if (error) throw error;
      
      const result = data as { success: boolean; message: string; deleted_scores?: number; deleted_selections?: number };
      
      if (result.success) {
        toast({ 
          title: 'Success', 
          description: `Deleted ${result.deleted_scores || 0} scores and ${result.deleted_selections || 0} selections from latest week.` 
        });
        // Reload the current week data
        await loadCurrentWeek();
      } else {
        toast({ title: 'Info', description: result.message });
      }
    } catch (error: any) {
      console.error('Error deleting latest week:', error);
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to delete latest week data', 
        variant: 'destructive' 
      });
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  }

  // Load staff profile
  useEffect(() => {
    if (user) void loadStaff();
  }, [user]);

  async function loadStaff() {
    const { data, error } = await supabase
      .from('staff')
      .select('id, role_id')
      .eq('user_id', user!.id)
      .maybeSingle();

    if (error || !data) {
      navigate('/setup');
      return;
    }

    setStaff(data);
  }

  // Load current week data and compute state
  useEffect(() => {
    if (staff) void loadCurrentWeek();
  }, [staff, overrides]); // Re-run when simulation overrides change

  async function loadCurrentWeek() {
    if (!staff || !user) return;

    setLoading(true);

    try {
      console.log('=== DEBUGGING THISWEEKPANEL ===');
      console.log('Current time (now):', now);
      console.log('Staff:', staff);
      console.log('Simulation overrides:', overrides);
      
      // Get staff info including location
      const { data: staffData } = await supabase
        .from('staff')
        .select('id, role_id, primary_location_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!staffData?.primary_location_id) {
        throw new Error('Staff member has no assigned location');
      }

      // Use simulated time if available
      const effectiveNow = overrides.enabled && overrides.nowISO ? new Date(overrides.nowISO) : now;
      console.log('Effective time being used:', effectiveNow);
      
      // Get location week context for cycle and week info
      const locationContext = await getLocationWeekContext(staffData.primary_location_id, effectiveNow);
      console.log('Location week context:', locationContext);
      setLocationWeekContext(locationContext);
      
      // Compute current week state with simulation overrides (location-based unified)
      const context = await computeWeekState({
        userId: user.id,
        locationId: staffData.primary_location_id,
        roleId: staffData.role_id,
        now: effectiveNow,
        simOverrides: overrides.enabled ? overrides : undefined
      });
      console.log('Week context:', context);
      setWeekContext(context);

      // Load current week assignments with simulation support (progress-based)
      const assignments = await assembleCurrentWeek(user.id, overrides);
      console.log('Week assignments:', assignments);
      console.log('Staff role_id:', staff.role_id);
      setWeekAssignments(assignments);

      // Load weekly scores for the assignments
      if (assignments.length > 0) {
        const focusIds = assignments.map(a => a.weekly_focus_id);
        const { data: scores } = await supabase
          .from('weekly_scores')
          .select('weekly_focus_id, confidence_score, performance_score')
          .eq('staff_id', staffData.id)
          .in('weekly_focus_id', focusIds);
        
        setWeeklyScores(scores || []);
      } else {
        setWeeklyScores([]);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading current week:', error);
      toast({ title: 'Error', description: 'Failed to load current week data', variant: 'destructive' });
      setLoading(false);
    }
  }

  // Banner message and CTA based on current week state
  const { bannerMessage, bannerCta } = useMemo(() => {
    if (!weekContext || !staff) return { bannerMessage: '', bannerCta: null };

    // now comes from useNow() hook

    switch (weekContext.state) {
      case 'missed_checkin':
        return {
          bannerMessage: "Oops! You forgot to submit your Confidence scores this week. Don't worry, we'll get you back on track next week.",
          bannerCta: null
        };

      case 'can_checkin':
        return {
          bannerMessage: 'Welcome back! Time to rate your confidence for this week\'s Pro Moves.',
          bannerCta: {
            label: 'Rate Confidence',
            onClick: () => navigate(`/confidence/current/step/1`)
          }
        };

      // Removed wait_for_thu case - no longer needed

      case 'can_checkout':
        return {
          bannerMessage: 'Time to reflect. Rate your performance for this week\'s Pro Moves.',
          bannerCta: {
            label: 'Rate Performance',
            onClick: () => navigate(`/performance/current/step/1`)
          }
        };

      case 'done':
        return {
          bannerMessage: 'Nice work! That\'s it for now, see you next week!',
          bannerCta: null
        };

      default:
        return {
          bannerMessage: 'Review your Pro Moves below.',
          bannerCta: null
        };
    }
  }, [weekContext, staff, navigate]);

  // Show loading state
  if (loading || !weekContext || !staff) {
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>This Week&apos;s Pro Moves</CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-24 rounded-md bg-muted animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  // Get Monday date for "Week of" display
  const { mondayZ } = getWeekAnchors(now, CT_TZ);
  const weekOfDate = formatInTimeZone(mondayZ, CT_TZ, 'MMM d, yyyy');

  // Filter assignments for missed states - only show site moves, not self-selects
  const displayAssignments = (weekContext.state === 'missed_checkin' || weekContext.state === 'missed_checkout') 
    ? weekAssignments.filter(assignment => assignment.type === 'site')
    : weekAssignments;

  // Show empty state when no pro moves found (or no site moves for missed states)
  if (displayAssignments.length === 0) {
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>This Week&apos;s Pro Moves</CardTitle>
          <CardDescription>Week of {weekOfDate}</CardDescription>
          {locationWeekContext && (
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-xs">
                Cycle {locationWeekContext.cycleNumber}, Week {locationWeekContext.weekInCycle}
              </Badge>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted p-3">
            <div className="font-medium text-sm text-foreground text-center">
              No Pro Moves configured for this week. Please contact your administrator.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show normal view with pro moves and banner
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle>This Week&apos;s Pro Moves</CardTitle>
        <CardDescription>Week of {weekOfDate}</CardDescription>
        {locationWeekContext && (
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="text-xs">
              Cycle {locationWeekContext.cycleNumber}, Week {locationWeekContext.weekInCycle}
            </Badge>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pro Moves list */}
        <div className="space-y-3">
          {displayAssignments.map((assignment, index) => {
            const domainName = assignment.domain_name;
            const bgColor = domainName ? getDomainColor(domainName) : undefined;
            const isUnchosen = assignment.type === 'selfSelect' && !assignment.action_statement;
            
            // Find scores for this assignment
            const scores = weeklyScores.find(s => s.weekly_focus_id === assignment.weekly_focus_id);

            return (
              <div key={assignment.weekly_focus_id} className="rounded-lg p-4 border" style={bgColor ? { backgroundColor: bgColor } : undefined}>
                {domainName && (
                  <Badge variant="secondary" className="text-xs font-semibold mb-2 bg-white/80 text-gray-900" aria-label={`Domain: ${domainName}`}>
                    {domainName}
                  </Badge>
                )}

                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-2 flex-1">
                    <p className="text-sm font-medium">
                      {assignment.action_statement || 'Check-In to choose this Pro-Move for the week.'}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <ConfPerfDelta 
                      confidence={scores?.confidence_score} 
                      performance={scores?.performance_score} 
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dynamic banner message */}
        <div className="rounded-md border bg-muted p-3">
          <div className="font-medium text-sm text-foreground text-center">{bannerMessage}</div>
          {bannerCta && (
            <Button className="w-full h-12 mt-2" onClick={bannerCta.onClick} aria-label="Next action">
              {bannerCta.label}
            </Button>
          )}
          
          {/* Super Admin Delete Button */}
          {isSuperAdmin && weekContext.state === 'done' && (
            <Button 
              variant="destructive" 
              className="w-full mt-2"
              onClick={() => setShowDeleteDialog(true)}
              disabled={deleteLoading}
            >
              {deleteLoading ? 'Deleting...' : 'Delete Last Week (Admin)'}
            </Button>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Latest Week Data</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete your most recent week's confidence and performance scores, 
                as well as any self-selection data. This action cannot be undone.
                
                Are you sure you want to continue?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDeleteLatestWeek}
                disabled={deleteLoading}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteLoading ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Simulation status below CTA when active */}
        {SimBannerComponent && <SimBannerComponent />}
      </CardContent>
    </Card>
  );
}