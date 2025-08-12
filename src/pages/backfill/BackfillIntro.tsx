import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function BackfillIntro() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Backfill Wizard – Weeks 1–6";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Enter Weeks 1–6 binder scores to kickstart your SkillCheck stats.");
  }, []);

  const getFirstIncompleteWeek = () => {
    try {
      const raw = localStorage.getItem("backfillProgress");
      const progress = raw ? JSON.parse(raw) as Record<string, boolean> : {};
      for (let w = 1; w <= 6; w++) {
        if (!progress[w]) return w;
      }
    } catch {}
    return 1;
  };

  const hasProgress = (() => {
    try {
      const raw = localStorage.getItem("backfillProgress");
      if (!raw) return false;
      const p = JSON.parse(raw);
      return Object.keys(p).length > 0;
    } catch {
      return false;
    }
  })();

  const handleStart = () => {
    const week = getFirstIncompleteWeek();
    navigate(`/backfill/${week}`);
  };

  return (
    <main className="min-h-screen bg-background p-6">
      <section className="max-w-xl mx-auto text-center space-y-6">
        <h1 className="text-3xl font-bold">Backfill: Weeks 1–6</h1>
        <p className="text-muted-foreground">
          Grab your binder. You’ll enter Weeks 1–6. If a week didn’t happen, you can skip it.
        </p>
        <Button size="lg" onClick={handleStart}>
          {hasProgress ? "Resume" : "Start"}
        </Button>
      </section>
    </main>
  );
}
