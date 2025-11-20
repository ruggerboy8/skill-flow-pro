import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Star, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStaffProfile } from "@/hooks/useStaffProfile";
import { getDomainColor } from "@/lib/domainColors";
import { format, parseISO, isSameWeek, subWeeks } from "date-fns";

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

  // Helper to generate full narrative package
  const getWinNarrative = (win: WinData) => {
    const date = parseISO(win.week_of);
    const today = new Date();
    const isLastWeek = isSameWeek(date, subWeeks(today, 1), { weekStartsOn: 1 });
    const timeLabel = isLastWeek ? "Last Week" : "Recent History";

    // 1. PERFECT WEEK (Maintenance)
    if (win.win_type === 'perfect') {
      return {
        headline: isLastWeek ? "Your Perfect Week" : "Consistency Streak",
        badge: "Solid Gold",
        context: "You maintained our highest standard across the board.",
        color: "blue",
        timeLabel
      };
    }

    // 2. BIG GROWTH (+2 or more)
    if (win.lift_amount >= 2) {
      return {
        headline: "Breakthrough",
        badge: "Level Up",
        context: "You flagged this as a gap on Monday and closed it by Friday:",
        color: "emerald",
        timeLabel
      };
    }

    // 3. SMALL GROWTH (+1)
    return {
      headline: "Trending Up",
      badge: "Progress",
      context: "You are building real confidence in this area:",
      color: "emerald",
      timeLabel
    };
  };

  // Get narrative and theme
  const narrative = getWinNarrative(win);
  const isEmerald = narrative.color === 'emerald';

  const theme = isEmerald ? {
    cardBorder: "border-emerald-200 bg-emerald-50/50",
    iconBox: "bg-emerald-100 text-emerald-700",
    textTitle: "text-emerald-800",
    badge: "bg-emerald-200 text-emerald-800 border-emerald-200",
    Icon: TrendingUp
  } : {
    cardBorder: "border-blue-200 bg-blue-50/50",
    iconBox: "bg-blue-100 text-blue-700",
    textTitle: "text-blue-800",
    badge: "bg-blue-200 text-blue-800 border-blue-200",
    Icon: Star
  };

  return (
    <div className="mb-6 animate-in slide-in-from-top-2 duration-500 fade-in">
      <Card className={`relative border shadow-sm overflow-hidden ${theme.cardBorder}`}>
        <CardContent className="p-4">
          
          {/* 1. Header Row: Icon | Headline | Badge */}
          <div className="flex items-start gap-3 mb-3">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${theme.iconBox}`}>
              <theme.Icon className="h-4 w-4" />
            </div>
            
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center justify-between">
                <h3 className={`text-sm font-bold ${theme.textTitle} tracking-tight`}>
                  {narrative.headline}
                </h3>
                <Badge variant="secondary" className={`text-[10px] px-1.5 h-5 font-bold ${theme.badge}`}>
                  {narrative.badge}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground font-medium">
                {narrative.timeLabel} • {format(parseISO(win.week_of), "MMM d")}
              </p>
            </div>
          </div>

          {/* 2. The "Why" (Context) */}
          <div className="space-y-2">
            <p className="text-xs text-slate-600 leading-snug">
              {narrative.context}
            </p>
            
            {/* 3. The "What" (Pro Move Quote) */}
            <div className="p-3 bg-white/80 rounded-md border border-black/5 shadow-sm">
              <p className="text-sm font-medium text-slate-800 leading-snug line-clamp-2 italic">
                "{win.action_statement}"
              </p>
            </div>
          </div>

          {/* Dismiss Button */}
          <button 
            onClick={handleDismiss}
            className="absolute top-1 right-1 p-2 text-slate-400 hover:text-slate-600"
            aria-label="Dismiss celebration"
          >
            <X className="h-4 w-4" />
          </button>

        </CardContent>
      </Card>
    </div>
  );
}
