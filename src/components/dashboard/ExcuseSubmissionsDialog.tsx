import { useState, useMemo } from 'react';
import { addDays } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useLocationExcuses } from '@/hooks/useLocationExcuses';
import { CT_TZ } from '@/lib/centralTime';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Check, Minus, Loader2 } from 'lucide-react';

interface ExcuseSubmissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialWeekOf: string;
}

export function ExcuseSubmissionsDialog({
  open,
  onOpenChange,
  initialWeekOf,
}: ExcuseSubmissionsDialogProps) {
  const { managedOrgIds, isSuperAdmin } = useUserRole();
  
  // State
  const [weekMonday, setWeekMonday] = useState(() => new Date(initialWeekOf + 'T00:00:00'));
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [locationSearch, setLocationSearch] = useState('');
  const [excuseConfidence, setExcuseConfidence] = useState(true);
  const [excusePerformance, setExcusePerformance] = useState(true);
  const [reason, setReason] = useState('Weather closure');
  
  // Computed week string
  const weekOf = useMemo(() => 
    formatInTimeZone(weekMonday, CT_TZ, 'yyyy-MM-dd'), 
    [weekMonday]
  );
  
  // Week navigation
  const goToPrevWeek = () => setWeekMonday(prev => addDays(prev, -7));
  const goToNextWeek = () => setWeekMonday(prev => addDays(prev, 7));
  
  // Fetch locations the user can manage
  const { data: locations = [], isLoading: locationsLoading } = useQuery({
    queryKey: ['managed-locations', managedOrgIds, isSuperAdmin],
    queryFn: async () => {
      let query = supabase
        .from('locations')
        .select('id, name, organization_id')
        .eq('active', true)
        .order('name');
      
      if (!isSuperAdmin && managedOrgIds.length > 0) {
        query = query.in('organization_id', managedOrgIds);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });
  
  const filteredLocations = useMemo(() => {
    const q = locationSearch.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter((l) => l.name?.toLowerCase().includes(q));
  }, [locations, locationSearch]);

  const setLocationChecked = (locationId: string, checked: boolean) => {
    setSelectedLocationIds((prev) => {
      if (checked) {
        return prev.includes(locationId) ? prev : [...prev, locationId];
      }
      return prev.filter((id) => id !== locationId);
    });
  };
  
  // Fetch excuses for the selected week
  const { 
    excuses, 
    isLoading: excusesLoading,
    bulkExcuseLocations,
    isBulkExcusing,
  } = useLocationExcuses(weekOf);
  
  // Build status map for selected locations
  const statusMap = useMemo(() => {
    const map = new Map<string, { conf: boolean; perf: boolean; confReason: string | null; perfReason: string | null }>();
    
    locations.forEach(loc => {
      const locExcuses = excuses.filter(e => e.location_id === loc.id);
      const confExcuse = locExcuses.find(e => e.metric === 'confidence');
      const perfExcuse = locExcuses.find(e => e.metric === 'performance');
      
      map.set(loc.id, {
        conf: !!confExcuse,
        perf: !!perfExcuse,
        confReason: confExcuse?.reason ?? null,
        perfReason: perfExcuse?.reason ?? null,
      });
    });
    
    return map;
  }, [locations, excuses]);
  
  // Handle submit
  const handleSubmit = async () => {
    if (selectedLocationIds.length === 0) return;
    if (!excuseConfidence && !excusePerformance) return;
    
    const metrics: ('confidence' | 'performance')[] = [];
    if (excuseConfidence) metrics.push('confidence');
    if (excusePerformance) metrics.push('performance');
    
    bulkExcuseLocations({
      locationIds: selectedLocationIds,
      weekOf,
      metrics,
      reason: reason.trim() || undefined,
    }, {
      onSuccess: () => {
        onOpenChange(false);
        // Reset state for next open
        setSelectedLocationIds([]);
      },
    });
  };
  
  // Reset state when dialog opens with new initial week
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setWeekMonday(new Date(initialWeekOf + 'T00:00:00'));
      setSelectedLocationIds([]);
      setLocationSearch('');
      setExcuseConfidence(true);
      setExcusePerformance(true);
      setReason('Weather closure');
    }
    onOpenChange(newOpen);
  };
  
  const canSubmit = selectedLocationIds.length > 0 && (excuseConfidence || excusePerformance);
  
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Excuse ProMoves</DialogTitle>
          <DialogDescription>
            Excuse locations from confidence and/or performance submissions for a specific week.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Week Navigation */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Week</Label>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={goToPrevWeek}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex-1 text-center font-medium">
                Week of {formatInTimeZone(weekMonday, CT_TZ, 'MMM d, yyyy')}
              </div>
              <Button variant="outline" size="icon" onClick={goToNextWeek}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Location Multi-Select */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-medium">Locations</Label>
              <span className="text-xs text-muted-foreground">
                {selectedLocationIds.length} selected
              </span>
            </div>
            {locationsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading locations...
              </div>
            ) : (
              <>
                <Input
                  value={locationSearch}
                  onChange={(e) => setLocationSearch(e.target.value)}
                  placeholder="Search locations..."
                />
                <div className="border rounded-md max-h-60 overflow-y-auto overscroll-contain divide-y">
                  {filteredLocations.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">No locations found.</div>
                  ) : (
                    filteredLocations.map((loc) => {
                      const checked = selectedLocationIds.includes(loc.id);
                      const checkboxId = `loc-${loc.id}`;

                      return (
                        <div
                          key={loc.id}
                          className="flex items-center gap-2 p-2 hover:bg-accent/50"
                        >
                          <Checkbox
                            id={checkboxId}
                            checked={checked}
                            onCheckedChange={(v) => setLocationChecked(loc.id, v === true)}
                          />
                          <Label
                            htmlFor={checkboxId}
                            className="font-normal cursor-pointer flex-1 min-w-0"
                          >
                            <span className="block truncate">{loc.name}</span>
                          </Label>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
          
          {/* Metrics Checkboxes */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Metrics to Excuse</Label>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="excuse-confidence" 
                  checked={excuseConfidence}
                  onCheckedChange={(checked) => setExcuseConfidence(checked === true)}
                />
                <Label htmlFor="excuse-confidence" className="font-normal cursor-pointer">
                  Confidence
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="excuse-performance" 
                  checked={excusePerformance}
                  onCheckedChange={(checked) => setExcusePerformance(checked === true)}
                />
                <Label htmlFor="excuse-performance" className="font-normal cursor-pointer">
                  Performance
                </Label>
              </div>
            </div>
          </div>
          
          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason" className="text-sm font-medium">
              Reason <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="reason"
              placeholder="e.g., Weather closure - ice storm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="resize-none"
              rows={2}
            />
          </div>
          
          {/* Current Status */}
          {selectedLocationIds.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Current Status for Selected Week</Label>
              <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                {excusesLoading ? (
                  <div className="p-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading status...
                  </div>
                ) : (
                  selectedLocationIds.map(locId => {
                    const loc = locations.find(l => l.id === locId);
                    const status = statusMap.get(locId);
                    if (!loc || !status) return null;
                    
                    return (
                      <div key={locId} className="p-2 flex items-center justify-between text-sm">
                        <span className="font-medium truncate flex-1">{loc.name}</span>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={status.conf ? "secondary" : "outline"} 
                            className="gap-1 text-xs"
                          >
                            {status.conf ? (
                              <Check className="h-3 w-3 text-primary" />
                            ) : (
                              <Minus className="h-3 w-3 text-muted-foreground" />
                            )}
                            Conf
                          </Badge>
                          <Badge 
                            variant={status.perf ? "secondary" : "outline"} 
                            className="gap-1 text-xs"
                          >
                            {status.perf ? (
                              <Check className="h-3 w-3 text-primary" />
                            ) : (
                              <Minus className="h-3 w-3 text-muted-foreground" />
                            )}
                            Perf
                          </Badge>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Already-excused metrics will be skipped.
              </p>
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!canSubmit || isBulkExcusing}
          >
            {isBulkExcusing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Apply Excuses
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
