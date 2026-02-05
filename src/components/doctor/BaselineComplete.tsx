import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';

interface BaselineCompleteProps {
  onFinish: () => void;
}

export function BaselineComplete({ onFinish }: BaselineCompleteProps) {
  return (
    <Card className="max-w-2xl mx-auto text-center">
      <CardHeader>
        <div className="flex justify-center mb-4">
          <div className="p-4 bg-green-100 rounded-full">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
          </div>
        </div>
        <CardTitle className="text-2xl">Baseline Complete!</CardTitle>
        <CardDescription className="text-base mt-2">
          Your self-assessment has been submitted successfully.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-muted/50 rounded-lg p-4">
          <h3 className="font-semibold mb-2">What happens next?</h3>
          <p className="text-sm text-muted-foreground">
            Dr. Alex will reach out to schedule your baseline check-in conversation. 
            This is a collaborative discussion to align on your development priorities 
            and create a plan for your professional growth.
          </p>
        </div>

        <Button onClick={onFinish} className="w-full" size="lg">
          Go to Home
        </Button>
      </CardContent>
    </Card>
  );
}