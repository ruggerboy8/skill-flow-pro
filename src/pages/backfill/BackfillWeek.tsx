import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { Label } from "@/components/ui/label";
import NumberScale from "@/components/NumberScale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface Staff { id: string; role_id: number; }
interface FocusBase { id: string; display_order: number; action_statement: string; domain_name: string; }
interface FocusMeta { id: string; self_select: boolean; universal: boolean; competency_id: number | null; action_id: number | null; }
interface SelectOption { action_id: number; action_statement: string; }

export default function BackfillWeek() {
  const { week } = useParams();
  const weekNum = useMemo(() => {
    const n = Number(week);
    return Number.isFinite(n) ? Math.max(1, Math.min(6, n)) : 1;
  }, [week]);

  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [staff, setStaff] = useState<Staff | null>(null);
  const [focusList, setFocusList] = useState<(FocusBase & FocusMeta & {
    options?: SelectOption[];
    selected_action_id: number | null;
    confidence: number | null;
    performance: number | null;
    confidence_estimated: boolean;
    performance_estimated: boolean;
  })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = `Backfill – Week ${weekNum}`;
  }, [weekNum]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // Load staff
      const { data: staffRow, error: staffErr } = await supabase
        .from("staff").select("id, role_id").eq("user_id", user.id).maybeSingle();
      if (staffErr || !staffRow) {
        toast({ title: "Profile missing", description: "Please complete setup.", variant: "destructive" });
        navigate("/setup");
        return;
      }
      setStaff(staffRow);

      // Load base focus rows (text + domain)
      const { data: base } = await supabase.rpc("get_focus_cycle_week", {
        p_cycle: 1,
        p_week: weekNum,
        p_role_id: staffRow.role_id,
      }) as { data: FocusBase[] | null; error: any };

      // Load meta from weekly_focus
      const { data: meta } = await supabase
        .from("weekly_focus")
        .select("id, self_select, universal, competency_id, action_id")
        .eq("cycle", 1)
        .eq("week_in_cycle", weekNum)
        .eq("role_id", staffRow.role_id)
        .order("display_order");

      const merged = (base || []).map((b) => {
        const m = (meta || []).find((x) => x.id === b.id) as FocusMeta | undefined;
        return {
          ...b,
          self_select: !!m?.self_select,
          universal: !!m?.universal,
          competency_id: m?.competency_id ?? null,
          action_id: m?.action_id ?? null,
          options: undefined,
          selected_action_id: null,
          confidence: null,
          performance: null,
          confidence_estimated: false,
          performance_estimated: false,
        };
      });

      // Prefetch self-select options and prior scores
      for (const item of merged) {
        if (item.self_select && item.competency_id) {
          const { data: opts } = await supabase
            .from("pro_moves")
            .select("action_id, action_statement")
            .eq("competency_id", item.competency_id)
            .order("action_statement");
          item.options = opts || [];
        }
      }

      const focusIds = merged.map((m) => m.id);
      const { data: prev } = await supabase
        .from("weekly_scores")
        .select("weekly_focus_id, selected_action_id, confidence_score, performance_score, confidence_estimated, performance_estimated")
        .eq("staff_id", staffRow.id)
        .in("weekly_focus_id", focusIds);

      for (const item of merged) {
        const row = (prev || []).find((p) => p.weekly_focus_id === item.id);
        if (row) {
          item.selected_action_id = row.selected_action_id;
          item.confidence = row.confidence_score;
          item.performance = row.performance_score;
          item.confidence_estimated = row.confidence_estimated ?? false;
          item.performance_estimated = row.performance_estimated ?? false;
        }
      }

      setFocusList(merged.sort((a,b)=>a.display_order-b.display_order));
      setLoading(false);
    })();
  }, [user, weekNum, navigate, toast]);

  const handleSkip = () => {
    try {
      const raw = localStorage.getItem("backfillProgress");
      const obj = raw ? JSON.parse(raw) : {};
      obj[weekNum] = true;
      localStorage.setItem("backfillProgress", JSON.stringify(obj));
    } catch {}
    navigate(weekNum >= 6 ? "/backfill/review" : `/backfill/${weekNum + 1}`);
  };

  const handleSaveNext = async () => {
    if (!staff) return;
    // Validation
    for (const item of focusList) {
      if (item.self_select && !item.selected_action_id) {
        return toast({ title: "Select a Pro Move", description: "Self-select slot requires a choice.", variant: "destructive" });
      }
      if (item.confidence == null || item.performance == null) {
        return toast({ title: "Missing scores", description: "Enter confidence and performance for all items.", variant: "destructive" });
      }
    }

    const rows = focusList.map((i) => ({
      staff_id: staff.id,
      weekly_focus_id: i.id,
      selected_action_id: i.self_select ? i.selected_action_id : null,
      confidence_score: i.confidence,
      performance_score: i.performance,
      confidence_source: "backfill",
      performance_source: "backfill",
      confidence_estimated: !!i.confidence_estimated,
      performance_estimated: !!i.performance_estimated,
      entered_by: user?.id,
    }));

    const { error } = await supabase.from("weekly_scores").upsert(rows as any, { onConflict: "staff_id,weekly_focus_id" });
    if (error) {
      return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    }

    try {
      const raw = localStorage.getItem("backfillProgress");
      const obj = raw ? JSON.parse(raw) : {};
      obj[weekNum] = true;
      localStorage.setItem("backfillProgress", JSON.stringify(obj));
    } catch {}

    navigate(weekNum >= 6 ? "/backfill/review" : `/backfill/${weekNum + 1}`);
  };

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
        <h1 className="text-2xl font-bold">Week {weekNum}</h1>
        {focusList.map((item, idx) => (
          <Card key={item.id}>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{item.domain_name}</Badge>
                {item.universal && (
                  <Badge variant="outline" className="text-xs">Universal</Badge>
                )}
                <Badge variant="outline" className="ml-auto">{idx + 1}/3</Badge>
              </div>

              {!item.self_select ? (
                <p className="text-sm">{item.action_statement}</p>
              ) : (
                <div className="space-y-2">
                  <Label>Choose your Pro Move</Label>
                  <Select
                    value={item.selected_action_id?.toString() ?? ""}
                    onValueChange={(v) => {
                      const val = v ? Number(v) : null;
                      setFocusList((prev) => prev.map((f) => f.id === item.id ? { ...f, selected_action_id: val } : f));
                    }}
                  >
                    <SelectTrigger aria-label="Choose your Pro Move">
                      <SelectValue placeholder="— Select —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">— Select —</SelectItem>
                      {(item.options || []).map((opt) => (
                        <SelectItem key={opt.action_id} value={opt.action_id.toString()}>
                          {opt.action_statement}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Confidence</Label>
                  <NumberScale
                    value={item.confidence}
                    onChange={(val) => setFocusList((prev) => prev.map((f) => f.id === item.id ? { ...f, confidence: val } : f))}
                    hideTips
                  />
                </div>
                <div className="space-y-2">
                  <Label>Performance</Label>
                  <NumberScale
                    value={item.performance}
                    onChange={(val) => setFocusList((prev) => prev.map((f) => f.id === item.id ? { ...f, performance: val } : f))}
                    hideTips
                  />
                </div>
              </div>

            </CardContent>
          </Card>
        ))}
        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={handleSkip}>Skip this week</Button>
          <Button onClick={handleSaveNext}>Save & Next</Button>
        </div>
      </section>
    </main>
  );
}
