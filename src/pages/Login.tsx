import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('signin');
  const [showResetOption, setShowResetOption] = useState(false);
  const { signInWithOtp, signInWithPassword, resetPassword } = useAuth();
  const { toast } = useToast();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    const { error } = await signInWithPassword(email, password);
    
    if (error) {
      toast({
        title: "Sign in failed",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Welcome back!",
        description: "You've been signed in successfully"
      });
    }
    setLoading(false);
  };

  const handleNewUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    
    // Try to send magic link - if user exists, Supabase will send a magic link
    // If user doesn't exist, it will create them and send confirmation
    const { error } = await signInWithOtp(email);
    
    if (error) {
      // If there's an error, it might be because the user already exists
      // Show reset password option
      if (error.message?.includes('already registered') || error.message?.includes('user already exists')) {
        setShowResetOption(true);
        toast({
          title: "User already exists",
          description: "This email is already registered. You can reset your password or try signing in.",
          variant: "default"
        });
      } else {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive"
        });
      }
    } else {
      toast({
        title: "Check your email",
        description: "We've sent you a magic link to sign in or complete your registration"
      });
      setShowResetOption(false);
    }
    setLoading(false);
  };

  const handlePasswordReset = async () => {
    if (!email) return;

    setLoading(true);
    const { error } = await resetPassword(email);
    
    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Password reset sent",
        description: "Check your email for password reset instructions"
      });
      setShowResetOption(false);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setShowResetOption(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">SkillCheck</CardTitle>
          <CardDescription>
            Sign in to your account or register as a new user
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value); resetForm(); }} className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="newuser">New User</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    placeholder="your.email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password">Password</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    placeholder="Your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={loading || !email || !password}
                >
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="newuser">
              <form onSubmit={handleNewUser} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newuser-email">Email</Label>
                  <Input
                    id="newuser-email"
                    type="email"
                    placeholder="your.email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={loading || !email}
                >
                  {loading ? "Sending..." : "Send Magic Link"}
                </Button>
                
                {showResetOption && (
                  <div className="space-y-2 pt-4 border-t">
                    <p className="text-sm text-muted-foreground text-center">
                      This email is already registered
                    </p>
                    <Button 
                      type="button"
                      variant="outline"
                      className="w-full" 
                      onClick={handlePasswordReset}
                      disabled={loading}
                    >
                      Reset Password
                    </Button>
                  </div>
                )}
                
                <p className="text-sm text-muted-foreground text-center">
                  We'll send you a magic link to complete registration or sign in
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}