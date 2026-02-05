import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
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

const DOCTOR_ROLE_ID = 4;

interface Competency {
  competency_id: number;
  name: string;
  domain_name?: string;
}

interface ProMove {
  action_id?: number;
  action_statement: string;
  description?: string | null;
  competency_id?: number;
}

interface DoctorProMoveFormProps {
  proMove: ProMove | null;
  onClose: () => void;
  competencies: Competency[];
}

export function DoctorProMoveForm({ proMove, onClose, competencies }: DoctorProMoveFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    competency_id: '',
    action_statement: '',
    description: ''
  });

  useEffect(() => {
    if (proMove) {
      setFormData({
        competency_id: proMove.competency_id?.toString() || '',
        action_statement: proMove.action_statement || '',
        description: proMove.description || ''
      });
    }
  }, [proMove]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.competency_id || !formData.action_statement.trim()) {
      toast({
        title: "Validation Error",
        description: "Competency and Pro-Move text are required.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const submitData = {
        role_id: DOCTOR_ROLE_ID,
        competency_id: parseInt(formData.competency_id),
        action_statement: formData.action_statement.trim(),
        description: formData.description.trim() || null,
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
        // Create new pro-move
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
                {competencies.map(competency => (
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
              placeholder="Why this matters..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">Shown to learners as "Why this matters"</p>
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
              disabled={loading || !formData.competency_id || !formData.action_statement.trim()}
            >
              {loading ? "Saving..." : (proMove ? "Update" : "Create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
