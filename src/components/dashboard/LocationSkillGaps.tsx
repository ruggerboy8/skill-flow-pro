import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { supabase } from '@/integrations/supabase/client';
import { getDomainColor } from '@/lib/domainColors';

interface SkillGap {
  action_id: number;
  action_statement: string;
  role_id: number;
  role_name: string;
  domain_name: string;
  avg_confidence: number;
  staff_count: number;
}

interface LocationSkillGapsProps {
  locationId: string;
}

type LookbackOption = '3' | '6' | 'all';

export function LocationSkillGaps({ locationId }: LocationSkillGapsProps) {
  const [gaps, setGaps] = useState<SkillGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lookback, setLookback] = useState<LookbackOption>('6');

  useEffect(() => {
    async function fetchGaps() {
      setLoading(true);
      setError(null);
      
      // Convert lookback option to weeks (52 * 5 = 260 weeks ≈ 5 years for "all time")
      const weeks = lookback === 'all' ? 260 : parseInt(lookback);
      
      const { data, error: err } = await supabase.rpc('get_location_skill_gaps', {
        p_location_id: locationId,
        p_lookback_weeks: weeks,
        p_limit_per_role: 3,
      });

      if (err) {
        console.error('Error fetching skill gaps:', err);
        setError(err.message);
      } else {
        setGaps(data || []);
      }
      setLoading(false);
    }

    if (locationId) {
      fetchGaps();
    }
  }, [locationId, lookback]);

  const dfiGaps = gaps.filter(g => g.role_name === 'DFI');
  const rdaGaps = gaps.filter(g => g.role_name === 'RDA');
  const omGaps = gaps.filter(g => g.role_name === 'Office Manager');
  
  const hasOmGaps = omGaps.length > 0;
  const lookbackLabel = lookback === 'all' ? 'all time' : `${lookback} weeks`;

  function getConfidenceColor(avg: number): string {
    if (avg < 2.0) return 'bg-red-100 text-red-800 border-red-200';
    if (avg < 3.0) return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-green-100 text-green-800 border-green-200';
  }

  function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function SkillGapCard({ gap }: { gap: SkillGap }) {
    const domainColor = getDomainColor(gap.domain_name);

    return (
      <div 
        className="p-3 border rounded-lg space-y-2"
        style={{ 
          backgroundColor: hexToRgba(domainColor, 0.1),
          borderColor: hexToRgba(domainColor, 0.3)
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-tight flex-1">{gap.action_statement}</p>
          <Badge 
            variant="outline" 
            className={`shrink-0 ${getConfidenceColor(gap.avg_confidence)}`}
          >
            {gap.avg_confidence.toFixed(1)} / 4
          </Badge>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <Badge 
            className="text-xs text-white"
            style={{ 
              backgroundColor: domainColor,
            }}
          >
            {gap.domain_name}
          </Badge>
          <span>{gap.staff_count} staff rated</span>
        </div>
      </div>
    );
  }

  function GapList({ items, roleName }: { items: SkillGap[], roleName?: string }) {
    if (items.length === 0) {
      return (
        <p className="text-sm text-muted-foreground text-center py-4">
          {roleName ? `No ${roleName} data at this location` : 'No skill data available'}
        </p>
      );
    }
    return (
      <div className="space-y-2">
        {items.map((gap) => (
          <SkillGapCard key={`${gap.action_id}-${gap.role_id}`} gap={gap} />
        ))}
      </div>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Priority Focus Areas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Priority Focus Areas</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Error loading skill gaps</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Priority Focus Areas</CardTitle>
            <p className="text-xs text-muted-foreground">
              Lowest confidence skills over {lookbackLabel}
            </p>
          </div>
          <ToggleGroup 
            type="single" 
            value={lookback} 
            onValueChange={(v) => v && setLookback(v as LookbackOption)}
            size="sm"
            className="gap-0"
          >
            <ToggleGroupItem value="3" className="text-xs px-2 h-7 rounded-r-none">
              3 wks
            </ToggleGroupItem>
            <ToggleGroupItem value="6" className="text-xs px-2 h-7 rounded-none border-x-0">
              6 wks
            </ToggleGroupItem>
            <ToggleGroupItem value="all" className="text-xs px-2 h-7 rounded-l-none">
              All
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="dfi">
          <TabsList className="w-full">
            <TabsTrigger value="dfi" className="flex-1">DFI</TabsTrigger>
            <TabsTrigger value="rda" className="flex-1">RDA</TabsTrigger>
            {hasOmGaps && (
              <TabsTrigger value="om" className="flex-1">OM</TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="dfi" className="mt-3">
            <GapList items={dfiGaps} roleName="DFI" />
          </TabsContent>
          <TabsContent value="rda" className="mt-3">
            <GapList items={rdaGaps} roleName="RDA" />
          </TabsContent>
          {hasOmGaps && (
            <TabsContent value="om" className="mt-3">
              <GapList items={omGaps} roleName="Office Manager" />
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}
