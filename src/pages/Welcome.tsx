import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { BookOpen, TrendingUp, Trophy } from 'lucide-react';
import alcanLogo from '@/assets/alcan-logo-full.jpg';

interface StaffInfo {
  name: string;
  roleName: string | null;
  locationName: string | null;
}

export default function Welcome() {
  const navigate = useNavigate();
  const [staffInfo, setStaffInfo] = useState<StaffInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStaffInfo = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const { data: staff } = await supabase
          .from('staff')
          .select(`
            name,
            roles:role_id(role_name),
            locations:primary_location_id(name)
          `)
          .eq('user_id', user.id)
          .single();

        if (staff) {
          setStaffInfo({
            name: staff.name,
            roleName: (staff.roles as any)?.role_name || null,
            locationName: (staff.locations as any)?.name || null
          });
        }
      } catch (error) {
        console.error('Error fetching staff info:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStaffInfo();
  }, []);

  const firstName = staffInfo?.name?.split(' ')[0] || 'there';

  const features = [
    {
      icon: BookOpen,
      title: "Practice skills that matter",
      description: "Weekly focus areas tailored to your role"
    },
    {
      icon: TrendingUp,
      title: "Track your confidence",
      description: "See your growth over time"
    },
    {
      icon: Trophy,
      title: "Celebrate your wins",
      description: "Every step forward counts"
    }
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-muted/30">
      <Card className="w-full max-w-lg border-0 shadow-xl bg-card/95 backdrop-blur animate-in fade-in slide-in-from-bottom-4 duration-500">
        <CardContent className="pt-8 pb-8 space-y-6">
          {/* Logo */}
          <div className="flex justify-center">
            <img 
              src={alcanLogo} 
              alt="Alcan Dental Cooperative" 
              className="h-14 w-auto object-contain"
            />
          </div>

          {/* Celebration Header */}
          <div className="text-center space-y-2">
            {loading ? (
              <div className="space-y-2">
                <div className="h-8 w-64 mx-auto bg-muted animate-pulse rounded" />
                <div className="h-5 w-48 mx-auto bg-muted animate-pulse rounded" />
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-foreground">
                  Welcome to the team, {firstName}! 🎉
                </h1>
                {(staffInfo?.roleName || staffInfo?.locationName) && (
                  <p className="text-muted-foreground">
                    {staffInfo.roleName && staffInfo.locationName 
                      ? `You're joining as a ${staffInfo.roleName} at ${staffInfo.locationName}`
                      : staffInfo.roleName 
                        ? `You're joining as a ${staffInfo.roleName}`
                        : `You're joining the ${staffInfo.locationName} team`
                    }
                  </p>
                )}
              </>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Features */}
          <div className="space-y-4">
            <p className="text-sm font-medium text-center text-muted-foreground">
              ProMoves helps you:
            </p>
            <div className="space-y-3">
              {features.map((feature, index) => (
                <div 
                  key={feature.title}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 animate-in fade-in slide-in-from-left duration-300"
                  style={{ animationDelay: `${(index + 1) * 100}ms` }}
                >
                  <div className="flex-shrink-0 w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <feature.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-sm">{feature.title}</p>
                    <p className="text-xs text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <Button 
            onClick={() => navigate('/')} 
            className="w-full h-12 text-base font-semibold"
            size="lg"
          >
            Get Started
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
