import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Plus, Upload, Download, ArrowUpDown } from 'lucide-react';
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
    const csvContent = `role_name,competency_name,text,description,resources_url,active
DFI,"Example Competency","Example pro-move text","Optional description","Optional URL",true
RDA,"Example Competency","Example pro-move text","Optional description","Optional URL",true

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
        <div>
          <h2 className="text-2xl font-bold">Pro-Move Library</h2>
          <p className="text-muted-foreground">Manage your collection of pro-moves</p>
        </div>
        <div className="flex gap-2">
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
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 bg-muted/50 rounded-lg">
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