import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { Link } from 'react-router-dom';
import { ClipboardCheck, CheckCircle2, BookOpen } from 'lucide-react';

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
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <div>
                <CardTitle>Baseline Complete</CardTitle>
                <CardDescription>
                  Your baseline self-assessment has been submitted.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Dr. Alex will reach out to schedule your baseline check-in conversation.
            </p>
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

      {/* My Role Card - Links to Pro Move Library */}
      <Card className="hover:shadow-md transition-shadow">
        <Link to="/doctor/my-role">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <BookOpen className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">My Role</CardTitle>
                <CardDescription>
                  Explore the doctor competency blueprint and pro moves
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Link>
      </Card>
    </div>
  );
}
