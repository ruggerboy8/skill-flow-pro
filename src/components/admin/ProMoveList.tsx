import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Edit, Eye, EyeOff } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface ProMove {
  action_id: number;
  action_statement: string;
  description: string | null;
  resources_url: string | null;
  active: boolean;
  updated_at: string;
  role_name: string;
  competency_name: string;
}

interface ProMoveListProps {
  roleFilter: string;
  competencyFilter: string;
  searchTerm: string;
  activeOnly: boolean;
  onEdit: (proMove: ProMove) => void;
}

export function ProMoveList({ 
  roleFilter, 
  competencyFilter, 
  searchTerm, 
  activeOnly, 
  onEdit 
}: ProMoveListProps) {
  const { toast } = useToast();
  const [proMoves, setProMoves] = useState<ProMove[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProMoves();
  }, [roleFilter, competencyFilter, searchTerm, activeOnly]);

  const loadProMoves = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('pro_moves')
        .select(`
          action_id,
          action_statement,
          description,
          resources_url,
          active,
          updated_at,
          competencies (
            competency_id,
            name,
            role_id,
            roles (
              role_name
            )
          )
        `)
        .order('updated_at', { ascending: false });

      // Apply role filter through competencies
      if (roleFilter && roleFilter !== 'all') {
        query = query.eq('competencies.role_id', parseInt(roleFilter));
      }
      
      if (competencyFilter && competencyFilter !== 'all') {
        query = query.eq('competency_id', parseInt(competencyFilter));
      }
      
      if (activeOnly) {
        query = query.eq('active', true);
      }
      
      if (searchTerm) {
        query = query.ilike('action_statement', `%${searchTerm}%`);
      }

      const { data, error } = await query;

      if (error) throw error;

      const formattedData = data?.map(item => ({
        action_id: item.action_id,
        action_statement: item.action_statement,
        description: item.description,
        resources_url: item.resources_url,
        active: item.active,
        updated_at: item.updated_at,
        role_name: (item.competencies as any)?.roles?.role_name || 'Unknown',
        competency_name: (item.competencies as any)?.name || 'Unknown'
      })) || [];

      setProMoves(formattedData);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load pro-moves.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (proMove: ProMove) => {
    try {
      const { error } = await supabase
        .from('pro_moves')
        .update({ active: !proMove.active })
        .eq('action_id', proMove.action_id);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Pro-move ${proMove.active ? 'retired' : 'restored'} successfully.`,
      });

      loadProMoves();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update pro-move status.",
        variant: "destructive"
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return <div className="text-center py-8">Loading pro-moves...</div>;
  }

  if (proMoves.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No pro-moves found matching your criteria.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pro-Move</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Competency</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {proMoves.map((proMove) => (
            <TableRow key={proMove.action_id}>
              <TableCell className="max-w-md">
                <div className="font-medium">{proMove.action_statement}</div>
                {proMove.description && (
                  <div className="text-sm text-muted-foreground mt-1">
                    {proMove.description}
                  </div>
                )}
                {proMove.resources_url && (
                  <div className="text-sm text-blue-600 mt-1">
                    <a href={proMove.resources_url} target="_blank" rel="noopener noreferrer">
                      Resource Link
                    </a>
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{proMove.role_name}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{proMove.competency_name}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={proMove.active ? "default" : "destructive"}>
                  {proMove.active ? "Active" : "Retired"}
                </Badge>
              </TableCell>
              <TableCell>{formatDate(proMove.updated_at)}</TableCell>
              <TableCell className="text-right">
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(proMove)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        {proMove.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {proMove.active ? 'Retire Pro-Move?' : 'Restore Pro-Move?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {proMove.active 
                            ? "Retiring a Pro-Move hides it from selection going forward. Historical records are preserved."
                            : "Restoring a Pro-Move will make it available for selection again."
                          }
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => toggleActive(proMove)}>
                          {proMove.active ? 'Retire' : 'Restore'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}