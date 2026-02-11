import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface BaselineWelcomeProps {
  staffName: string;
  onStart: () => void;
  isLoading?: boolean;
}

export function BaselineWelcome({ staffName, onStart, isLoading }: BaselineWelcomeProps) {
  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Hey {staffName},</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-muted/50 rounded-lg p-5 space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>I'm excited to go through this with you.</p>
          <p>
            Here's how this works: you'll go through each of the Doctor Pro Moves and rate yourself 
            on a simple 1–4 scale. This isn't a test — it's a starting point for our conversation.
          </p>
          <p>
            Be honest about where you are today. That's what makes this useful.
          </p>
          <p className="text-right font-medium text-foreground">— Dr. Alex</p>
        </div>

        <Button 
          className="w-full" 
          size="lg" 
          onClick={onStart}
          disabled={isLoading}
        >
          {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Begin Assessment
        </Button>
      </CardContent>
    </Card>
  );
}
