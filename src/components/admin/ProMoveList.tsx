import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Edit, 
  Eye, 
  EyeOff, 
  Trash2, 
  GraduationCap, 
  Video, 
  FileText, 
  Volume2, 
  Link as LinkIcon,
  Play
} from 'lucide-react';
import { getDomainColor } from '@/lib/domainColors';
import { LearningDrawer } from './LearningDrawer';
import { LearnerLearnDrawer } from '@/components/learner/LearnerLearnDrawer';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

interface ResourceStatus {
  hasVideo: boolean;
  hasScript: boolean;
  hasAudio: boolean;
  linkCount: number;
}

interface ProMoveListProps {
  roleFilter: string;
  competencyFilter: string;
  searchTerm: string;
  activeOnly: boolean;
  resourceFilter?: string;
  sortBy: 'domain' | 'competency' | 'updated';
  onEdit: (proMove: ProMove) => void;
}

export function ProMoveList({ 
  roleFilter, 
  competencyFilter, 
  searchTerm, 
  activeOnly,
  resourceFilter = 'all',
  sortBy, 
  onEdit 
}: ProMoveListProps) {
  const { toast } = useToast();
  const [proMoves, setProMoves] = useState<ProMove[]>([]);
  const [loading, setLoading] = useState(true);
  const [resourceStatus, setResourceStatus] = useState<Map<number, ResourceStatus>>(new Map());
  const [learningDrawerOpen, setLearningDrawerOpen] = useState(false);
  const [previewDrawerOpen, setPreviewDrawerOpen] = useState(false);
  const [selectedProMove, setSelectedProMove] = useState<ProMove | null>(null);

  useEffect(() => {
    loadProMoves();
  }, [roleFilter, competencyFilter, searchTerm, activeOnly, sortBy]);

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

      if (error) throw error;

      // Get role and competency names separately
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
      
      setProMoves(formattedData);
      
      // Fetch specific resource types for all loaded pro-moves
      if (formattedData.length > 0) {
        const actionIds = formattedData.map(pm => pm.action_id);
        const { data: resourcesData } = await supabase
          .from('pro_move_resources')
          .select('action_id, type')
          .in('action_id', actionIds)
          .eq('status', 'active');
        
        const statusMap = new Map<number, ResourceStatus>();
        
        // Initialize all with empty status
        actionIds.forEach(id => {
          statusMap.set(id, { hasVideo: false, hasScript: false, hasAudio: false, linkCount: 0 });
        });

        // Fill in actual data
        resourcesData?.forEach(r => {
          const current = statusMap.get(r.action_id)!;
          if (r.type === 'video') current.hasVideo = true;
          if (r.type === 'script') current.hasScript = true;
          if (r.type === 'audio') current.hasAudio = true;
          if (r.type === 'link') current.linkCount++;
        });

        setResourceStatus(statusMap);
      }
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

  const { sortedData, sortConfig, handleSort } = useTableSort(proMoves);

  // Apply resource filter
  const filteredData = sortedData.filter(proMove => {
    const status = resourceStatus.get(proMove.action_id);
    if (!status) return true;

    switch (resourceFilter) {
      case 'has_materials':
        return status.hasVideo || status.hasScript || status.hasAudio || status.linkCount > 0;
      case 'missing_video':
        return !status.hasVideo;
      case 'missing_script':
        return !status.hasScript;
      case 'missing_audio':
        return !status.hasAudio;
      case 'incomplete':
        return !status.hasVideo || !status.hasScript || !status.hasAudio;
      default:
        return true;
    }
  });

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

      if (error) {
        if (error.message.includes('violates foreign key constraint') || 
            error.message.includes('weekly_focus_action_id_fkey')) {
          toast({
            title: "Cannot Delete Pro-Move",
            description: "This pro-move is currently assigned in weekly focus schedules. Please retire it instead.",
            variant: "destructive"
          });
          return;
        }
        throw error;
      }

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

  const openLearningDrawer = (proMove: ProMove) => {
    setSelectedProMove(proMove);
    setLearningDrawerOpen(true);
  };

  const openPreviewDrawer = (proMove: ProMove) => {
    setSelectedProMove(proMove);
    setPreviewDrawerOpen(true);
  };

  const handleResourcesChange = (actionId: number, summary: { video: boolean; script: boolean; links: number; total: number; audio?: boolean }) => {
    setResourceStatus((prev) => {
      const updated = new Map(prev);
      updated.set(actionId, {
        hasVideo: summary.video,
        hasScript: summary.script,
        hasAudio: !!summary.audio,
        linkCount: summary.links
      });
      return updated;
    });
  };

  if (loading) {
    return <div className="text-center py-8">Loading pro-moves...</div>;
  }

  if (filteredData.length === 0) {
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
            <SortableTableHead sortKey="action_statement" currentSortKey={sortConfig.key} sortOrder={sortConfig.order} onSort={handleSort} className="w-[40%]">
              Pro-Move
            </SortableTableHead>
            <TableHead className="w-[25%]">Context</TableHead>
            <TableHead className="w-[15%]">Materials</TableHead>
            <SortableTableHead sortKey="updated_at" currentSortKey={sortConfig.key} sortOrder={sortConfig.order} onSort={handleSort} className="w-[10%]">
              Updated
            </SortableTableHead>
            <TableHead className="text-right w-[10%]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredData.map((proMove) => {
            const status = resourceStatus.get(proMove.action_id) || { hasVideo: false, hasScript: false, hasAudio: false, linkCount: 0 };
            
            return (
              <TableRow key={proMove.action_id} className={!proMove.active ? 'opacity-60 bg-muted/50' : ''}>
                <TableCell className="max-w-md align-top">
                  <div className="font-medium">{proMove.action_statement}</div>
                  {!proMove.active && (
                    <Badge variant="secondary" className="mt-1 text-[10px] h-5">Retired</Badge>
                  )}
                </TableCell>
                
                {/* Condensed Context Column */}
                <TableCell className="align-top">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs font-normal">
                        {proMove.role_name}
                      </Badge>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <div 
                          className="w-2 h-2 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: getDomainColor(proMove.domain_name) }}
                        />
                        <span>{proMove.domain_name}</span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground font-medium pl-1">
                      {proMove.competency_name}
                    </div>
                  </div>
                </TableCell>

                {/* Enhanced Materials Column */}
                <TableCell className="align-top">
                  <div className="flex items-center gap-3 pt-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className={`flex items-center justify-center w-8 h-8 rounded-full border ${status.hasVideo ? 'bg-blue-50 text-blue-600 border-blue-100' : 'text-muted-foreground/20 border-transparent'}`}>
                            <Video className="w-4 h-4" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{status.hasVideo ? 'Video attached' : 'No video'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className={`flex items-center justify-center w-8 h-8 rounded-full border ${status.hasScript ? 'bg-green-50 text-green-600 border-green-100' : 'text-muted-foreground/20 border-transparent'}`}>
                            <FileText className="w-4 h-4" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{status.hasScript ? 'Script attached' : 'No script'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className={`flex items-center justify-center w-8 h-8 rounded-full border ${status.hasAudio ? 'bg-purple-50 text-purple-600 border-purple-100' : 'text-muted-foreground/20 border-transparent'}`}>
                            <Volume2 className="w-4 h-4" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{status.hasAudio ? 'Audio attached' : 'No audio'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {status.linkCount > 0 && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-50 text-gray-600 border border-gray-100">
                              <LinkIcon className="w-3 h-3 mr-0.5" />
                              <span className="text-[10px] font-bold">{status.linkCount}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{status.linkCount} additional link{status.linkCount !== 1 ? 's' : ''}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </TableCell>

                <TableCell className="text-sm text-muted-foreground align-top pt-3">
                  {formatDate(proMove.updated_at)}
                </TableCell>

                <TableCell className="text-right align-top">
                  <div className="flex gap-1 justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openPreviewDrawer(proMove)}
                      title="Preview as Learner"
                    >
                      <Play className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openLearningDrawer(proMove)}
                      title="Manage Learning Materials"
                    >
                      <GraduationCap className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onEdit(proMove)}
                      title="Edit Pro-Move"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title={proMove.active ? 'Retire' : 'Restore'}>
                          {proMove.active ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
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
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" title="Delete Permanently">
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
            );
          })}
        </TableBody>
      </Table>

      {selectedProMove && (
        <>
          <LearningDrawer
            actionId={selectedProMove.action_id}
            proMoveTitle={selectedProMove.action_statement}
            domainName={selectedProMove.domain_name}
            open={learningDrawerOpen}
            onOpenChange={setLearningDrawerOpen}
            onResourcesChange={(summary) => handleResourcesChange(selectedProMove.action_id, summary)}
          />
          <LearnerLearnDrawer
            actionId={selectedProMove.action_id}
            proMoveTitle={selectedProMove.action_statement}
            domainName={selectedProMove.domain_name}
            open={previewDrawerOpen}
            onOpenChange={setPreviewDrawerOpen}
          />
        </>
      )}
    </div>
  );
}
