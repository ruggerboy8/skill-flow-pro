import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { Link } from 'react-router-dom';
import { ClipboardCheck, CheckCircle2, Eye } from 'lucide-react';
import { format } from 'date-fns';

export default function DoctorHome() {
  const { data: staff } = useStaffProfile();

  const { data: baseline } = useQuery({
    queryKey: ['my-baseline', staff?.id],
    queryFn: async () => {
      if (!staff?.id) return null;
      const { data, error } = await supabase
        .from('doctor_baseline_assessments')
        .select('id, status, completed_at')
        .eq('doctor_staff_id', staff.id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!staff?.id,
  });

  const displayName = staff?.name || 'Doctor';

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Welcome, {displayName}</h1>
        <p className="text-muted-foreground mt-2">
          Your professional development journey
        </p>
      </div>

      {baseline?.status === 'completed' ? (
        <Card className="border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
              <div>
                <CardTitle>Baseline Complete</CardTitle>
                <CardDescription>
                  {baseline.completed_at 
                    ? `Completed ${format(new Date(baseline.completed_at), 'MMMM d, yyyy')}`
                    : 'Your baseline self-assessment has been submitted.'
                  }
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Dr. Alex will reach out to schedule your baseline check-in conversation.
            </p>
            <Link to="/doctor/baseline-results">
              <Button variant="outline" className="w-full gap-2">
                <Eye className="h-4 w-4" />
                View My Baseline
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : baseline?.status === 'in_progress' ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <ClipboardCheck className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>Continue Your Baseline</CardTitle>
                <CardDescription>
                  You have an assessment in progress.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Link to="/doctor/baseline">
              <Button className="w-full">
                Continue Assessment
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <ClipboardCheck className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>Complete Your Baseline</CardTitle>
                <CardDescription>
                  Start your self-assessment to begin your development journey.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Link to="/doctor/baseline">
              <Button className="w-full">
                Start Baseline Assessment
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
