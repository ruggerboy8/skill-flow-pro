import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="pb-4">
          <CardTitle className="text-3xl font-bold text-primary mb-2">
            Welcome to ProMoves! 🎉
          </CardTitle>
          <p className="text-muted-foreground text-lg">
            Your professional development journey starts here.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>Track your skills, rate your confidence, and unlock your potential with our weekly focus system.</p>
            <p>Ready to begin your growth journey?</p>
          </div>
          
          <Button 
            onClick={() => navigate('/')} 
            className="w-full h-12 text-lg font-semibold"
            size="lg"
          >
            Get Started
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}