import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

interface Role {
  role_id: number;
  role_name: string;
}

export default function RoleList() {
  const [roles, setRoles] = useState<Role[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    const { data } = await supabase
      .from('roles')
      .select('role_id, role_name')
      .order('role_name');
    
    if (data) setRoles(data);
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Admin Builder</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
        {roles.map(role => (
          <Card 
            key={role.role_id}
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate(`/builder/${role.role_id}`)}
          >
            <CardHeader>
              <CardTitle className="text-2xl text-center">{role.role_name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-center text-muted-foreground">
                Manage weekly focus for {role.role_name} role
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}