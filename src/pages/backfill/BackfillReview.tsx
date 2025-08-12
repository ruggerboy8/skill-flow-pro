import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface Staff { id: string; role_id: number; }
interface FocusRow { id: string; display_order: number; action_statement: string; domain_name: string; week_in_cycle: number; }

export default function BackfillReview() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [staff, setStaff] = useState<Staff | null>(null);
  const [rows, setRows] = useState<Array<FocusRow & {
    selected_action_statement?: string | null;
    confidence_score?: number | null;
    performance_score?: number | null;
    confidence_estimated?: boolean;
    performance_estimated?: boolean;
  }>>([]);

  useEffect(() => {
    document.title = "Backfill Review – Weeks 1–6";
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: staffRow } = await supabase.from("staff").select("id, role_id").eq("user_id", user.id).maybeSingle();
      if (!staffRow) return;
      setStaff(staffRow);

      // All focus for cycle 1 weeks 1..6
      const { data: focus } = await supabase
        .from("v_weekly_focus")
        .select("id, display_order, action_statement, week_in_cycle, role_id, cycle")
        .eq("cycle", 1)
        .eq("role_id", staffRow.role_id)
        .in("week_in_cycle", [1,2,3,4,5,6])
        .order("week_in_cycle")
        .order("display_order");

      const focusIds = (focus || []).map((f:any) => f.id);
      const { data: scores } = await supabase
        .from("weekly_scores")
        .select("weekly_focus_id, selected_action_id, confidence_score, performance_score, confidence_estimated, performance_estimated")
        .eq("staff_id", staffRow.id)
        .in("weekly_focus_id", focusIds);

      // Map selected_action_id -> text
      const actionIds = Array.from(new Set((scores||[]).map(s=>s.selected_action_id).filter(Boolean))) as number[];
      let actionMap: Record<number, string> = {};
      if (actionIds.length) {
        const { data: acts } = await supabase.from("pro_moves").select("action_id, action_statement").in("action_id", actionIds);
        (acts||[]).forEach(a => { actionMap[a.action_id] = a.action_statement; });
      }

      const merged = (focus||[]).map((f:any) => {
        const s = (scores||[]).find((r)=>r.weekly_focus_id===f.id);
        return {
          id: f.id,
          display_order: f.display_order,
          action_statement: f.action_statement,
          week_in_cycle: f.week_in_cycle,
          domain_name: "", // optional in review
          selected_action_statement: s?.selected_action_id ? (actionMap[s.selected_action_id] || null) : null,
          confidence_score: s?.confidence_score ?? null,
          performance_score: s?.performance_score ?? null,
          confidence_estimated: s?.confidence_estimated ?? false,
          performance_estimated: s?.performance_estimated ?? false,
        } as FocusRow & any;
      });

      setRows(merged);
    })();
  }, [user]);

  const handleFinish = async () => {
    try {
      localStorage.setItem("backfillDone", "true");
      const raw = localStorage.getItem("backfillProgress");
      const progress = raw ? JSON.parse(raw) : {};
      for (let w=1; w<=6; w++) if (!progress[w]) progress[w] = true;
      localStorage.setItem("backfillProgress", JSON.stringify(progress));
    } catch {}
    toast({ title: "Backfill complete", description: "Thanks! Your stats are ready." });
    navigate("/");
  };

  // Group by week for compact rendering
  const byWeek = useMemo(() => {
    const map: Record<number, typeof rows> = {} as any;
    for (const r of rows) {
      const w = r.week_in_cycle;
      map[w] = map[w] || [];
      map[w].push(r);
    }
    return map;
  }, [rows]);

  return (
    <main className="min-h-screen bg-background p-4">
      <section className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Review backfill (Weeks 1–6)</h1>
        <div className="space-y-4">
          {Object.keys(byWeek).map((wk) => (
            <Card key={wk}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold">Week {wk}</div>
                  <Badge variant="outline">3 items</Badge>
                </div>
                <div className="space-y-2">
                  {(byWeek[Number(wk)]||[]).map((r, idx) => (
                    <div key={r.id} className="flex items-center justify-between gap-4 text-sm">
                      <div className="flex-1">
                        <div className="font-medium">{r.selected_action_statement || r.action_statement}</div>
                        <div className="text-muted-foreground">
                          C: {r.confidence_score ?? '-'}{r.confidence_estimated ? ' • est.' : ''} · P: {r.performance_score ?? '-'}{r.performance_estimated ? ' • est.' : ''}
                        </div>
                      </div>
                      <Badge variant="secondary">{idx+1}/3</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="flex justify-end">
          <Button size="lg" onClick={handleFinish}>Submit & Finish</Button>
        </div>
      </section>
    </main>
  );
}
