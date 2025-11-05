// src/pages/Review.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ConfPerfDelta from "@/components/ConfPerfDelta";
import { getDomainColor } from "@/lib/domainColors";

type Staff = { id: string; role_id: number };
type FocusRow = {
  id: string;
  display_order: number;
  action_id: number | null;
  self_select: boolean;
  // site move text (if this slot is a site move)
  site_action_statement: string | null;
  domain_name: string | null;
};
type ScoreRow = {
  weekly_focus_id: string;
  confidence_score: number | null;
  performance_score: number | null;
  selected_action_id: number | null;
};

export default function Review() {
  const { cycle, week } = useParams();
  const cycleNum = Number(cycle || 1);
  const weekNum = Number(week || 1);
  const { user } = useAuth();
  const navigate = useNavigate();

  const [staff, setStaff] = useState<Staff | null>(null);
  const [rows, setRows] = useState<
    (FocusRow & {
      final_action_statement: string;
      confidence_score: number | null;
      performance_score: number | null;
    })[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user) return;
      // staff info
      const { data: staffRow } = await supabase
        .from("staff")
        .select("id, role_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!staffRow) return;
      setStaff(staffRow);

      // weekly_focus for this cycle/week/role with domain information
      const { data: wf } = await supabase
        .from("weekly_focus")
        .select(`
          id,
          display_order,
          action_id,
          self_select,
          pro_moves:action_id(action_statement),
          competencies!inner(domains!competencies_domain_id_fkey!inner(domain_name))
        `)
        .eq("role_id", staffRow.role_id)
        .eq("cycle", cycleNum)
        .eq("week_in_cycle", weekNum)
        .order("display_order");

      const focus: FocusRow[] =
        (wf || []).map((w: any) => ({
          id: w.id,
          display_order: w.display_order,
          action_id: w.action_id ?? null,
          self_select: !!w.self_select,
          site_action_statement: w.pro_moves?.action_statement ?? null,
          domain_name: w.competencies?.domains?.domain_name ?? null,
        })) ?? [];

      // scores for this user + these focus ids
      const focusIds = focus.map((f) => f.id);
      const { data: scores } = await supabase
        .from("weekly_scores")
        .select("weekly_focus_id, confidence_score, performance_score, selected_action_id")
        .eq("staff_id", staffRow.id)
        .in("weekly_focus_id", focusIds);

      const scoreByFocus: Record<string, ScoreRow> = {};
      (scores || []).forEach((s: any) => (scoreByFocus[s.weekly_focus_id] = s));

      // fetch selected pro-move texts for any self-selects
      const selectedIds = Array.from(
        new Set(
          (scores || [])
            .map((s: any) => s.selected_action_id)
            .filter(Boolean)
        )
      ) as number[];
      let selectedMap: Record<number, string> = {};
      if (selectedIds.length) {
        const { data: actions } = await supabase
          .from("pro_moves")
          .select("action_id, action_statement")
          .in("action_id", selectedIds);
        (actions || []).forEach((a) => (selectedMap[a.action_id] = a.action_statement));
      }

      // build display rows
      const merged = focus.map((f) => {
        const sc = scoreByFocus[f.id];
        const pickedStatement =
          f.self_select && sc?.selected_action_id
            ? selectedMap[sc.selected_action_id] || "(selected move)"
            : f.site_action_statement || "(site move)";
        return {
          ...f,
          final_action_statement: pickedStatement,
          confidence_score: sc?.confidence_score ?? null,
          performance_score: sc?.performance_score ?? null,
        };
      });

      setRows(merged);
      setLoading(false);
    })();
  }, [user, cycleNum, weekNum]);

  if (loading) {
    return (
      <main className="min-h-screen bg-background p-6 flex items-center justify-center">
        <div>Loading…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background p-4">
      <section className="max-w-3xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Review — Cycle {cycleNum}, Week {weekNum}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.map((r, idx) => (
              <div 
                key={r.id} 
                className="flex items-center justify-between gap-4 text-sm p-3 rounded border"
                style={{ backgroundColor: r.domain_name ? getDomainColor(r.domain_name) : undefined }}
              >
                <div className="flex items-center gap-3 flex-1">
                  <Badge variant="secondary" className="ring-1 ring-border/50 bg-white/90 text-gray-900">
                    {idx + 1}/3
                  </Badge>
                  {r.domain_name && (
                    <Badge variant="outline" className="bg-white/80 text-gray-900 border-white/50">
                      {r.domain_name}
                    </Badge>
                  )}
                  <div className="font-medium text-gray-900">{r.final_action_statement}</div>
                </div>
                <ConfPerfDelta confidence={r.confidence_score} performance={r.performance_score} />
              </div>
            ))}
            {!rows.length && (
              <div className="text-sm text-muted-foreground">No pro moves configured for this week.</div>
            )}
            <div className="flex justify-end pt-2">
              <Button onClick={() => navigate("/")}>Done</Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
