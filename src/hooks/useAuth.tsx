import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  needsPasswordSetup: boolean;
  isCoach: boolean;
  signInWithOtp: (email: string) => Promise<{ error: any }>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: any }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ error: any }>;
  resetPassword: (email: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const [isCoach, setIsCoach] = useState(false);

  useEffect(() => {
    const checkCoachStatus = async (userId: string) => {
      const { data } = await supabase
        .from('staff')
        .select('is_coach, is_super_admin')
        .eq('user_id', userId)
        .single();
      
      if (data) {
        setIsCoach(data.is_coach || data.is_super_admin);
      }
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Check if user needs password setup based on metadata flag
        if (event === 'SIGNED_IN' && session?.user) {
          const hasPasswordSet = session.user.user_metadata?.password_set;
          if (!hasPasswordSet) {
            // User needs to set password
            setNeedsPasswordSetup(true);
          } else {
            setNeedsPasswordSetup(false);
          }
          // Check coach status
          checkCoachStatus(session.user.id);
        } else {
          setNeedsPasswordSetup(false);
          setIsCoach(false);
        }
        
        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      // Check password setup for existing sessions too
      if (session?.user) {
        const hasPasswordSet = session.user.user_metadata?.password_set;
        setNeedsPasswordSetup(!hasPasswordSet);
        // Check coach status
        checkCoachStatus(session.user.id);
      } else {
        setNeedsPasswordSetup(false);
        setIsCoach(false);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithOtp = async (email: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
    
    return { error };
  };

  const signInWithPassword = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    return { error };
  };

  const signUpWithPassword = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
    
    return { error };
  };

  const resetPassword = async (email: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl
    });
    
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      needsPasswordSetup,
      isCoach,
      signInWithOtp,
      signInWithPassword,
      signUpWithPassword,
      resetPassword,
      signOut
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}