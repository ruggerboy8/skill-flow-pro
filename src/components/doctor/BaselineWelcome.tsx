import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClipboardList, Loader2 } from 'lucide-react';

interface BaselineWelcomeProps {
  staffName: string;
  onStart: () => void;
  isLoading?: boolean;
}

export function BaselineWelcome({ staffName, onStart, isLoading }: BaselineWelcomeProps) {
  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <div className="p-4 bg-primary/10 rounded-full">
            <ClipboardList className="h-12 w-12 text-primary" />
          </div>
        </div>
        <CardTitle className="text-2xl">Welcome, Dr. {staffName}</CardTitle>
        <CardDescription className="text-base mt-2">
          You're about to complete your baseline self-assessment
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
          <h3 className="font-semibold">What to expect:</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">•</span>
              <span>You'll rate yourself on each Doctor Pro Move across several clinical domains</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">•</span>
              <span>Each Pro Move includes supporting materials to help calibrate your rating</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">•</span>
              <span>This is a self-reflection exercise — not a test or evaluation</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold">•</span>
              <span>Your ratings will inform a coaching conversation, not a performance review</span>
            </li>
          </ul>
        </div>

        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
          <p className="text-sm text-center italic text-muted-foreground">
            "The goal is calibration, not grading. Be honest about where you are today — 
            that's the foundation for meaningful growth."
          </p>
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