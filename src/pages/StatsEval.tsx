import { Card, CardContent } from '@/components/ui/card';
import { Lock } from 'lucide-react';

export default function StatsEval() {
  return (
    <Card>
      <CardContent className="py-16 text-center">
        <div className="flex flex-col items-center gap-4">
          <Lock className="h-12 w-12 text-muted-foreground/50" />
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-muted-foreground">Coming Soon</h3>
            <p className="text-muted-foreground">
              Manager-assisted 6-week evaluation will appear here.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}