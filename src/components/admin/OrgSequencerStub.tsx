import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Info } from 'lucide-react';

export function OrgSequencerStub() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Org Sequencer (Coming Soon)
          </CardTitle>
          <CardDescription>
            This tab will become the source of truth to compute and publish the next week's org-wide focus (and preview week +1).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
            <li>Computation is org-wide per role (DFI / RDA), using a confidence-first NeedScore.</li>
            <li>Constraints will be enforced: cooldown ≥ 2 weeks, ≥ 2 domains/week, coverage ≥ 1×/4 weeks.</li>
            <li>We will show three columns: Current Week (live), Next Week (computed), Week +1 (preview).</li>
            <li>Publishing & lock windows will be added here in a later phase.</li>
          </ul>
          <div className="pt-2">
            <Button disabled variant="secondary">Run (Dry-Run)</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
