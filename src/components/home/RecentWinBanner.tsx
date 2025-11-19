import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Star, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStaffProfile } from "@/hooks/useStaffProfile";
import { getDomainColor } from "@/lib/domainColors";

interface WinData {
  week_of: string;
  action_statement: string;
  domain_name: string;
  lift_amount: number;
  win_type: 'growth' | 'perfect';
}

export function RecentWinBanner() {
  const { data: staff } = useStaffProfile();
  const [win, setWin] = useState<WinData | null>(null);
  const [visible, setVisible] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!staff?.id) return;
    
    // Check session storage for dismissal
    const dismissKey = `dismissed_win_banner_${staff.id}`;
    if (sessionStorage.getItem(dismissKey)) {
      setVisible(false);
      setLoading(false);
      return;
    }

    async function fetchWin() {
      try {
        const { data, error } = await supabase.rpc('get_best_weekly_win', { 
          p_staff_id: staff.id
        });
        
        if (error) {
          console.error('Error fetching win:', error);
          setWin(null);
        } else if (data && data.length > 0) {
          setWin(data[0] as WinData);
        }
      } catch (err) {
        console.error('Failed to fetch weekly win:', err);
      } finally {
        setLoading(false);
      }
    }
    
    fetchWin();
  }, [staff?.id]);

  const handleDismiss = () => {
    if (!staff?.id) return;
    setVisible(false);
    sessionStorage.setItem(`dismissed_win_banner_${staff.id}`, 'true');
  };

  // Don't render anything while loading or if no win
  if (loading || !win || !visible) return null;

  // Style configuration
  const isGrowth = win.win_type === 'growth';
  
  const styles = isGrowth ? {
    bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800",
    iconBg: "bg-emerald-100 dark:bg-emerald-900",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    icon: TrendingUp,
    badgeBg: "bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-100",
    title: "Growth Detected",
    badgeText: `+${win.lift_amount} LIFT`
  } : {
    bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
    iconBg: "bg-blue-100 dark:bg-blue-900",
    iconColor: "text-blue-600 dark:text-blue-400",
    icon: Star,
    badgeBg: "bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-100",
    title: "Perfect Week",
    badgeText: "100% SCORE"
  };
  
  const Icon = styles.icon;

  return (
    <div className="animate-in slide-in-from-top-2 duration-500 fade-in">
      <Card className={`relative border shadow-sm overflow-hidden ${styles.bg}`}>
        <CardContent className="p-4 flex gap-3 items-start">
          {/* Icon */}
          <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${styles.iconBg}`}>
            <Icon className={`h-5 w-5 ${styles.iconColor}`} />
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-bold uppercase tracking-wider ${styles.iconColor}`}>
                {styles.title}
              </span>
              <Badge variant="secondary" className={`text-[10px] h-5 px-1.5 border-0 ${styles.badgeBg}`}>
                {styles.badgeText}
              </Badge>
            </div>
            
            <p className="text-sm text-foreground font-medium leading-tight line-clamp-2">
              {win.action_statement}
            </p>
            
            {/* Domain tag (only for growth) */}
            {isGrowth && win.domain_name && (
              <div className="mt-2 flex items-center gap-1">
                <div 
                  className="h-1.5 w-1.5 rounded-full" 
                  style={{ backgroundColor: getDomainColor(win.domain_name) }}
                />
                <span className="text-[10px] text-muted-foreground uppercase font-medium">
                  {win.domain_name}
                </span>
              </div>
            )}
          </div>

          {/* Dismiss button */}
          <button 
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground transition-colors -mt-1 -mr-1 p-1"
            aria-label="Dismiss celebration"
          >
            <X className="h-4 w-4" />
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
