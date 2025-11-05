import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Database, Play, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';

export function SequencerTestConsole() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [orgId, setOrgId] = useState('');
  const [roleId, setRoleId] = useState(1);
  const [weekSource, setWeekSource] = useState<'plan' | 'focus' | 'unknown'>('unknown');
  const [focusIds, setFocusIds] = useState<string[]>([]);
  const [orgData, setOrgData] = useState<any>(null);
  const [availableOrgs, setAvailableOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [userOrgInfo, setUserOrgInfo] = useState<{ 
    staffId: string;
    orgId: string; 
    orgName: string; 
    locationName: string;
    roleId: number;
    roleName: string;
  } | null>(null);

  // Load user's org info
  useEffect(() => {
    const loadUserOrg = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: staff } = await supabase
          .from('staff')
          .select(`
            id, 
            role_id, 
            primary_location_id, 
            locations!inner(organization_id, name),
            roles!inner(role_name)
          `)
          .eq('user_id', user.id)
          .maybeSingle();

        if (staff?.locations) {
          const loc = staff.locations as any;
          const role = staff.roles as any;
          
          // Get org name separately to avoid deep nesting
          const { data: org } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', loc.organization_id)
            .single();

          setUserOrgInfo({
            staffId: staff.id,
            orgId: loc.organization_id,
            orgName: org?.name || 'Unknown',
            locationName: loc.name,
            roleId: staff.role_id,
            roleName: role?.role_name || 'Unknown'
          });
        }
      } catch (error) {
        console.error('Failed to load user org:', error);
      }
    };
    loadUserOrg();
  }, []);

  // Load available orgs on mount
  useEffect(() => {
    const loadOrgs = async () => {
      setLoadingOrgs(true);
      try {
        const { data } = await supabase
          .from('organizations')
          .select('id, name')
          .eq('active', true)
          .order('name');
        
        setAvailableOrgs(data || []);
        // Auto-populate first org if available
        if (data && data.length > 0 && !orgId) {
          setOrgId(data[0].id);
        }
      } catch (error) {
        console.error('Failed to load orgs:', error);
      } finally {
        setLoadingOrgs(false);
      }
    };
    loadOrgs();
  }, []); // Empty deps - load once on mount

  const seedLockedThisWeek = async () => {
    if (!orgId || !userOrgInfo) {
      toast({ title: 'Missing org ID or user info', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      // Get org timezone
      const { data: locations } = await supabase
        .from('locations')
        .select('timezone')
        .eq('organization_id', orgId)
        .limit(1);

      const tz = locations?.[0]?.timezone || 'America/Chicago';

      // Use getWeekAnchors to calculate Monday (same as system does)
      const { getWeekAnchors } = await import('@/v2/time');
      const anchors = getWeekAnchors(new Date(), tz);
      const mondayStr = format(anchors.mondayZ, 'yyyy-MM-dd');
      
      console.log('[TestConsole] Seeding for Monday:', mondayStr, 'in timezone:', tz, 'staff:', userOrgInfo.staffId);

      // Get 3 random active pro moves with full details
      const { data: proMoves } = await supabase
        .from('pro_moves')
        .select(`
          action_id, 
          action_statement, 
          competency_id,
          competencies!inner(name, domain_id)
        `)
        .eq('role_id', roleId)
        .eq('active', true)
        .limit(10);

      if (!proMoves || proMoves.length < 3) {
        toast({ title: 'Not enough pro moves for this role', variant: 'destructive' });
        return;
      }

      // Pick 3 random ones
      const shuffled = [...proMoves].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, 3);

      // Get domain names for the selected moves
      const domainIds = [...new Set(selected.map((pm: any) => pm.competencies.domain_id))];
      const { data: domains } = await supabase
        .from('domains')
        .select('domain_id, domain_name')
        .in('domain_id', domainIds);

      const domainMap = new Map((domains || []).map(d => [d.domain_id, d.domain_name]));

      // Delete any existing weekly_plan rows for this week/org/role
      const { error: deletePlanError } = await supabase
        .from('weekly_plan')
        .delete()
        .eq('org_id', orgId)
        .eq('role_id', roleId)
        .eq('week_start_date', mondayStr);

      if (deletePlanError) throw deletePlanError;

      // Note: Skipping weekly_focus delete due to TS type issues
      // Manual cleanup via SQL: DELETE FROM weekly_focus WHERE staff_id = '...' AND cycle = 3 AND week_in_cycle = 6;

      // Insert locked plan
      const { error: planError } = await supabase
        .from('weekly_plan')
        .insert(
          selected.map((pm, idx) => ({
            org_id: orgId,
            role_id: roleId,
            week_start_date: mondayStr,
            display_order: idx + 1,
            action_id: pm.action_id,
            self_select: false,
            status: 'locked',
            generated_by: 'manual',
            locked_at: new Date().toISOString()
          }))
        );

      if (planError) throw planError;

      // Insert weekly_focus rows for the user
      const { error: focusError } = await supabase
        .from('weekly_focus')
        .insert(
          selected.map((pm: any, idx) => ({
            staff_id: userOrgInfo.staffId,
            action_id: pm.action_id,
            action_statement: pm.action_statement,
            competency_id: pm.competency_id,
            competency_name: pm.competencies.name,
            domain_id: pm.competencies.domain_id,
            domain_name: domainMap.get(pm.competencies.domain_id) || 'Unknown',
            cycle: 3, // hardcoded for testing
            week_in_cycle: 6, // hardcoded for testing
            display_order: idx + 1,
            self_select: false
          }))
        );

      if (focusError) throw focusError;

      toast({ title: 'Seeded test data', description: `Created 3 locked rows in weekly_plan AND weekly_focus for ${mondayStr}` });
      console.log('[TestConsole] ✅ Seeded to both tables:', { mondayStr, orgId, roleId, staffId: userOrgInfo.staffId });
      await checkCurrentWeekSource();
    } catch (error: any) {
      console.error('Seed error:', error);
      toast({ title: 'Seed failed', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const checkCurrentWeekSource = async () => {
    if (!orgId) {
      toast({ title: 'Missing org ID', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      // Get org timezone
      const { data: locations } = await supabase
        .from('locations')
        .select('timezone')
        .eq('organization_id', orgId)
        .limit(1);

      const tz = locations?.[0]?.timezone || 'America/Chicago';

      // Use getWeekAnchors to calculate Monday (same as system does)
      const { getWeekAnchors } = await import('@/v2/time');
      const anchors = getWeekAnchors(new Date(), tz);
      const mondayStr = format(anchors.mondayZ, 'yyyy-MM-dd');
      
      console.log('[TestConsole] Checking for Monday:', mondayStr, 'in timezone:', tz);

      // Check weekly_plan
      const { data: planData } = await supabase
        .from('weekly_plan')
        .select('id, action_id, display_order, status, pro_moves(action_statement)')
        .eq('org_id', orgId)
        .eq('role_id', roleId)
        .eq('week_start_date', mondayStr)
        .eq('status', 'locked')
        .order('display_order');

      if (planData && planData.length === 3) {
        setWeekSource('plan');
        setFocusIds(planData.map(p => `plan:${p.id}`));
        setOrgData({
          source: 'weekly_plan',
          count: planData.length,
          monday: mondayStr,
          moves: planData.map((p: any) => ({
            id: p.id,
            action_id: p.action_id,
            display_order: p.display_order,
            statement: p.pro_moves?.action_statement || 'Unknown'
          }))
        });
      } else {
        // Fallback to weekly_focus (would need cycle/week calculation)
        setWeekSource('focus');
        setFocusIds([]);
        setOrgData({
          source: 'weekly_focus',
          count: 0,
          monday: mondayStr,
          message: 'No locked weekly_plan found (would use weekly_focus in real app)'
        });
      }
    } catch (error: any) {
      console.error('Check error:', error);
      toast({ title: 'Check failed', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const runRolloverDryRun = async () => {
    if (!orgId) {
      toast({ title: 'Missing org ID', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sequencer-rollover', {
        body: {
          orgId,
          roles: [roleId],
          dryRun: true,
          forceRollover: true // Skip time/gate checks for testing
        }
      });

      if (error) throw error;

      console.log('Rollover dry run result:', data);
      toast({ 
        title: 'Dry run complete', 
        description: `Check console for results. Success: ${data.success}` 
      });
    } catch (error: any) {
      console.error('Rollover error:', error);
      toast({ title: 'Rollover failed', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const clearTestData = async () => {
    if (!orgId) {
      toast({ title: 'Missing org ID', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      // Get org timezone
      const { data: locations } = await supabase
        .from('locations')
        .select('timezone')
        .eq('organization_id', orgId)
        .limit(1);

      const tz = locations?.[0]?.timezone || 'America/Chicago';

      // Use getWeekAnchors to calculate Monday (same as system does)
      const { getWeekAnchors } = await import('@/v2/time');
      const anchors = getWeekAnchors(new Date(), tz);
      const mondayStr = format(anchors.mondayZ, 'yyyy-MM-dd');
      
      console.log('[TestConsole] Clearing for Monday:', mondayStr);

      // Delete test plans created by test console
      const { error } = await supabase
        .from('weekly_plan')
        .delete()
        .eq('org_id', orgId)
        .eq('week_start_date', mondayStr)
        .eq('generated_by', 'manual');

      if (error) throw error;

      toast({ title: 'Test data cleared' });
      setWeekSource('unknown');
      setFocusIds([]);
      setOrgData(null);
    } catch (error: any) {
      console.error('Clear error:', error);
      toast({ title: 'Clear failed', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            🧪 Sequencer Test Console
          </CardTitle>
          <CardDescription>
            Test the hybrid weekly_plan/weekly_focus system without SQL
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* User's Current Org Info */}
          {userOrgInfo && (
            <Alert>
              <AlertTitle>Your Staff Record</AlertTitle>
              <AlertDescription>
                <div className="space-y-1 text-sm mt-2">
                  <div>Organization: <strong>{userOrgInfo.orgName}</strong></div>
                  <div>Location: <strong>{userOrgInfo.locationName}</strong></div>
                  <div>Role: <strong>{userOrgInfo.roleName}</strong> (ID: {userOrgInfo.roleId})</div>
                  <div className="text-xs text-muted-foreground">Org ID: {userOrgInfo.orgId}</div>
                  <div className="text-xs text-muted-foreground">Staff ID: {userOrgInfo.staffId}</div>
                  <div className="mt-2 text-yellow-600">
                    ⚠️ Test data will be seeded for THIS organization and role!
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Configuration */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgId">Organization</Label>
              {loadingOrgs ? (
                <div className="text-sm text-muted-foreground">Loading organizations...</div>
              ) : availableOrgs.length > 0 ? (
                <select
                  id="orgId"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={orgId}
                  onChange={e => setOrgId(e.target.value)}
                >
                  {availableOrgs.map(org => (
                    <option key={org.id} value={org.id}>
                      {org.name} ({org.id.substring(0, 8)}...)
                    </option>
                  ))}
                </select>
              ) : (
                <Input 
                  id="orgId"
                  placeholder="Enter org UUID manually" 
                  value={orgId} 
                  onChange={e => setOrgId(e.target.value)} 
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="roleId">Role</Label>
              <select
                id="roleId"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={roleId}
                onChange={e => setRoleId(parseInt(e.target.value))}
              >
                <option value={1}>1 - Coach</option>
                <option value={2}>2 - Lead Coach</option>
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3">
            <Button 
              onClick={seedLockedThisWeek} 
              disabled={loading || !orgId}
              className="w-full"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Seed Locked This Week
            </Button>
            <Button 
              onClick={checkCurrentWeekSource} 
              variant="outline"
              disabled={loading || !orgId}
              className="w-full"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Check Week Source
            </Button>
            <Button 
              onClick={runRolloverDryRun} 
              variant="secondary"
              disabled={loading || !orgId}
              className="w-full"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Run Rollover (Dry Run)
            </Button>
            <Button 
              onClick={clearTestData} 
              variant="destructive"
              disabled={loading || !orgId}
              className="w-full"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Clear Test Data
            </Button>
          </div>

          {/* Results */}
          {weekSource !== 'unknown' && orgData && (
            <Alert>
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <AlertTitle className="flex items-center gap-2">
                    {weekSource === 'plan' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-yellow-600" />
                    )}
                    Current Week Source: 
                    <Badge variant={weekSource === 'plan' ? 'default' : 'secondary'}>
                      {orgData.source}
                    </Badge>
                  </AlertTitle>
                  <AlertDescription>
                    <div className="space-y-2 mt-3">
                      <div className="text-sm text-muted-foreground">
                        Monday: {orgData.monday}
                      </div>
                      {orgData.moves && (
                        <div className="font-mono text-xs space-y-1 bg-muted p-3 rounded">
                          <div className="font-semibold mb-2">Focus IDs:</div>
                          {focusIds.map((id, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="text-muted-foreground">{i + 1}.</span>
                              <span className="text-primary">{id}</span>
                              {orgData.moves[i] && (
                                <span className="text-muted-foreground text-xs">
                                  ({orgData.moves[i].statement.substring(0, 40)}...)
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {orgData.message && (
                        <div className="text-sm text-yellow-600">
                          {orgData.message}
                        </div>
                      )}
                    </div>
                  </AlertDescription>
                </div>
              </div>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Testing Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <strong>1. Seed Test Data</strong>
            <p className="text-muted-foreground">Click "Seed Locked This Week" to create 3 locked weekly_plan rows for the current Monday.</p>
          </div>
          <div>
            <strong>2. Check Source</strong>
            <p className="text-muted-foreground">Click "Check Week Source" to verify the system detects weekly_plan (should show "plan:&lt;id&gt;" format).</p>
          </div>
          <div>
            <strong>3. Test Pages</strong>
            <p className="text-muted-foreground">Navigate to Week, Confidence, or Performance pages. Open browser console and look for log lines showing which source is used.</p>
          </div>
          <div>
            <strong>4. Submit Scores</strong>
            <p className="text-muted-foreground">Submit a confidence or performance score. Check the console for validation logs showing "plan:&lt;id&gt;" format.</p>
          </div>
          <div>
            <strong>5. Verify Database</strong>
            <p className="text-muted-foreground">Check weekly_scores table - the weekly_focus_id column should contain "plan:123" (not UUID).</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
