import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Check, X, Search, ArrowLeft, Trash2 } from 'lucide-react';
import { getDomainColor } from '@/lib/domainColors';
import { DoctorProMoveForm } from '@/components/clinical/DoctorProMoveForm';
import { DoctorMaterialsDrawer } from '@/components/clinical/DoctorMaterialsDrawer';
import { DOMAIN_ORDER } from '@/lib/domainUtils';

const DOCTOR_ROLE_ID = 4;

interface Competency {
  competency_id: number;
  name: string;
  domain_name?: string;
}

interface ProMove {
  action_id: number;
  action_statement: string;
  description: string | null;
  active: boolean;
  competency_id: number;
  competency_name: string;
  domain_name: string;
  resources: {
    has_why: boolean;
    has_script: boolean;
    has_gut_check: boolean;
    has_good_looks_like: boolean;
  };
}

export default function DoctorProMoveLibrary() {
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [proMoves, setProMoves] = useState<ProMove[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [selectedCompetency, setSelectedCompetency] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProMove, setEditingProMove] = useState<any>(null);
  const [selectedProMoveId, setSelectedProMoveId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<ProMove | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Get unique domains from competencies
  const domains = [...new Set(competencies.map(c => c.domain_name).filter(Boolean))];
  const sortedDomains = domains.sort((a, b) => {
    const aIdx = DOMAIN_ORDER.indexOf(a || '');
    const bIdx = DOMAIN_ORDER.indexOf(b || '');
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });

  // Filter competencies by selected domain
  const filteredCompetencies = selectedDomain === 'all' 
    ? competencies 
    : competencies.filter(c => c.domain_name === selectedDomain);

  useEffect(() => {
    loadCompetencies();
  }, []);

  useEffect(() => {
    loadProMoves();
  }, [selectedCompetency, showActiveOnly, refreshKey]);

  const loadCompetencies = async () => {
    const { data } = await supabase
      .from('competencies')
      .select(`
        competency_id, 
        name,
        domains!competencies_domain_id_fkey (
          domain_name
        )
      `)
      .eq('role_id', DOCTOR_ROLE_ID)
      .order('competency_id');
    
    if (data) {
      const formattedCompetencies = data.map(item => ({
        competency_id: item.competency_id,
        name: item.name,
        domain_name: (item.domains as any)?.domain_name || 'Unknown'
      }));
      setCompetencies(formattedCompetencies);
    }
  };

  const loadProMoves = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('pro_moves')
        .select(`
          action_id,
          action_statement,
          description,
          active,
          competency_id,
          competencies!fk_pro_moves_competency_id (
            name,
            domains!competencies_domain_id_fkey (
              domain_name
            )
          )
        `)
        .eq('role_id', DOCTOR_ROLE_ID);

      if (showActiveOnly) {
        query = query.eq('active', true);
      }

      if (selectedCompetency !== 'all') {
        query = query.eq('competency_id', parseInt(selectedCompetency));
      }

      const { data: pmData, error } = await query.order('action_id');

      if (error) throw error;

      // Fetch resources for all pro moves
      const actionIds = pmData?.map(pm => pm.action_id) || [];
      const { data: resources } = await supabase
        .from('pro_move_resources')
        .select('action_id, type')
        .in('action_id', actionIds)
        .in('type', ['doctor_why', 'doctor_script', 'doctor_gut_check', 'doctor_good_looks_like']);

      // Build resource map
      const resourceMap = new Map<number, Set<string>>();
      resources?.forEach(r => {
        if (!resourceMap.has(r.action_id)) {
          resourceMap.set(r.action_id, new Set());
        }
        resourceMap.get(r.action_id)!.add(r.type);
      });

      const formattedProMoves: ProMove[] = pmData?.map(pm => {
        const types = resourceMap.get(pm.action_id) || new Set();
        return {
          action_id: pm.action_id,
          action_statement: pm.action_statement || '',
          description: pm.description,
          active: pm.active ?? true,
          competency_id: pm.competency_id || 0,
          competency_name: (pm.competencies as any)?.name || 'Unknown',
          domain_name: (pm.competencies as any)?.domains?.domain_name || 'Unknown',
          resources: {
            has_why: types.has('doctor_why'),
            has_script: types.has('doctor_script'),
            has_gut_check: types.has('doctor_gut_check'),
            has_good_looks_like: types.has('doctor_good_looks_like'),
          },
        };
      }) || [];

      setProMoves(formattedProMoves);
    } catch (error) {
      console.error('Error loading pro moves:', error);
      toast({
        title: 'Error',
        description: 'Failed to load pro moves',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredProMoves = proMoves.filter(pm => {
    // Domain filter
    if (selectedDomain !== 'all' && pm.domain_name !== selectedDomain) return false;
    
    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matches = 
        pm.action_statement.toLowerCase().includes(term) ||
        pm.competency_name.toLowerCase().includes(term) ||
        pm.domain_name.toLowerCase().includes(term);
      if (!matches) return false;
    }
    
    return true;
  });

  const handleAddProMove = () => {
    setEditingProMove(null);
    setShowAddForm(true);
  };

  const handleEditProMove = (proMove: ProMove) => {
    setEditingProMove({
      action_id: proMove.action_id,
      action_statement: proMove.action_statement,
      description: proMove.description,
      active: proMove.active,
      competency_id: proMove.competency_id,
      role_id: DOCTOR_ROLE_ID,
    });
    setShowAddForm(true);
  };

  const handleFormClose = () => {
    setShowAddForm(false);
    setEditingProMove(null);
    setRefreshKey(prev => prev + 1);
  };

  const handleOpenMaterials = (actionId: number) => {
    setSelectedProMoveId(actionId);
  };

  const handleMaterialsClose = () => {
    setSelectedProMoveId(null);
    setRefreshKey(prev => prev + 1);
  };

  const handleDeleteProMove = async () => {
    if (!deleteTarget) return;
    
    setIsDeleting(true);
    try {
      // First delete any associated resources
      await supabase
        .from('pro_move_resources')
        .delete()
        .eq('action_id', deleteTarget.action_id);

      // Then delete the pro move
      const { error } = await supabase
        .from('pro_moves')
        .delete()
        .eq('action_id', deleteTarget.action_id);

      if (error) {
        // FK constraint violation - pro move is referenced elsewhere
        if (error.code === '23503') {
          toast({
            title: 'Cannot Delete',
            description: 'This pro move is referenced in assignments or scores. Consider deactivating it instead.',
            variant: 'destructive',
          });
        } else {
          throw error;
        }
      } else {
        toast({
          title: 'Deleted',
          description: 'Pro move has been deleted',
        });
        setRefreshKey(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error deleting pro move:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete pro move',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const selectedProMove = proMoves.find(pm => pm.action_id === selectedProMoveId);

  const StatusBadge = ({ has, label }: { has: boolean; label: string }) => (
    <Badge 
      variant={has ? 'default' : 'outline'} 
      className={`text-xs ${has ? 'bg-emerald-600' : 'text-muted-foreground'}`}
    >
      {has ? <Check className="w-3 h-3 mr-1" /> : <X className="w-3 h-3 mr-1" />}
      {label}
    </Badge>
  );

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={() => navigate('/clinical')}
        className="gap-2"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Doctor Portal
      </Button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Clinical Pro-Move Library</h1>
          <p className="text-muted-foreground">Manage doctor-specific pro moves and learning materials</p>
        </div>
        <Button onClick={handleAddProMove}>
          <Plus className="w-4 h-4 mr-2" />
          Add Pro-Move
        </Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 bg-muted/50 rounded-lg">
        <div className="space-y-2">
          <Label>Domain</Label>
          <Select value={selectedDomain} onValueChange={(val) => {
            setSelectedDomain(val);
            setSelectedCompetency('all'); // Reset competency when domain changes
          }}>
            <SelectTrigger>
              <SelectValue placeholder="All domains" />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="all">All domains</SelectItem>
              {sortedDomains.map(domain => (
                <SelectItem key={domain} value={domain || ''}>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: getDomainColor(domain || '') }}
                    />
                    {domain}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Competency</Label>
          <Select value={selectedCompetency} onValueChange={setSelectedCompetency}>
            <SelectTrigger>
              <SelectValue placeholder="All competencies" />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="all">All competencies</SelectItem>
              {filteredCompetencies.map(competency => (
                <SelectItem key={competency.competency_id} value={competency.competency_id.toString()}>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: getDomainColor(competency.domain_name || '') }}
                    />
                    {competency.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search pro-moves..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Status</Label>
          <div className="flex items-center space-x-2 pt-2">
            <Switch
              checked={showActiveOnly}
              onCheckedChange={setShowActiveOnly}
            />
            <span className="text-sm">Active only</span>
          </div>
        </div>

        <div className="flex items-end">
          <p className="text-sm text-muted-foreground">
            {filteredProMoves.length} pro-move{filteredProMoves.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Pro-Move List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : filteredProMoves.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No pro-moves found
          </div>
        ) : (
          filteredProMoves.map(pm => (
            <div
              key={pm.action_id}
              className="p-4 bg-card border rounded-lg hover:border-primary/50 transition-colors"
            >
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                {/* Domain indicator */}
                <div 
                  className="w-1 h-12 rounded-full hidden lg:block"
                  style={{ backgroundColor: getDomainColor(pm.domain_name) }}
                />

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{pm.action_statement}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge 
                      className="text-xs text-black dark:text-black"
                      style={{ 
                        backgroundColor: getDomainColor(pm.domain_name),
                        border: 'none'
                      }}
                    >
                      {pm.domain_name}
                    </Badge>
                    <span className="text-sm text-muted-foreground">{pm.competency_name}</span>
                  </div>
                </div>

                {/* Resource status badges */}
                <div className="flex flex-wrap gap-1">
                  <StatusBadge has={pm.resources.has_why} label="Why" />
                  <StatusBadge has={pm.resources.has_script} label="Script" />
                  <StatusBadge has={pm.resources.has_gut_check} label="Gut Check" />
                  <StatusBadge has={pm.resources.has_good_looks_like} label="Good" />
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleEditProMove(pm)}
                  >
                    Edit
                  </Button>
                  <Button 
                    size="sm"
                    onClick={() => handleOpenMaterials(pm.action_id)}
                  >
                    Materials
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setDeleteTarget(pm)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modals */}
      {showAddForm && (
        <DoctorProMoveForm
          proMove={editingProMove}
          onClose={handleFormClose}
          competencies={competencies}
        />
      )}

      {selectedProMoveId && selectedProMove && (
        <DoctorMaterialsDrawer
          actionId={selectedProMoveId}
          proMoveStatement={selectedProMove.action_statement}
          open={true}
          onOpenChange={(open) => !open && handleMaterialsClose()}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Pro Move?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.action_statement}" and all associated learning materials. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProMove}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
