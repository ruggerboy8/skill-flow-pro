import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Search, X, GripVertical } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { getDomainColor } from '@/lib/domainColors';

interface ProMove {
  action_id: number;
  action_statement: string;
  competencies: { domain_id: number; domains: { domain_name: string } };
}

interface Priority {
  actionId: number;
  weight: number;
  name: string;
  domain: string;
}

export function ManagerPriorities() {
  const { toast } = useToast();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<1 | 2>(1);
  const [priorities, setPriorities] = useState<{ dfi: Priority[]; rda: Priority[] }>({ dfi: [], rda: [] });
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [proMoves, setProMoves] = useState<ProMove[]>([]);

  useEffect(() => {
    loadStaffAndPriorities();
    loadProMoves();
  }, []);

  async function loadStaffAndPriorities() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: staff } = await supabase
      .from('staff')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!staff) return;
    setStaffId(staff.id);

    // Load existing priorities
    const { data } = await supabase
      .from('manager_priorities')
      .select('*, pro_moves(action_statement, competencies(domain_id, domains(domain_name)))')
      .eq('coach_staff_id', staff.id);

    if (data) {
      const dfi = data
        .filter((p: any) => p.role_id === 1)
        .map((p: any) => ({
          actionId: p.action_id,
          weight: p.weight,
          name: p.pro_moves.action_statement,
          domain: p.pro_moves.competencies.domains.domain_name,
        }));

      const rda = data
        .filter((p: any) => p.role_id === 2)
        .map((p: any) => ({
          actionId: p.action_id,
          weight: p.weight,
          name: p.pro_moves.action_statement,
          domain: p.pro_moves.competencies.domains.domain_name,
        }));

      setPriorities({ dfi, rda });
    }
  }

  async function loadProMoves() {
    const { data } = await supabase
      .from('pro_moves')
      .select('action_id, action_statement, competencies(domain_id, domains(domain_name))')
      .eq('active', true)
      .order('action_statement');

    if (data) setProMoves(data as any);
  }

  async function savePriorities() {
    if (!staffId) return;

    setLoading(true);
    try {
      const roleKey = currentRole === 1 ? 'dfi' : 'rda';
      const payload = priorities[roleKey].map((p) => ({
        actionId: p.actionId,
        weight: p.weight,
      }));

      const response = await supabase.functions.invoke('save-priorities', {
        body: { roleId: currentRole, priorities: payload },
      });

      if (response.error) throw response.error;

      toast({
        title: 'Priorities Saved',
        description: 'Preview week has been recomputed.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  function addPriority(move: ProMove) {
    const roleKey = currentRole === 1 ? 'dfi' : 'rda';
    const current = priorities[roleKey];

    if (current.length >= 5) {
      toast({ title: 'Maximum 5 priorities', variant: 'destructive' });
      return;
    }

    if (current.find((p) => p.actionId === move.action_id)) {
      toast({ title: 'Already added', variant: 'destructive' });
      return;
    }

    setPriorities({
      ...priorities,
      [roleKey]: [
        ...current,
        {
          actionId: move.action_id,
          weight: 1,
          name: move.action_statement,
          domain: move.competencies.domains.domain_name,
        },
      ],
    });
    setSearchTerm('');
  }

  function removePriority(actionId: number) {
    const roleKey = currentRole === 1 ? 'dfi' : 'rda';
    setPriorities({
      ...priorities,
      [roleKey]: priorities[roleKey].filter((p) => p.actionId !== actionId),
    });
  }

  const roleKey = currentRole === 1 ? 'dfi' : 'rda';
  const currentPriorities = priorities[roleKey];

  const filteredMoves = proMoves.filter((m) => {
    const matchesRole = currentRole === 1 
      ? m.action_statement.startsWith('DFI') || m.action_statement.includes('Front')
      : m.action_statement.startsWith('RDA') || m.action_statement.includes('Rear');
    const matchesSearch = m.action_statement.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesRole && matchesSearch;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manager Priorities</CardTitle>
        <CardDescription>
          Select up to 5 pro-moves to prioritize. <strong>Affects next week only.</strong> This week is locked.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={currentRole.toString()} onValueChange={(v) => setCurrentRole(Number(v) as 1 | 2)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="1">DFI</TabsTrigger>
            <TabsTrigger value="2">RDA</TabsTrigger>
          </TabsList>

          <TabsContent value={currentRole.toString()} className="space-y-4 mt-4">
            {/* Current Priorities */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Current Priorities ({currentPriorities.length}/5)</h3>
              {currentPriorities.length === 0 && (
                <p className="text-sm text-muted-foreground">No priorities set</p>
              )}
              {currentPriorities.map((p) => (
                <div
                  key={p.actionId}
                  className="flex items-center justify-between p-3 border rounded-lg bg-card"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{p.name}</div>
                      <Badge
                        variant="outline"
                        className="text-[10px] py-0 mt-1"
                        style={{
                          backgroundColor: getDomainColor(p.domain),
                          color: '#111',
                          borderColor: getDomainColor(p.domain),
                        }}
                      >
                        {p.domain}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removePriority(p.actionId)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Add Priority */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Add Pro-Move</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search pro-moves..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              {searchTerm && (
                <div className="border rounded-lg max-h-60 overflow-y-auto">
                  {filteredMoves.slice(0, 10).map((move) => (
                    <button
                      key={move.action_id}
                      onClick={() => addPriority(move)}
                      className="w-full p-3 text-left hover:bg-muted/50 transition-colors border-b last:border-b-0"
                    >
                      <div className="text-sm font-medium">{move.action_statement}</div>
                      <Badge
                        variant="outline"
                        className="text-[10px] py-0 mt-1"
                        style={{
                          backgroundColor: getDomainColor(move.competencies.domains.domain_name),
                          color: '#111',
                          borderColor: getDomainColor(move.competencies.domains.domain_name),
                        }}
                      >
                        {move.competencies.domains.domain_name}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button onClick={savePriorities} disabled={loading} className="w-full">
              {loading ? 'Saving...' : 'Save Priorities'}
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
