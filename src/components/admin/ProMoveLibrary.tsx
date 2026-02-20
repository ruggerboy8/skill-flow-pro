import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { Plus, Upload, Download, Filter, ChevronDown } from 'lucide-react';
import { getDomainColor } from '@/lib/domainColors';

import { ProMoveList } from '@/components/admin/ProMoveList';
import { ProMoveForm } from '@/components/admin/ProMoveForm';
import { BulkUpload } from '@/components/admin/BulkUpload';

interface Role {
  role_id: number;
  role_name: string;
}

interface Competency {
  competency_id: number;
  name: string;
  domain_name?: string;
}

export function ProMoveLibrary() {
  const { toast } = useToast();
  
  // State management
  const [roles, setRoles] = useState<Role[]>([]);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [selectedCompetency, setSelectedCompetency] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [sortBy, setSortBy] = useState<'domain' | 'competency' | 'updated'>('updated');
  const [resourceFilters, setResourceFilters] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [editingProMove, setEditingProMove] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load initial data
  useEffect(() => {
    console.log('=== PROMOVE LIBRARY MOUNTING ===');
    loadRoles();
    loadCompetencies();
  }, []);

  // Reload competencies when role selection changes
  useEffect(() => {
    loadCompetencies();
    // Reset competency selection when role changes
    setSelectedCompetency('all');
  }, [selectedRole]);

  const loadRoles = async () => {
    const { data } = await supabase
      .from('roles')
      .select('role_id, role_name')
      .order('role_name');
    
    if (data) setRoles(data);
  };

  const loadCompetencies = async () => {
    let query = supabase
      .from('competencies')
      .select(`
        competency_id, 
        name,
        domains!competencies_domain_id_fkey (
          domain_name
        )
      `);

    // Filter by role if one is selected
    if (selectedRole !== 'all') {
      query = query.eq('role_id', parseInt(selectedRole));
    }

    const { data } = await query.order('competency_id');
    
    if (data) {
      const formattedCompetencies = data?.map(item => ({
        competency_id: item.competency_id,
        name: item.name,
        domain_name: (item.domains as any)?.domain_name || 'Unknown'
      })) || [];
      setCompetencies(formattedCompetencies);
    }
  };

  const downloadTemplate = () => {
    const competencyNames = competencies.map(c => c.name).join('", "');
    const csvContent = `role_name,competency_name,text,description,resources_url,intervention_text,script,active
DFI,"Example Competency","Example pro-move text","Optional description","Optional URL","Optional intervention text","Optional script for audio",true
RDA,"Example Competency","Example pro-move text","Optional description","Optional URL","Optional intervention text","Optional script for audio",true

# Available competency names: "${competencyNames}"`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pro-moves-template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadCurrentLibrary = async () => {
    try {
      // Fetch pro_moves with their role and competency names, respecting active filter
      let query = supabase
        .from('pro_moves')
        .select(`
          action_id,
          action_statement,
          description,
          resources_url,
          intervention_text,
          active,
          roles!fk_pro_moves_role_id(role_name),
          competencies!fk_pro_moves_competency_id(name, domains!fk_competencies_domain_id(domain_name))
        `);

      // Filter by active status if enabled
      if (showActiveOnly) {
        query = query.eq('active', true);
      }

      const { data: proMovesData, error } = await query.order('action_id');

      if (error) throw error;

      if (!proMovesData || proMovesData.length === 0) {
        toast({
          title: "No data",
          description: "No pro-moves found to download.",
        });
        return;
      }

      // Fetch script resources for all pro-moves
      const actionIds = proMovesData.map(pm => pm.action_id);
      const { data: scriptResources } = await supabase
        .from('pro_move_resources')
        .select('action_id, content_md')
        .eq('type', 'script')
        .in('action_id', actionIds);

      // Create a map of action_id to script content
      const scriptMap = new Map(
        (scriptResources || []).map(r => [r.action_id, r.content_md])
      );

      // Format data for CSV
      const csvRows = proMovesData.map(pm => ({
        action_id: pm.action_id,
        role_name: (pm.roles as any)?.role_name || '',
        domain: (pm.competencies as any)?.domains?.domain_name || '',
        competency_name: (pm.competencies as any)?.name || '',
        text: pm.action_statement || '',
        description: pm.description || '',
        resources_url: pm.resources_url || '',
        intervention_text: pm.intervention_text || '',
        script: scriptMap.get(pm.action_id) || '',
        active: pm.active ? 'true' : 'false'
      }));

      // Generate CSV content
      const headers = ['action_id', 'role_name', 'domain', 'competency_name', 'text', 'description', 'resources_url', 'intervention_text', 'script', 'active'];
      const csvContent = [
        headers.join(','),
        ...csvRows.map(row => 
          headers.map(header => {
            const value = row[header as keyof typeof row];
            // Escape values that contain commas or quotes
            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          }).join(',')
        )
      ].join('\n');

      // Download the file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pro-moves-library-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Download complete",
        description: `Downloaded ${proMovesData.length} pro-moves.`,
      });
    } catch (error: any) {
      console.error('Error downloading library:', error);
      toast({
        title: "Download failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleAddProMove = () => {
    setEditingProMove(null);
    setShowAddForm(true);
  };

  const handleEditProMove = (proMove: any) => {
    setEditingProMove(proMove);
    setShowAddForm(true);
  };

  const handleFormClose = () => {
    setShowAddForm(false);
    setEditingProMove(null);
    // Trigger a refresh of the pro-moves list
    setRefreshKey(prev => prev + 1);
  };

  const handleBulkUploadClose = () => {
    setShowBulkUpload(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadCurrentLibrary}>
            <Download className="w-4 h-4 mr-2" />
            Download Library
          </Button>
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="w-4 h-4 mr-2" />
            Template
          </Button>
          <Button variant="outline" onClick={() => setShowBulkUpload(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Bulk Upload
          </Button>
          <Button onClick={handleAddProMove}>
            <Plus className="w-4 h-4 mr-2" />
            Add Pro-Move
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 p-4 bg-muted/50 rounded-lg">
        <div className="space-y-2">
          <Label>Role</Label>
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger>
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="all">All roles</SelectItem>
              {roles.map(role => (
                <SelectItem key={role.role_id} value={role.role_id.toString()}>
                  {role.role_name}
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
              {competencies.map(competency => (
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
          <Input
            placeholder="Search pro-moves..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Sort by</Label>
          <Select value={sortBy} onValueChange={(value: 'domain' | 'competency' | 'updated') => setSortBy(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="updated">Last Updated</SelectItem>
              <SelectItem value="domain">Domain</SelectItem>
              <SelectItem value="competency">Competency</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Resources</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  {resourceFilters.length === 0 ? 'All' : `${resourceFilters.length} filter${resourceFilters.length > 1 ? 's' : ''}`}
                </span>
                <ChevronDown className="w-4 h-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" align="start">
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Has Resource</p>
                {[
                  { value: 'has_script', label: 'Has Script' },
                  { value: 'has_video', label: 'Has Video' },
                  { value: 'has_audio', label: 'Has Audio' },
                ].map(option => (
                  <div key={option.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={option.value}
                      checked={resourceFilters.includes(option.value)}
                      onCheckedChange={(checked) => {
                        setResourceFilters(prev => 
                          checked 
                            ? [...prev, option.value]
                            : prev.filter(f => f !== option.value)
                        );
                      }}
                    />
                    <label htmlFor={option.value} className="text-sm cursor-pointer">{option.label}</label>
                  </div>
                ))}
                <div className="border-t pt-3 mt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Missing Resource</p>
                  {[
                    { value: 'missing_script', label: 'Missing Script' },
                    { value: 'missing_video', label: 'Missing Video' },
                    { value: 'missing_audio', label: 'Missing Audio' },
                  ].map(option => (
                    <div key={option.value} className="flex items-center space-x-2 mt-2">
                      <Checkbox
                        id={option.value}
                        checked={resourceFilters.includes(option.value)}
                        onCheckedChange={(checked) => {
                          setResourceFilters(prev => 
                            checked 
                              ? [...prev, option.value]
                              : prev.filter(f => f !== option.value)
                          );
                        }}
                      />
                      <label htmlFor={option.value} className="text-sm cursor-pointer">{option.label}</label>
                    </div>
                  ))}
                </div>
                {resourceFilters.length > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="w-full mt-2"
                    onClick={() => setResourceFilters([])}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
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
      </div>

      {/* Pro-Move List */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Pro-Move List</h3>
        <ProMoveList
          key={refreshKey}
          roleFilter={selectedRole}
          competencyFilter={selectedCompetency}
          searchTerm={searchTerm}
          activeOnly={showActiveOnly}
          resourceFilters={resourceFilters}
          sortBy={sortBy}
          onEdit={handleEditProMove}
        />
      </div>

      {/* Modals */}
      {showAddForm && (
        <ProMoveForm
          proMove={editingProMove}
          onClose={handleFormClose}
          roles={roles}
          competencies={competencies}
          selectedRole={selectedRole}
        />
      )}

      {showBulkUpload && (
        <BulkUpload
          onClose={handleBulkUploadClose}
          roles={roles}
          competencies={competencies}
        />
      )}
    </div>
  );
}