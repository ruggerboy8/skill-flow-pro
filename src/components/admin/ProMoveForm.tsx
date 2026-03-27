import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { getDomainColor } from '@/lib/domainColors';
import { ARCHETYPE_OPTIONS, type ArchetypeCode } from '@/lib/roleArchetypes';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const PT_LABELS: Record<string, string> = {
  pediatric_us: 'Pediatric – US',
  general_us:   'General – US',
  general_uk:   'General – UK',
};

interface Role {
  role_id: number;
  role_name: string;
  archetype_code?: string | null;
  practice_type?: string | null;
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
  intervention_text?: string;
  role_id?: number;
  competency_id?: number;
  role_name?: string;
  competency_name?: string;
  practice_types?: string[];
}

interface ProMoveFormProps {
  proMove: ProMove | null;
  onClose: () => void;
  roles: Role[];
  competencies: Competency[];
  selectedArchetype?: string; // optional pre-selection hint from library filter
}

export function ProMoveForm({ proMove, onClose, roles, competencies, selectedArchetype: initialArchetype }: ProMoveFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Archetype / practice type selection
  const [archetypeCode, setArchetypeCode] = useState('');
  const [availablePracticeTypes, setAvailablePracticeTypes] = useState<{ value: string; label: string }[]>([]);
  const [selectedPracticeTypes, setSelectedPracticeTypes] = useState<string[]>([]);

  // Representative role for competency loading (first match for the selected archetype)
  const [representativeRoleId, setRepresentativeRoleId] = useState<string>('');

  // Competency tracking — we need the name for cross-role matching on multi-insert
  const [selectedCompetencyName, setSelectedCompetencyName] = useState('');

  const [formData, setFormData] = useState({
    competency_id: '',
    action_statement: '',
    description: '',
    resources_url: '',
    intervention_text: '',
  });
  const [filteredCompetencies, setFilteredCompetencies] = useState<Competency[]>(competencies);

  // Archetype options filtered to archetypes that actually have roles in the DB
  const archetypesInUse = ARCHETYPE_OPTIONS.filter(o =>
    roles.some(r => r.archetype_code === o.value)
  );

  // ── Archetype selection handler ───────────────────────────────────────────
  const applyArchetype = (code: string, practiceTypes?: string[]) => {
    const matching = roles.filter(r => r.archetype_code === code && r.practice_type);
    const pts = matching.map(r => ({ value: r.practice_type!, label: PT_LABELS[r.practice_type!] ?? r.practice_type! }));
    setArchetypeCode(code);
    setAvailablePracticeTypes(pts);
    const selected = practiceTypes ?? pts.map(p => p.value);
    setSelectedPracticeTypes(selected);
    const rep = matching.find(r => r.practice_type === 'pediatric_us') ?? matching[0];
    setRepresentativeRoleId(rep?.role_id?.toString() ?? '');
    setFormData(prev => ({ ...prev, competency_id: '' }));
    setSelectedCompetencyName('');
  };

  // ── Initialize form ───────────────────────────────────────────────────────
  useEffect(() => {
    if (proMove) {
      // EDIT mode: derive archetype from the existing role_id
      const role = roles.find(r => r.role_id === proMove.role_id);
      const code = role?.archetype_code ?? '';
      applyArchetype(code, role?.practice_type ? [role.practice_type] : []);
      setRepresentativeRoleId(proMove.role_id?.toString() ?? '');
      setFormData({
        competency_id: proMove.competency_id?.toString() ?? '',
        action_statement: proMove.action_statement ?? '',
        description: proMove.description ?? '',
        resources_url: proMove.resources_url ?? '',
        intervention_text: proMove.intervention_text ?? '',
      });
      // Capture competency name for display (not needed for cross-role matching on edit)
      const comp = competencies.find(c => c.competency_id === proMove.competency_id);
      setSelectedCompetencyName(comp?.name ?? '');
    } else if (initialArchetype) {
      applyArchetype(initialArchetype);
    }
  }, [proMove, roles]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load competencies for the representative role ─────────────────────────
  useEffect(() => {
    const load = async () => {
      if (!representativeRoleId || representativeRoleId === 'all') {
        setFilteredCompetencies(competencies);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('competencies')
          .select('competency_id, name, domain_id')
          .eq('role_id', parseInt(representativeRoleId))
          .order('competency_id');
        if (error) throw error;

        const withDomains = await Promise.all(
          (data || []).map(async (c) => {
            if (!c.domain_id) return { ...c, domain_name: 'General' };
            const { data: d } = await supabase
              .from('domains')
              .select('domain_name')
              .eq('domain_id', c.domain_id)
              .maybeSingle();
            return { ...c, domain_name: d?.domain_name ?? 'General' };
          })
        );
        setFilteredCompetencies(withDomains);

        // Clear competency if it no longer belongs to this role
        if (formData.competency_id) {
          const valid = withDomains.some(c => c.competency_id.toString() === formData.competency_id);
          if (!valid) {
            setFormData(prev => ({ ...prev, competency_id: '' }));
            setSelectedCompetencyName('');
          }
        }
      } catch {
        setFilteredCompetencies([]);
        toast({ title: 'Error', description: 'Failed to load competencies', variant: 'destructive' });
      }
    };
    load();
  }, [representativeRoleId, competencies]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!archetypeCode || !formData.competency_id || !formData.action_statement.trim()) {
      toast({ title: 'Validation Error', description: 'Role, Competency, and Pro-Move text are required.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const sharedFields = {
        action_statement: formData.action_statement.trim(),
        description: formData.description.trim() || null,
        resources_url: formData.resources_url.trim() || null,
        intervention_text: formData.intervention_text.trim() || null,
        active: true,
      };

      if (proMove?.action_id) {
        // EDIT — single-row update
        const { error } = await supabase
          .from('pro_moves')
          .update({
            ...sharedFields,
            role_id: parseInt(representativeRoleId),
            competency_id: parseInt(formData.competency_id),
            practice_types: selectedPracticeTypes,
          })
          .eq('action_id', proMove.action_id);
        if (error) throw error;
        toast({ title: 'Success', description: 'Pro-move updated.' });
      } else {
        // CREATE — one insert per selected practice type
        const targetRoles = roles.filter(
          r => r.archetype_code === archetypeCode && r.practice_type && selectedPracticeTypes.includes(r.practice_type)
        );

        const inserts = (
          await Promise.all(
            targetRoles.map(async (role) => {
              const { data: comps } = await supabase
                .from('competencies')
                .select('competency_id, name')
                .eq('role_id', role.role_id);
              const comp = comps?.find(c => c.name === selectedCompetencyName);
              if (!comp) return null;
              return {
                ...sharedFields,
                role_id: role.role_id,
                competency_id: comp.competency_id,
                practice_types: [role.practice_type!],
              };
            })
          )
        ).filter(Boolean) as object[];

        if (inserts.length === 0) {
          toast({ title: 'Error', description: 'No matching competencies found in the selected practice types.', variant: 'destructive' });
          setLoading(false);
          return;
        }

        const { data: inserted, error } = await supabase
          .from('pro_moves')
          .insert(inserts as any)
          .select('action_id');
        if (error) throw error;

        // Fire-and-forget: score new moves in background
        const newIds = (inserted || []).map((r: any) => r.action_id).filter(Boolean);
        if (newIds.length > 0) {
          supabase.functions.invoke('generate-pro-move-weights', { body: { action_ids: newIds } })
            .catch(() => { /* ignore scoring errors */ });
        }

        const skipped = targetRoles.length - inserts.length;
        toast({
          title: 'Success',
          description: `Created ${inserts.length} pro-move${inserts.length > 1 ? 's' : ''}.${skipped > 0 ? ` (${skipped} skipped — no matching competency)` : ''}`,
        });
      }

      onClose();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save pro-move.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const isEditing = !!proMove?.action_id;

  const canSubmit =
    !!archetypeCode &&
    selectedPracticeTypes.length > 0 &&
    !!formData.competency_id &&
    !!formData.action_statement.trim();

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Pro-Move' : 'Add New Pro-Move'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Role type picker — full width */}
          <div className="space-y-2">
            <Label>Role *</Label>
            <Select
              value={archetypeCode}
              onValueChange={code => applyArchetype(code)}
              disabled={isEditing}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {archetypesInUse.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Practice type checkboxes */}
          {availablePracticeTypes.length > 0 && (
            <div className="space-y-2">
              <Label>Practice Types *{isEditing && <span className="text-muted-foreground font-normal ml-1">(read-only on edit)</span>}</Label>
              <div className="flex flex-wrap gap-4">
                {availablePracticeTypes.map(pt => (
                  <label key={pt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedPracticeTypes.includes(pt.value)}
                      disabled={isEditing}
                      onChange={e => {
                        if (isEditing) return;
                        setSelectedPracticeTypes(prev =>
                          e.target.checked ? [...prev, pt.value] : prev.filter(v => v !== pt.value)
                        );
                      }}
                      className="rounded border-border"
                    />
                    {pt.label}
                  </label>
                ))}
              </div>
              {!isEditing && (
                <p className="text-xs text-muted-foreground">Creates one pro-move per selected practice type</p>
              )}
            </div>
          )}

          {/* Competency picker */}
          <div className="space-y-2">
            <Label>Competency *</Label>
            <Select
              value={formData.competency_id}
              onValueChange={value => {
                const comp = filteredCompetencies.find(c => c.competency_id.toString() === value);
                setSelectedCompetencyName(comp?.name ?? '');
                setFormData(prev => ({ ...prev, competency_id: value }));
              }}
              disabled={!archetypeCode}
            >
              <SelectTrigger>
                <SelectValue placeholder={archetypeCode ? 'Select competency' : 'Select archetype first'} />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {filteredCompetencies.map(c => (
                  <SelectItem key={c.competency_id} value={c.competency_id.toString()}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: getDomainColor(c.domain_name || '') }}
                      />
                      {c.name}
                      {c.domain_name && (
                        <span className="text-xs text-muted-foreground ml-1">({c.domain_name})</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Pro-Move text */}
          <div className="space-y-2">
            <Label htmlFor="text">Pro-Move Text *</Label>
            <Textarea
              id="text"
              placeholder="Enter the pro-move statement..."
              value={formData.action_statement}
              onChange={e => setFormData(prev => ({ ...prev, action_statement: e.target.value }))}
              rows={3}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Why this matters..."
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">Shown to learners as "Why this matters"</p>
          </div>

          {/* Intervention text */}
          <div className="space-y-2">
            <Label htmlFor="intervention">Intervention Text</Label>
            <Textarea
              id="intervention"
              placeholder="Guidance for coaching interventions..."
              value={formData.intervention_text}
              onChange={e => setFormData(prev => ({ ...prev, intervention_text: e.target.value }))}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">Used for coaching and performance interventions</p>
          </div>

          {/* Resources URL */}
          <div className="space-y-2">
            <Label htmlFor="resources">Resources URL</Label>
            <Input
              id="resources"
              type="url"
              placeholder="https://example.com/training-materials"
              value={formData.resources_url}
              onChange={e => setFormData(prev => ({ ...prev, resources_url: e.target.value }))}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !canSubmit}>
              {loading ? 'Saving...' : isEditing ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
