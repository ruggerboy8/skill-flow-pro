import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, PartyPopper } from 'lucide-react';

export function ChristmasWelcome() {
  return (
    <Card className="mb-6 bg-gradient-to-r from-amber-50 to-violet-50 dark:from-amber-950/20 dark:to-violet-950/20 border-amber-200 dark:border-amber-800/30 overflow-hidden relative">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xKSIvPjwvc3ZnPg==')] opacity-50" />
      <CardContent className="pt-6 pb-6 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="animate-pulse">
              <Sparkles className="h-8 w-8 text-yellow-500" />
            </div>
            <div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-amber-600 to-violet-600 dark:from-amber-400 dark:to-violet-400 bg-clip-text text-transparent">
                Happy New Year 2025! 🎉
              </h2>
              <p className="text-muted-foreground mt-1">
                Here's to a year of growth, success, and new ProMoves!
              </p>
            </div>
          </div>
          <PartyPopper className="h-10 w-10 text-amber-500 animate-bounce" style={{ animationDuration: '2s' }} />
        </div>
      </CardContent>
    </Card>
  );
}
