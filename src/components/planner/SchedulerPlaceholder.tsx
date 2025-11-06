import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from 'lucide-react';

export function SchedulerPlaceholder() {
  return (
    <Card className="opacity-60">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Week Builder (Coming Soon)
        </CardTitle>
        <CardDescription>
          Manual assignment interface - drag from recommendations or pick from library
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border-2 border-dashed rounded-lg p-8">
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((slot) => (
              <div
                key={slot}
                className="aspect-video border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground"
              >
                Slot {slot}
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground mt-4">
            You'll be able to drag from the recommendations or pick from the library
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
