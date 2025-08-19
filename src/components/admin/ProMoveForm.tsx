import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { getDomainColor } from '@/lib/domainColors';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Role {
  role_id: number;
  role_name: string;
}

interface Competency {
  competency_id: number;
  name: string;
  domain_name?: string;
}

interface ProMove {
  action_id?: number;
  action_statement: string;
  description?: string;
  resources_url?: string;
  role_id?: number;
  competency_id?: number;
  role_name?: string;
  competency_name?: string;
}

interface ProMoveFormProps {
  proMove: ProMove | null;
  onClose: () => void;
  roles: Role[];
  competencies: Competency[];
  selectedRole?: string; // Add role filter support
}

export function ProMoveForm({ proMove, onClose, roles, competencies, selectedRole }: ProMoveFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    role_id: '',
    competency_id: '',
    action_statement: '',
    description: '',
    resources_url: ''
  });
  const [filteredCompetencies, setFilteredCompetencies] = useState<Competency[]>(competencies);

  useEffect(() => {
    if (proMove) {
      setFormData({
        role_id: proMove.role_id?.toString() || '',
        competency_id: proMove.competency_id?.toString() || '',
        action_statement: proMove.action_statement || '',
        description: proMove.description || '',
        resources_url: proMove.resources_url || ''
      });
    } else if (selectedRole && selectedRole !== 'all') {
      // Pre-select role when adding new pro-move with role filter
      setFormData(prev => ({ ...prev, role_id: selectedRole }));
    }
  }, [proMove, selectedRole]);

  // Filter competencies by selected role
  useEffect(() => {
    const loadFilteredCompetencies = async () => {
      if (!formData.role_id || formData.role_id === 'all') {
        setFilteredCompetencies(competencies);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('competencies')
          .select(`
            competency_id, 
            name,
            domains (
              domain_name
            )
          `)
          .eq('role_id', parseInt(formData.role_id))
          .order('competency_id');

        if (error) throw error;
        
        const formattedCompetencies = data?.map(item => ({
          competency_id: item.competency_id,
          name: item.name,
          domain_name: (item.domains as any)?.domain_name
        })) || [];
        
        setFilteredCompetencies(formattedCompetencies);
        
        // Clear competency selection if current one doesn't match role
        if (formData.competency_id) {
          const isValidCompetency = data?.some(c => c.competency_id.toString() === formData.competency_id);
          if (!isValidCompetency) {
            setFormData(prev => ({ ...prev, competency_id: '' }));
          }
        }
      } catch (error) {
        console.error('Error loading competencies:', error);
        setFilteredCompetencies([]);
      }
    };

    loadFilteredCompetencies();
  }, [formData.role_id, competencies]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.role_id || !formData.competency_id || !formData.action_statement.trim()) {
      toast({
        title: "Validation Error",
        description: "Role, Competency, and Pro-Move text are required.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const submitData = {
        role_id: parseInt(formData.role_id),
        competency_id: parseInt(formData.competency_id),
        action_statement: formData.action_statement.trim(),
        description: formData.description.trim() || null,
        resources_url: formData.resources_url.trim() || null,
        active: true
      };

      if (proMove?.action_id) {
        // Update existing pro-move
        const { error } = await supabase
          .from('pro_moves')
          .update(submitData)
          .eq('action_id', proMove.action_id);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Pro-move updated successfully!",
        });
      } else {
        // Create new pro-move - insert without action_id
        const { error } = await supabase
          .from('pro_moves')
          .insert(submitData as any);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Pro-move created successfully!",
        });
      }

      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save pro-move.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {proMove ? 'Edit Pro-Move' : 'Add New Pro-Move'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <Select
                value={formData.role_id}
                onValueChange={(value) => setFormData({ ...formData, role_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {roles.map(role => (
                    <SelectItem key={role.role_id} value={role.role_id.toString()}>
                      {role.role_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="competency">Competency *</Label>
              <Select
                value={formData.competency_id}
                onValueChange={(value) => setFormData({ ...formData, competency_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select competency" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {filteredCompetencies.map(competency => (
                    <SelectItem key={competency.competency_id} value={competency.competency_id.toString()}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: getDomainColor(competency.domain_name || '') }}
                        />
                        {competency.name}
                        {competency.domain_name && (
                          <span className="text-xs text-muted-foreground ml-1">({competency.domain_name})</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="text">Pro-Move Text *</Label>
            <Textarea
              id="text"
              placeholder="Enter the pro-move statement..."
              value={formData.action_statement}
              onChange={(e) => setFormData({ ...formData, action_statement: e.target.value })}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Optional coach notes or description..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="resources">Resources URL</Label>
            <Input
              id="resources"
              type="url"
              placeholder="https://example.com/training-materials"
              value={formData.resources_url}
              onChange={(e) => setFormData({ ...formData, resources_url: e.target.value })}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !formData.role_id || !formData.competency_id || !formData.action_statement.trim()}
            >
              {loading ? "Saving..." : (proMove ? "Update" : "Create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}