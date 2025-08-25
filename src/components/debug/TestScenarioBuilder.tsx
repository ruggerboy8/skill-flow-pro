import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FlaskConical, Play, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export function TestScenarioBuilder() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [scenario, setScenario] = useState({
    cycle: 2,
    week: 1,
    confidenceOnly: true, // Create scores with confidence but no performance
  });

  const createTestScenario = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Get staff info
      const { data: staff } = await supabase
        .from('staff')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (!staff) {
        toast.error('Staff record not found');
        return;
      }

      // Get weekly focus for the specified cycle/week
      const { data: focusItems } = await supabase
        .from('weekly_focus')
        .select('id, action_id, self_select')
        .eq('role_id', staff.role_id)
        .eq('cycle', scenario.cycle)
        .eq('week_in_cycle', scenario.week);

      if (!focusItems?.length) {
        toast.error(`No focus items found for C${scenario.cycle}W${scenario.week}`);
        return;
      }

      // Delete existing scores for this week
      await supabase
        .from('weekly_scores')
        .delete()
        .eq('staff_id', staff.id)
        .in('weekly_focus_id', focusItems.map(f => f.id));

      // Create new scores
      const scoresToInsert = focusItems.map(focus => ({
        staff_id: staff.id,
        weekly_focus_id: focus.id,
        confidence_score: scenario.confidenceOnly ? Math.floor(Math.random() * 5) + 1 : null,
        performance_score: scenario.confidenceOnly ? null : Math.floor(Math.random() * 5) + 1,
      }));

      await supabase
        .from('weekly_scores')
        .insert(scoresToInsert);

      toast.success(`Created test scenario: C${scenario.cycle}W${scenario.week} with ${scenario.confidenceOnly ? 'confidence only' : 'performance only'}`);
    } catch (error) {
      console.error('Failed to create test scenario:', error);
      toast.error('Failed to create test scenario');
    } finally {
      setLoading(false);
    }
  };

  const clearTestData = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data: staff } = await supabase
        .from('staff')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (!staff) return;

      // Clear all scores for this user
      await supabase
        .from('weekly_scores')
        .delete()
        .eq('staff_id', staff.id);

      // Clear all backlog items
      await supabase
        .from('user_backlog_v2')
        .delete()
        .eq('staff_id', staff.id);

      toast.success('Cleared all test data');
    } catch (error) {
      console.error('Failed to clear test data:', error);
      toast.error('Failed to clear test data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5" />
          Test Scenario Builder
        </CardTitle>
        <CardDescription>
          Create test scenarios for backlog rollover testing
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="cycle">Cycle</Label>
            <Input
              id="cycle"
              type="number"
              value={scenario.cycle}
              onChange={(e) => setScenario(prev => ({ ...prev, cycle: parseInt(e.target.value) || 1 }))}
              min={1}
              max={10}
            />
          </div>
          <div>
            <Label htmlFor="week">Week</Label>
            <Input
              id="week"
              type="number"
              value={scenario.week}
              onChange={(e) => setScenario(prev => ({ ...prev, week: parseInt(e.target.value) || 1 }))}
              min={1}
              max={6}
            />
          </div>
        </div>

        <div>
          <Label>Completion Status</Label>
          <Select 
            value={scenario.confidenceOnly ? "confidence" : "performance"} 
            onValueChange={(value) => setScenario(prev => ({ ...prev, confidenceOnly: value === "confidence" }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="confidence">Confidence Only (Incomplete)</SelectItem>
              <SelectItem value="performance">Performance Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="p-3 bg-muted rounded-lg">
          <h4 className="font-medium mb-2">Current Scenario:</h4>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline">C{scenario.cycle}W{scenario.week}</Badge>
            <Badge variant={scenario.confidenceOnly ? "destructive" : "default"}>
              {scenario.confidenceOnly ? "Incomplete (Confidence Only)" : "Complete"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {scenario.confidenceOnly 
              ? "This will create an incomplete week that should trigger rollover on Monday 12:01am"
              : "This will create a complete week that should NOT trigger rollover"
            }
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={createTestScenario} disabled={loading}>
            <Play className="h-4 w-4 mr-2" />
            Create Scenario
          </Button>
          <Button onClick={clearTestData} disabled={loading} variant="destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Clear All Test Data
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}