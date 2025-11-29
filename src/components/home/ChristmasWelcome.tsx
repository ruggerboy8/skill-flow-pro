import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Gift } from 'lucide-react';

export function ChristmasWelcome() {
  return (
    <Card className="mb-6 bg-gradient-to-r from-red-50 to-green-50 dark:from-red-950/20 dark:to-green-950/20 border-red-200 dark:border-red-800/30 overflow-hidden relative">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xKSIvPjwvc3ZnPg==')] opacity-50" />
      <CardContent className="pt-6 pb-6 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="animate-pulse">
              <Sparkles className="h-8 w-8 text-yellow-500" />
            </div>
            <div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-red-600 to-green-600 dark:from-red-400 dark:to-green-400 bg-clip-text text-transparent">
                Happy Holidays! 🎄
              </h2>
              <p className="text-muted-foreground mt-1">
                Wishing you a season of growth and success
              </p>
            </div>
          </div>
          <Gift className="h-10 w-10 text-red-500 animate-bounce" style={{ animationDuration: '2s' }} />
        </div>
      </CardContent>
    </Card>
  );
}
