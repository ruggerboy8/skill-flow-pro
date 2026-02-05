import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, MapPin, Calendar, ClipboardCheck } from 'lucide-react';
import { format } from 'date-fns';
import { BaselineSummaryPanel } from '@/components/clinical/BaselineSummaryPanel';

export default function DoctorDetail() {
  const { staffId } = useParams<{ staffId: string }>();

  const { data: doctor, isLoading: doctorLoading } = useQuery({
    queryKey: ['doctor-detail', staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff')
        .select(`
          id,
          name,
          email,
          created_at,
          locations (name)
        `)
        .eq('id', staffId)
        .eq('is_doctor', true)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!staffId,
  });

  const { data: baseline, isLoading: baselineLoading } = useQuery({
    queryKey: ['doctor-baseline', staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doctor_baseline_assessments')
        .select('id, status, started_at, completed_at')
        .eq('doctor_staff_id', staffId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!staffId,
  });

  const isLoading = doctorLoading || baselineLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Doctor not found</p>
        <Link to="/clinical/doctors">
          <Button variant="link">Back to Doctor Management</Button>
        </Link>
      </div>
    );
  }

  const getStatusBadge = () => {
    if (!baseline) {
      return <Badge variant="secondary">Invited</Badge>;
    }
    if (baseline.status === 'completed') {
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Baseline Complete</Badge>;
    }
    return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Baseline In Progress</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/clinical/doctors">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{doctor.name}</h1>
            {getStatusBadge()}
          </div>
          <p className="text-muted-foreground">{doctor.email}</p>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Location</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {(doctor.locations as any)?.name || 'Roaming'}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Invited</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {doctor.created_at ? format(new Date(doctor.created_at), 'MMM d, yyyy') : '—'}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Baseline</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {baseline?.completed_at 
                ? format(new Date(baseline.completed_at), 'MMM d, yyyy')
                : baseline?.started_at 
                  ? 'In Progress'
                  : 'Not Started'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Baseline Summary */}
      <BaselineSummaryPanel 
        staffId={staffId!} 
        assessmentId={baseline?.id}
        status={baseline?.status}
      />
    </div>
  );
}