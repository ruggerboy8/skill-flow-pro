import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserPlus, ArrowLeft, Mail, MoreHorizontal } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { InviteDoctorDialog } from '@/components/clinical/InviteDoctorDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';

interface DoctorRow {
  id: string;
  name: string;
  email: string;
  location_name: string | null;
  baseline_status: 'invited' | 'in_progress' | 'completed';
  created_at: string;
}

export default function DoctorManagement() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const navigate = useNavigate();

  const { data: doctors, isLoading, refetch } = useQuery({
    queryKey: ['doctors-management'],
    queryFn: async (): Promise<DoctorRow[]> => {
      // Get all doctors with location info
      const { data: staffData, error: staffErr } = await supabase
        .from('staff')
        .select(`
          id,
          name,
          email,
          created_at,
          locations (name)
        `)
        .eq('is_doctor', true)
        .order('name');
      
      if (staffErr) throw staffErr;
      
      const doctorIds = staffData?.map(d => d.id) || [];
      
      if (doctorIds.length === 0) return [];
      
      // Get baseline statuses
      const { data: baselines, error: baselineErr } = await supabase
        .from('doctor_baseline_assessments')
        .select('doctor_staff_id, status')
        .in('doctor_staff_id', doctorIds);
      
      if (baselineErr) throw baselineErr;
      
      const baselineMap = new Map(baselines?.map(b => [b.doctor_staff_id, b.status]) || []);
      
      return (staffData || []).map(s => ({
        id: s.id,
        name: s.name,
        email: s.email,
        location_name: (s.locations as any)?.name || null,
        baseline_status: (baselineMap.get(s.id) as 'in_progress' | 'completed') || 'invited',
        created_at: s.created_at || '',
      }));
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Complete</Badge>;
      case 'in_progress':
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">In Progress</Badge>;
      default:
        return <Badge variant="secondary">Invited</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/clinical">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Doctor Management</h1>
          <p className="text-muted-foreground">Invite and manage doctors in the program</p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="w-4 h-4 mr-2" />
          Invite Doctor
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Doctors</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : doctors?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No doctors have been invited yet.</p>
              <Button className="mt-4" onClick={() => setInviteOpen(true)}>
                <UserPlus className="w-4 h-4 mr-2" />
                Invite Your First Doctor
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Baseline Status</TableHead>
                  <TableHead>Invited</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {doctors?.map((doctor) => (
                  <TableRow 
                    key={doctor.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/clinical/doctors/${doctor.id}`)}
                  >
                    <TableCell className="font-medium">{doctor.name}</TableCell>
                    <TableCell>{doctor.email}</TableCell>
                    <TableCell>
                      {doctor.location_name || (
                        <span className="text-muted-foreground italic">Roaming</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(doctor.baseline_status)}</TableCell>
                    <TableCell>
                      {doctor.created_at ? format(new Date(doctor.created_at), 'MMM d, yyyy') : '—'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/clinical/doctors/${doctor.id}`);
                          }}>
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                            <Mail className="h-4 w-4 mr-2" />
                            Resend Invite
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <InviteDoctorDialog 
        open={inviteOpen} 
        onOpenChange={setInviteOpen} 
        onSuccess={() => refetch()}
      />
    </div>
  );
}