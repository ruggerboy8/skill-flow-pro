import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roleLoading: boolean;
  needsPasswordSetup: boolean;
  needsProfileSetup: boolean;
  isCoach: boolean;
  isSuperAdmin: boolean;
  isParticipant: boolean;
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
  const [roleLoading, setRoleLoading] = useState(false);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const [isCoach, setIsCoach] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isParticipant, setIsParticipant] = useState(true);

  useEffect(() => {
    const checkUserStatus = async (userId: string) => {
      setRoleLoading(true);
      try {
        const { data } = await supabase
          .from('staff')
          .select('is_coach, is_super_admin, is_participant, name, role_id, primary_location_id')
          .eq('user_id', userId)
          .single();
        
        if (data) {
          setIsCoach(data.is_coach || data.is_super_admin);
          setIsSuperAdmin(data.is_super_admin);
          setIsParticipant(data.is_participant);
          // Check if profile is complete
          setNeedsProfileSetup(false);
        } else {
          // No staff record exists, user needs to complete profile
          setNeedsProfileSetup(true);
          setIsCoach(false);
          setIsSuperAdmin(false);
          setIsParticipant(true);
        }
      } finally {
        setRoleLoading(false);
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
            setNeedsProfileSetup(false); // Don't show profile setup until password is set
          } else {
            setNeedsPasswordSetup(false);
            // Check if user needs to complete profile
            checkUserStatus(session.user.id);
          }
        } else {
          setNeedsPasswordSetup(false);
          setNeedsProfileSetup(false);
          setIsCoach(false);
          setIsSuperAdmin(false);
          setIsParticipant(true);
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
        if (!hasPasswordSet) {
          setNeedsPasswordSetup(true);
          setNeedsProfileSetup(false);
        } else {
          setNeedsPasswordSetup(false);
          // Check if user needs to complete profile
          checkUserStatus(session.user.id);
        }
      } else {
        setNeedsPasswordSetup(false);
        setNeedsProfileSetup(false);
        setIsCoach(false);
        setIsSuperAdmin(false);
        setIsParticipant(true);
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
      roleLoading,
      needsPasswordSetup,
      needsProfileSetup,
      isCoach,
      isSuperAdmin,
      isParticipant,
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