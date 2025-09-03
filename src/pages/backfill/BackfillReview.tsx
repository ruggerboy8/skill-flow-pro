// src/pages/backfill/BackfillReview.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getDomainColor } from "@/lib/domainColors";
import ConfPerfDelta from "@/components/ConfPerfDelta";

type Staff = { id: string; role_id: number };

type DraftItem = {
  weekly_focus_id: string;
  selected_action_id: number | null;
  confidence: number | null;
  performance: number | null;
};

type DraftPayload = {
  staff_id: string;
  role_id: number;
  week: number;
  items: DraftItem[];
};

type FocusRow = {
  id: string;
  display_order: number;
  week_in_cycle: number;
  self_select: boolean;
  base_action_id: number | null; // weekly_focus.action_id
  base_action_statement: string | null; // pro_moves(action_id) text
  domain_name: string;
};

type ReviewRow = FocusRow & {
  // From drafts
  selected_action_id?: number | null;
  selected_action_statement?: string | null;
  confidence_score?: number | null;
  performance_score?: number | null;
};

function draftKey(staffId: string, roleId: number, weekNum: number) {
  return `backfillDraft:${staffId}:role${roleId}:cycle1:week${weekNum}`;
}

export default function BackfillReview() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [staff, setStaff] = useState<Staff | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Backfill Review – Weeks 1–6";
  }, []);

  useEffect(() => {
    if (!user) return;

    (async () => {
      try {
        setLoading(true);

        // 1) Staff
        const { data: staffRow, error: staffErr } = await supabase
          .from("staff")
          .select("id, role_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (staffErr || !staffRow) {
          toast({
            title: "Profile missing",
            description: "Please complete setup.",
            variant: "destructive",
          });
          navigate("/setup");
          return;
        }
        setStaff(staffRow);

        // 2) weekly_focus for cycle 1, weeks 1..6 (w/ pro_moves join for base statement + competency for domain)
        const { data: wf, error: wfErr } = await supabase
          .from("weekly_focus")
          .select(`
            id,
            display_order,
            week_in_cycle,
            self_select,
            action_id,
            pro_moves:pro_moves!weekly_focus_action_id_fkey(action_statement, competency_id)
          `)
          .eq("cycle", 1)
          .eq("role_id", staffRow.role_id)
          .in("week_in_cycle", [1, 2, 3, 4, 5, 6])
          .order("week_in_cycle")
          .order("display_order");

        if (wfErr) throw wfErr;

        // 3) Build competency -> domain map (to show colored badges)
        const competencyIds = Array.from(
          new Set((wf || []).map((w: any) => w.pro_moves?.competency_id).filter(Boolean))
        ) as number[];

        let competencyToDomainName: Record<number, string> = {};
        if (competencyIds.length) {
          const { data: comps } = await supabase
            .from("competencies")
            .select("competency_id, domain_id")
            .in("competency_id", competencyIds);

          const domainIds = Array.from(
            new Set((comps || []).map((c) => c.domain_id).filter(Boolean))
          ) as number[];

          if (domainIds.length) {
            const { data: domains } = await supabase
              .from("domains")
              .select("domain_id, domain_name")
              .in("domain_id", domainIds);

            const dMap: Record<number, string> = {};
            (domains || []).forEach((d) => (dMap[d.domain_id] = d.domain_name));

            (comps || []).forEach((c) => {
              if (c.domain_id && dMap[c.domain_id]) {
                competencyToDomainName[c.competency_id] = dMap[c.domain_id];
              }
            });
          }
        }

        // 4) Read drafts for weeks 1..6 and map by weekly_focus_id
        const draftByFocus: Record<
          string,
          { selected_action_id: number | null; confidence: number | null; performance: number | null }
        > = {};

        const selectedActionIds = new Set<number>();

        for (let w = 1; w <= 6; w++) {
          try {
            const raw = localStorage.getItem(draftKey(staffRow.id, staffRow.role_id, w));
            if (!raw) continue;
            const draft: DraftPayload = JSON.parse(raw);
            (draft?.items || []).forEach((it) => {
              draftByFocus[it.weekly_focus_id] = {
                selected_action_id: it.selected_action_id ?? null,
                confidence: it.confidence ?? null,
                performance: it.performance ?? null,
              };
              if (it.selected_action_id) selectedActionIds.add(it.selected_action_id);
            });
          } catch {
            /* ignore */
          }
        }

        // 5) If there are any selected_action_ids in drafts, fetch their statements
        let selectedActionMap: Record<number, string> = {};
        if (selectedActionIds.size) {
          const ids = Array.from(selectedActionIds);
          const { data: acts } = await supabase
            .from("pro_moves")
            .select("action_id, action_statement")
            .in("action_id", ids);
          (acts || []).forEach((a) => (selectedActionMap[a.action_id] = a.action_statement));
        }

        // 6) Compose review rows
        const review: ReviewRow[] = (wf || []).map((w: any) => {
          const draft = draftByFocus[w.id];
          const competencyId = w.pro_moves?.competency_id as number | undefined;
          const domain = competencyId ? competencyToDomainName[competencyId] || "General" : "General";

          // Base (site move) text if present
          const baseText: string | null = w.pro_moves?.action_statement ?? null;

          // If a self-select draft has a selected_action_id, prefer that text
          let selectedText: string | null = null;
          if (draft?.selected_action_id) {
            selectedText = selectedActionMap[draft.selected_action_id] ?? null;
          }

          return {
            id: w.id,
            display_order: w.display_order,
            week_in_cycle: w.week_in_cycle,
            self_select: !!w.self_select,
            base_action_id: w.action_id ?? null,
            base_action_statement: baseText,
            domain_name: domain,
            selected_action_id: draft?.selected_action_id ?? null,
            selected_action_statement: selectedText,
            confidence_score: draft?.confidence ?? null,
            performance_score: draft?.performance ?? null,
          };
        });

        setRows(review);
      } catch (e: any) {
        console.error("BackfillReview load failed:", e);
        toast({
          title: "Error",
          description: "Failed to load review.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [user, navigate, toast]);

  const byWeek = useMemo(() => {
    const map: Record<number, ReviewRow[]> = {};
    for (const r of rows) {
      map[r.week_in_cycle] = map[r.week_in_cycle] || [];
      map[r.week_in_cycle].push(r);
    }
    return map;
  }, [rows]);

  async function handleFinish() {
    if (!user || !staff) return;
    setSubmitting(true);

    try {
      // Build upsert payload: ONLY rows where the user entered something
      const toUpsert = rows
        .map((r) => {
          const hasSelection = r.self_select && r.selected_action_id != null;
          const hasAnyScore = r.confidence_score != null || r.performance_score != null;
          if (!hasSelection && !hasAnyScore) return null;

          // Only attach selected_action_id for self-select slots
          const selected_action_id =
            r.self_select ? r.selected_action_id ?? null : null;

          const payload: Record<string, any> = {
            staff_id: staff.id,
            weekly_focus_id: r.id,
            selected_action_id,
            confidence_score: r.confidence_score ?? null,
            performance_score: r.performance_score ?? null,
            // mark sources only when present
            confidence_source: r.confidence_score != null ? "backfill" : null,
            performance_source: r.performance_score != null ? "backfill" : null,
            entered_by: user.id,
          };

          return payload;
        })
        .filter(Boolean) as any[];

      if (toUpsert.length) {
        const { error: upErr } = await supabase
          .from("weekly_scores")
          .upsert(toUpsert, { onConflict: "staff_id,weekly_focus_id" });
        if (upErr) throw upErr;

        // Retiming: prefer the unified retime function; fall back if missing
        let retimeOk = false;
        try {
          const { error: rErr } = await supabase.rpc("retime_backfill_cycle", {
            p_staff_id: staff.id,
            p_role_id: staff.role_id,
            p_cycle: 1,
          });
          if (rErr) throw rErr;
          retimeOk = true;
        } catch (e) {
          // Fallback to legacy timestamp backfill if present
          try {
            const { error: bErr } = await supabase.rpc(
              "backfill_historical_score_timestamps",
              {
                p_staff_id: staff.id,
                p_only_backfill: true,
                p_jitter_minutes: 30,
              }
            );
            if (bErr) throw bErr;
            retimeOk = true;
          } catch (e2) {
            console.warn("No retime RPC available; continuing without retime.", e2);
          }
        }

        toast({
          title: "Backfill submitted",
          description: retimeOk
            ? "Saved and dated to the correct historical weeks."
            : "Saved (dates unchanged).",
        });
      } else {
        toast({
          title: "Nothing to submit",
          description: "No entries were filled in the backfill.",
        });
      }

      // Mark backfill done & clear all drafts for this staff/role
      for (let w = 1; w <= 6; w++) {
        localStorage.removeItem(draftKey(staff.id, staff.role_id, w));
      }
      localStorage.setItem("backfillDone", "true");
      const raw = localStorage.getItem("backfillProgress");
      const progress = raw ? JSON.parse(raw) : {};
      for (let w = 1; w <= 6; w++) progress[w] = true;
      localStorage.setItem("backfillProgress", JSON.stringify(progress));

      navigate("/");
    } catch (err: any) {
      console.error("Submit backfill failed:", err);
      toast({
        title: "Error",
        description: err?.message || "Failed to submit backfill.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

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
        <h1 className="text-2xl font-bold">Review backfill (Weeks 1–6)</h1>

        <div className="space-y-4">
          {([1, 2, 3, 4, 5, 6] as const).map((wk) => {
            const list = byWeek[wk] || [];
            if (!list.length) return null;

            return (
              <Card key={wk}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">Week {wk}</div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{list.length} items</Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/backfill/${wk}`)}
                      >
                        Edit week {wk}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {list.map((r) => {
                      // choose best display text for the action
                      const text =
                        r.self_select
                          ? r.selected_action_statement ||
                            r.base_action_statement ||
                            "— Select a Pro Move —"
                          : r.base_action_statement || "Pro Move";

                      return (
                        <div
                          key={r.id}
                          className="flex items-center justify-between gap-4 text-sm p-3 rounded border"
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <Badge
                              variant="secondary"
                              className="ring-1 ring-border/50"
                              style={{
                                backgroundColor: getDomainColor(r.domain_name),
                              }}
                            >
                              {r.domain_name}
                            </Badge>
                            <div className="font-medium">{text}</div>
                          </div>
                          <div className="flex items-center gap-4">
                            <ConfPerfDelta
                              confidence={r.confidence_score}
                              performance={r.performance_score}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex justify-end">
          <Button size="lg" onClick={handleFinish} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit & Finish"}
          </Button>
        </div>
      </section>
    </main>
  );
}