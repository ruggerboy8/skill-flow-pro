import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, PartyPopper } from 'lucide-react';

export function ChristmasWelcome() {
  return (
    <Card className="mb-4 md:mb-6 rounded-none border-x-0 md:rounded-xl md:border bg-gradient-to-r from-amber-50 to-violet-50 dark:from-amber-950/20 dark:to-violet-950/20 border-amber-200 dark:border-amber-800/30 overflow-hidden relative">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xKSIvPjwvc3ZnPg==')] opacity-50" />
      <CardContent className="py-3 px-4 md:py-4 md:px-6 relative">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="animate-pulse">
              <Sparkles className="h-5 w-5 md:h-6 md:w-6 text-yellow-500" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-bold bg-gradient-to-r from-amber-600 to-violet-600 dark:from-amber-400 dark:to-violet-400 bg-clip-text text-transparent">
                Happy New Year 2025! 🎉
              </h2>
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5 md:mt-1">
                Here's to a year of growth, success, and new ProMoves!
              </p>
            </div>
          </div>
          <PartyPopper className="h-6 w-6 md:h-8 md:w-8 text-amber-500 animate-bounce shrink-0" style={{ animationDuration: '2s' }} />
        </div>
      </CardContent>
    </Card>
  );
}
