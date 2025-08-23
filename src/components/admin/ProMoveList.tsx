import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Edit, Eye, EyeOff, Trash2 } from 'lucide-react';
import { getDomainColor } from '@/lib/domainColors';
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
  role_id: number;
  competency_id: number;
  role_name: string;
  competency_name: string;
  domain_name: string;
}

interface ProMoveListProps {
  roleFilter: string;
  competencyFilter: string;
  searchTerm: string;
  activeOnly: boolean;
  sortBy: 'domain' | 'competency' | 'updated';
  onEdit: (proMove: ProMove) => void;
}

export function ProMoveList({ 
  roleFilter, 
  competencyFilter, 
  searchTerm, 
  activeOnly,
  sortBy, 
  onEdit 
}: ProMoveListProps) {
  const { toast } = useToast();
  const [proMoves, setProMoves] = useState<ProMove[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProMoves();
  }, [roleFilter, competencyFilter, searchTerm, activeOnly, sortBy]);

  const loadProMoves = async () => {
    console.log('=== LOADING PRO MOVES ===', { roleFilter, competencyFilter, searchTerm, activeOnly });
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
          role_id,
          competency_id
        `)
        .order('updated_at', { ascending: false });

      // Apply filters
      if (roleFilter && roleFilter !== 'all') {
        query = query.eq('role_id', parseInt(roleFilter));
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
      console.log('=== PRO MOVES QUERY RESULT ===', { data, error });

      if (error) throw error;

      // Get role and competency names separately to avoid join issues
      const roleIds = [...new Set(data?.map(item => item.role_id).filter(Boolean))];
      const competencyIds = [...new Set(data?.map(item => item.competency_id).filter(Boolean))];
      
      const [rolesData, competenciesData] = await Promise.all([
        roleIds.length > 0 ? supabase.from('roles').select('role_id, role_name').in('role_id', roleIds) : { data: [] },
        competencyIds.length > 0 ? supabase.from('competencies').select(`
          competency_id, 
          name, 
          domains!competencies_domain_id_fkey (
            domain_name
          )
        `).in('competency_id', competencyIds) : { data: [] }
      ]);

      const rolesMap = new Map((rolesData.data || []).map(r => [r.role_id, r.role_name]));
      const competenciesMap = new Map((competenciesData.data || []).map(c => [
        c.competency_id, 
        { 
          name: c.name, 
          domain_name: (c.domains as any)?.domain_name || 'Unknown' 
        }
      ]));

      let formattedData = data?.map(item => ({
        action_id: item.action_id,
        action_statement: item.action_statement,
        description: item.description,
        resources_url: item.resources_url,
        active: item.active,
        updated_at: item.updated_at,
        role_id: item.role_id,
        competency_id: item.competency_id,
        role_name: rolesMap.get(item.role_id) || 'Unknown',
        competency_name: competenciesMap.get(item.competency_id)?.name || 'Unknown',
        domain_name: competenciesMap.get(item.competency_id)?.domain_name || 'Unknown'
      })) || [];
      
      // Apply sorting
      if (sortBy === 'domain') {
        formattedData.sort((a, b) => a.domain_name.localeCompare(b.domain_name));
      } else if (sortBy === 'competency') {
        formattedData.sort((a, b) => a.competency_name.localeCompare(b.competency_name));
      } else {
        formattedData.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      }
      
      console.log('=== FORMATTED PRO MOVES ===', formattedData);
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

  const deleteProMove = async (proMove: ProMove) => {
    try {
      const { error } = await supabase
        .from('pro_moves')
        .delete()
        .eq('action_id', proMove.action_id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Pro-move deleted successfully.",
      });

      loadProMoves();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete pro-move.",
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
            <TableHead>Domain</TableHead>
            <TableHead>Competency</TableHead>
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
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: getDomainColor(proMove.domain_name) }}
                  />
                  <span className="font-medium">{proMove.domain_name}</span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: getDomainColor(proMove.domain_name) }}
                  />
                  <Badge variant="secondary">{proMove.competency_name}</Badge>
                </div>
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

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Pro-Move?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete the pro-move and all associated data. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => deleteProMove(proMove)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
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