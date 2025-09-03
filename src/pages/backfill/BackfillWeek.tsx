// src/pages/backfill/BackfillWeek.tsx
import { useEffect, useMemo, useRef, useState } from "react";
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
import { getDomainColor } from "@/lib/domainColors";

interface Staff { id: string; role_id: number; }
interface FocusBase { id: string; display_order: number; action_statement: string; domain_name: string; }
interface FocusMeta { id: string; self_select: boolean; universal: boolean; competency_id: number | null; action_id: number | null; }
interface SelectOption { action_id: number; action_statement: string; }

// Draft saved locally (per week)
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

function draftKey(staffId: string, roleId: number, weekNum: number) {
  // Backfill is always Cycle 1; include staff/role/week to isolate drafts
  return `backfillDraft:${staffId}:role${roleId}:cycle1:week${weekNum}`;
}

function goToWeek(n: number, navigate: (to: string) => void) {
  if (n < 1) return navigate("/backfill");
  if (n > 6) return navigate("/backfill/review");
  navigate(`/backfill/${n}`);
}

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
  })[]>([]);
  const [loading, setLoading] = useState(true);

  // Avoid saving while we’re hydrating from DB/draft
  const hydrating = useRef(true);

  useEffect(() => {
    document.title = `Backfill – Week ${weekNum}`;
  }, [weekNum]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        setLoading(true);

        // 1) Load staff
        const { data: staffRow, error: staffErr } = await supabase
          .from("staff").select("id, role_id").eq("user_id", user.id).maybeSingle();

        if (staffErr || !staffRow) {
          toast({ title: "Profile missing", description: "Please complete setup.", variant: "destructive" });
          navigate("/setup");
          return;
        }
        setStaff(staffRow);

        // 2) Load base focus rows (text + domain)
        const { data: base } = await supabase.rpc("get_focus_cycle_week", {
          p_cycle: 1,
          p_week: weekNum,
          p_role_id: staffRow.role_id,
        }) as { data: FocusBase[] | null; error: any };

        // 3) Load meta from weekly_focus
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
          };
        });

        // 4) Prefetch self-select options
        for (const item of merged) {
          if (item.self_select && item.competency_id) {
            const { data: opts } = await supabase
              .from("pro_moves")
              .select("action_id, action_statement")
              .eq("competency_id", item.competency_id)
              .eq("active", true)
              .order("action_statement");
            item.options = opts || [];
          }
        }

        // 5) Hydrate from local draft first (preferred), else DB (if any legacy entries exist)
        let draftApplied = false;
        try {
          const raw = localStorage.getItem(draftKey(staffRow.id, staffRow.role_id, weekNum));
          if (raw) {
            const draft: DraftPayload = JSON.parse(raw);
            if (draft?.items?.length) {
              for (const item of merged) {
                const d = draft.items.find(di => di.weekly_focus_id === item.id);
                if (d) {
                  item.selected_action_id = d.selected_action_id ?? null;
                  item.confidence = d.confidence ?? null;
                  item.performance = d.performance ?? null;
                }
              }
              draftApplied = true;
            }
          }
        } catch { /* ignore */ }

        if (!draftApplied) {
          // Fallback: if user had previous DB entries, prefill them (purely for convenience)
          const focusIds = merged.map((m) => m.id);
          const { data: prev } = await supabase
            .from("weekly_scores")
            .select("weekly_focus_id, selected_action_id, confidence_score, performance_score")
            .eq("staff_id", staffRow.id)
            .in("weekly_focus_id", focusIds);

          for (const item of merged) {
            const row = (prev || []).find((p) => p.weekly_focus_id === item.id);
            if (row) {
              item.selected_action_id = row.selected_action_id;
              item.confidence = row.confidence_score;
              item.performance = row.performance_score;
            }
          }
        }

        hydrating.current = true; // about to set list; block autosave until after first paint
        setFocusList(merged.sort((a,b)=>a.display_order-b.display_order));
        // Allow autosave on next tick
        setTimeout(() => { hydrating.current = false; }, 0);
      } catch (e: any) {
        console.error("Backfill load failed:", e);
        toast({ title: "Error", description: "Failed to load backfill items.", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [user, weekNum, navigate, toast]);

  // === Auto-save drafts to localStorage whenever user changes anything ===
  useEffect(() => {
    if (!staff || hydrating.current) return;
    try {
      const draft: DraftPayload = {
        staff_id: staff.id,
        role_id: staff.role_id,
        week: weekNum,
        items: focusList.map(i => ({
          weekly_focus_id: i.id,
          selected_action_id: i.self_select ? (i.selected_action_id ?? null) : null,
          confidence: i.confidence ?? null,
          performance: i.performance ?? null,
        })),
      };
      localStorage.setItem(draftKey(staff.id, staff.role_id, weekNum), JSON.stringify(draft));
    } catch (e) {
      console.warn("Failed to save backfill draft:", e);
    }
  }, [focusList, staff, weekNum]);

  const handleBack = () => {
    // No DB writes; drafts are already saved
    goToWeek(weekNum - 1, navigate);
  };

  const handleSaveNext = () => {
    // Allow blanks: we just move forward; draft is already saved
    goToWeek(weekNum + 1, navigate);
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
                <Badge
                  variant="outline"
                  className="text-foreground border-transparent"
                  style={{ backgroundColor: getDomainColor(item.domain_name) }}
                >
                  {item.domain_name}
                </Badge>
                {item.universal && (
                  <Badge variant="outline" className="text-xs">Universal</Badge>
                )}
                <Badge variant="outline" className="ml-auto">{idx + 1}/3</Badge>
              </div>

              {!item.self_select ? (
                <p className="text-sm">{item.action_statement}</p>
              ) : (
                <div className="space-y-2">
                  <Label>Choose your Pro Move (optional)</Label>
                  <Select
                    value={item.selected_action_id?.toString() ?? ""}
                    onValueChange={(v) => {
                      const val = v ? Number(v) : null;
                      setFocusList((prev) =>
                        prev.map((f) => f.id === item.id ? { ...f, selected_action_id: val } : f)
                      );
                    }}
                  >
                    <SelectTrigger aria-label="Choose your Pro Move">
                      <SelectValue placeholder="— Select (optional) —" />
                    </SelectTrigger>
                    <SelectContent>
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
                  <Label>Confidence (optional)</Label>
                  <NumberScale
                    value={item.confidence}
                    onChange={(val) =>
                      setFocusList((prev) => prev.map((f) => f.id === item.id ? { ...f, confidence: val } : f))
                    }
                    hideTips
                  />
                </div>
                <div className="space-y-2">
                  <Label>Performance (optional)</Label>
                  <NumberScale
                    value={item.performance}
                    onChange={(val) =>
                      setFocusList((prev) => prev.map((f) => f.id === item.id ? { ...f, performance: val } : f))
                    }
                    hideTips
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={handleBack}>Back</Button>
          <Button onClick={handleSaveNext}>Save & Next</Button>
        </div>
      </section>
    </main>
  );
}