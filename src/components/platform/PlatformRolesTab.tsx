import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Plus, Copy, Pencil, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { RoleFormDrawer } from './RoleFormDrawer';
import { CompetencyFormDrawer } from './CompetencyFormDrawer';
import { CloneCompetenciesDialog } from './CloneCompetenciesDialog';
import { ProMoveImportDialog } from './ProMoveImportDialog';
import { DOMAIN_ORDER } from '@/lib/domainUtils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Role {
  role_id: number;
  role_name: string;
  role_code: string;
  active: boolean;
  practice_type: string;
}

interface Competency {
  competency_id: number;
  role_id: number;
  domain_id: number;
  name: string;
  
  tagline: string | null;
  description: string | null;
  friendly_description: string | null;
  interview_prompt: string | null;
  status: string | null;
}

interface Domain {
  domain_id: number;
  domain_name: string;
  color_hex: string | null;
}

export function PlatformRolesTab() {
  const queryClient = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [roleDrawerOpen, setRoleDrawerOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [compDrawerOpen, setCompDrawerOpen] = useState(false);
  const [editingComp, setEditingComp] = useState<Competency | null>(null);
  const [cloneCompsOpen, setCloneCompsOpen] = useState(false);
  const [deleteCompId, setDeleteCompId] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ['platform-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('role_id, role_name, role_code, active, practice_type')
        .order('role_id');
      if (error) throw error;
      return data as Role[];
    },
  });

  const { data: domains } = useQuery({
    queryKey: ['domains'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('domains')
        .select('domain_id, domain_name, color_hex')
        .order('domain_id');
      if (error) throw error;
      return data as Domain[];
    },
  });

  const { data: competencies, isLoading: compsLoading } = useQuery({
    queryKey: ['platform-competencies', selectedRoleId],
    queryFn: async () => {
      if (!selectedRoleId) return [];
      const { data, error } = await supabase
        .from('competencies')
        .select('competency_id, role_id, domain_id, name, tagline, description, friendly_description, interview_prompt, status')
        .eq('role_id', selectedRoleId)
        .order('domain_id')
        .order('competency_id');
      if (error) throw error;
      return data as Competency[];
    },
    enabled: !!selectedRoleId,
  });

  // Pro move counts per competency
  const { data: proMoveCounts } = useQuery({
    queryKey: ['platform-promove-counts', selectedRoleId],
    queryFn: async () => {
      if (!selectedRoleId) return {};
      const { data, error } = await supabase
        .from('pro_moves')
        .select('competency_id')
        .eq('role_id', selectedRoleId)
        .eq('active', true);
      if (error) throw error;
      const counts: Record<number, number> = {};
      (data ?? []).forEach(pm => {
        if (pm.competency_id) counts[pm.competency_id] = (counts[pm.competency_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!selectedRoleId,
  });

  // Auto-select first role
  if (roles?.length && selectedRoleId === null) {
    setSelectedRoleId(roles[0].role_id);
  }

  const selectedRole = roles?.find((r) => r.role_id === selectedRoleId);

  const compCountByRole = (roleId: number) =>
    roles ? undefined : 0; // We'll show counts from a separate query if needed

  const groupedByDomain = () => {
    if (!competencies || !domains) return [];
    return domains
      .sort((a, b) => {
        const ai = DOMAIN_ORDER.indexOf(a.domain_name ?? '');
        const bi = DOMAIN_ORDER.indexOf(b.domain_name ?? '');
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      })
      .map((d) => ({
        domain: d,
        comps: competencies.filter((c) => c.domain_id === d.domain_id),
      }))
      .filter((g) => g.comps.length > 0);
  };

  const handleDeleteComp = async () => {
    if (!deleteCompId) return;
    const { error } = await supabase.from('competencies').delete().eq('competency_id', deleteCompId);
    if (error) {
      toast.error('Failed to delete competency: ' + error.message);
    } else {
      toast.success('Competency deleted');
      queryClient.invalidateQueries({ queryKey: ['platform-competencies'] });
    }
    setDeleteCompId(null);
  };

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['platform-roles'] });
    queryClient.invalidateQueries({ queryKey: ['platform-competencies'] });
    queryClient.invalidateQueries({ queryKey: ['platform-promove-counts'] });
  };

  if (rolesLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
      {/* Left panel — Roles list */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => { setEditingRole(null); setRoleDrawerOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> New Role
          </Button>
        </div>

        <div className="space-y-2">
          {roles?.map((role) => (
            <Card
              key={role.role_id}
              className={`cursor-pointer transition-colors ${
                selectedRoleId === role.role_id
                  ? 'border-primary ring-1 ring-primary'
                  : 'hover:border-muted-foreground/30'
              }`}
              onClick={() => setSelectedRoleId(role.role_id)}
            >
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{role.role_name}</p>
                  <p className="text-xs text-muted-foreground">{role.role_code} · {role.practice_type === 'pediatric_us' ? 'Pedi US' : role.practice_type === 'general_us' ? 'Gen US' : 'Gen UK'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!role.active && (
                    <Badge variant="secondary" className="text-xs">Inactive</Badge>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingRole(role);
                      setRoleDrawerOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Right panel — Competencies */}
      <div>
        {selectedRole ? (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  Competencies for {selectedRole.role_name}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setImportOpen(true)}
                  >
                    <Upload className="h-4 w-4 mr-1" /> Import Pro Moves
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCloneCompsOpen(true)}
                  >
                    <Copy className="h-4 w-4 mr-1" /> Clone Competencies
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingComp(null);
                      setCompDrawerOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add Competency
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {compsLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : competencies?.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">
                  No competencies yet. Click "Add Competency" to get started.
                </p>
              ) : (
                <Accordion type="multiple" defaultValue={domains?.map((d) => String(d.domain_id)) ?? []}>
                  {groupedByDomain().map(({ domain, comps }) => (
                    <AccordionItem key={domain.domain_id} value={String(domain.domain_id)}>
                      <AccordionTrigger className="text-sm font-semibold">
                        <span className="flex items-center gap-2">
                          {domain.color_hex && (
                            <span
                              className="inline-block h-3 w-3 rounded-full"
                              style={{ backgroundColor: domain.color_hex }}
                            />
                          )}
                          {domain.domain_name} ({comps.length})
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-1">
                          {comps.map((comp) => (
                            <div
                              key={comp.competency_id}
                              className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50 group"
                            >
                              <div className="min-w-0 flex items-center gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{comp.name}</p>
                                  {comp.tagline && (
                                    <p className="text-xs text-muted-foreground truncate">{comp.tagline}</p>
                                  )}
                                </div>
                                {(proMoveCounts?.[comp.competency_id] ?? 0) > 0 && (
                                  <Badge variant="secondary" className="text-2xs shrink-0">
                                    {proMoveCounts[comp.competency_id]} PM
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => {
                                    setEditingComp(comp);
                                    setCompDrawerOpen(true);
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() => setDeleteCompId(comp.competency_id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>
        ) : (
          <p className="text-muted-foreground text-sm">Select a role to view its competencies.</p>
        )}
      </div>

      {/* Drawers and dialogs */}
      <RoleFormDrawer
        open={roleDrawerOpen}
        onOpenChange={setRoleDrawerOpen}
        role={editingRole}
        onSaved={() => {
          refreshAll();
          setRoleDrawerOpen(false);
        }}
      />

      <CompetencyFormDrawer
        open={compDrawerOpen}
        onOpenChange={setCompDrawerOpen}
        competency={editingComp}
        roleId={selectedRoleId!}
        domains={domains ?? []}
        onSaved={() => {
          refreshAll();
          setCompDrawerOpen(false);
        }}
      />

      {selectedRole && (
        <CloneCompetenciesDialog
          open={cloneCompsOpen}
          onOpenChange={setCloneCompsOpen}
          roles={roles ?? []}
          targetRoleId={selectedRole.role_id}
          onCloned={() => {
            refreshAll();
            setCloneCompsOpen(false);
          }}
        />
      )}

      {selectedRole && (
        <ProMoveImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          roleId={selectedRole.role_id}
          roleName={selectedRole.role_name}
          rolePracticeType={selectedRole.practice_type}
          onImported={refreshAll}
        />
      )}

      <AlertDialog open={deleteCompId !== null} onOpenChange={(o) => !o && setDeleteCompId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete competency?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this competency. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteComp} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
