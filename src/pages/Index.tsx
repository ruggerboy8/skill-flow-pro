import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import ThisWeekPanel from '@/components/home/ThisWeekPanel';
import { SimFloatingButton } from '@/devtools/SimConsole';

interface Staff {
  id: string;
  role_id: number;
}

export default function Index() {
  const [staff, setStaff] = useState<Staff | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      loadStaffProfile();
    }
  }, [user]);

  const loadStaffProfile = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('staff')
      .select('id, role_id')
      .eq('user_id', user.id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No staff record found, redirect to setup
        navigate('/setup');
      } else {
        toast({
          title: "Error",
          description: "Failed to load profile",
          variant: "destructive"
        });
      }
    } else {
      setStaff(data);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">SkillCheck Progress</h1>
        </div>

        <ThisWeekPanel />
        
        {/* Future space for notes, learning resources, etc. */}
      </div>
      
      <SimFloatingButton isAdmin={user?.email === 'johno@reallygoodconsulting.org' || user?.email === 'ryanjoberly@gmail.com'} />
    </div>
  );
}