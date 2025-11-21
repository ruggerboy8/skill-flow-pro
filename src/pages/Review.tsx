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

type Staff = { 
  id: string; 
  role_id: number;
  locations?: {
    organization_id: string;
  };
};
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
      
      // Get staff info
      const { data: staffRow } = await supabase
        .from("staff")
        .select("id, role_id")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (!staffRow) return;
      setStaff(staffRow as any);

      // Calculate week_of from cycle/week params (approximate)
      // This is a simplified calculation - in production you'd want proper cycle math
      const now = new Date();
      const dayOfWeek = now.getDay();
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() + daysToMonday);
      thisMonday.setHours(0, 0, 0, 0);
      const weekStartStr = thisMonday.toISOString().split('T')[0];

      // Use unified RPC to get assignments
      const { data, error } = await supabase.rpc('get_staff_week_assignments', {
        p_staff_id: staffRow.id,
        p_role_id: staffRow.role_id,
        p_week_start: weekStartStr
      });

      if (error) {
        console.error('[Review] RPC error:', error);
        setLoading(false);
        return;
      }

      // Parse JSONB response
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      const assignments = parsed?.assignments || [];

      // Build display rows
      const merged = assignments.map((row: any, idx: number) => ({
        id: row.focus_id,
        display_order: idx + 1,
        action_id: row.action_id,
        self_select: row.self_select,
        site_action_statement: row.action_statement,
        domain_name: row.domain_name,
        final_action_statement: row.action_statement,
        confidence_score: row.confidence_score,
        performance_score: row.performance_score,
      }));

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
