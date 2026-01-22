import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Check, Loader2 } from 'lucide-react';
import alcanLogo from '@/assets/alcan-logo-full.jpg';

interface StaffInfo {
  name: string;
  locationName: string | null;
}

export default function SetupPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [staffInfo, setStaffInfo] = useState<StaffInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Fetch staff info for personalization
  useEffect(() => {
    const fetchStaffInfo = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoadingInfo(false);
          return;
        }

        const { data: staff } = await supabase
          .from('staff')
          .select(`
            name,
            locations:primary_location_id(name)
          `)
          .eq('user_id', user.id)
          .single();

        if (staff) {
          setStaffInfo({
            name: staff.name,
            locationName: (staff.locations as any)?.name || null
          });
        }
      } catch (error) {
        console.error('Error fetching staff info:', error);
      } finally {
        setLoadingInfo(false);
      }
    };

    fetchStaffInfo();
  }, []);

  const firstName = staffInfo?.name?.split(' ')[0] || 'there';

  const handleSetupPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are the same.",
        variant: "destructive"
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters long",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    
    try {
      const { error: passwordError } = await supabase.auth.updateUser({
        password: password
      });

      if (passwordError) throw passwordError;

      const { error: metadataError } = await supabase.auth.updateUser({
        data: { password_set: true }
      });

      if (metadataError) throw metadataError;

      setSuccess(true);

      // Navigate to welcome after a brief celebration
      setTimeout(() => {
        navigate('/welcome');
      }, 1500);

    } catch (error: any) {
      toast({
        title: "Something went wrong",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-muted/30">
        <Card className="w-full max-w-md border-0 shadow-xl bg-card/95 backdrop-blur">
          <CardContent className="pt-10 pb-10 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center animate-in zoom-in duration-300">
              <Check className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground">You're all set!</h2>
            <p className="text-muted-foreground">
              Taking you to your welcome...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-muted/30">
      <Card className="w-full max-w-md border-0 shadow-xl bg-card/95 backdrop-blur">
        <CardContent className="pt-8 pb-8 space-y-6">
          {/* Logo */}
          <div className="flex justify-center">
            <img 
              src={alcanLogo} 
              alt="Alcan Dental Cooperative" 
              className="h-16 w-auto object-contain"
            />
          </div>

          {/* Personalized Greeting */}
          <div className="text-center space-y-2">
            {loadingInfo ? (
              <div className="h-8 w-48 mx-auto bg-muted animate-pulse rounded" />
            ) : (
              <h1 className="text-2xl font-bold text-foreground">
                Hey {firstName}! 👋
              </h1>
            )}
            <p className="text-muted-foreground text-sm leading-relaxed">
              {staffInfo?.locationName 
                ? `Your manager at ${staffInfo.locationName} invited you to ProMoves. Let's get you set up with a password.`
                : "You've been invited to ProMoves. Let's get you set up with a password."
              }
            </p>
          </div>

          {/* Password Form */}
          <form onSubmit={handleSetupPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="h-11"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-foreground">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Type it again"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="h-11"
              />
            </div>
            
            <Button 
              type="submit" 
              className="w-full h-12 text-base font-semibold mt-2" 
              disabled={loading || !password || !confirmPassword}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Setting up...
                </>
              ) : (
                "I'm Ready"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
