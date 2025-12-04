import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSim } from './SimProvider';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { addDays } from 'date-fns';
import { CT_TZ, getWeekAnchors } from '@/lib/centralTime';
import { X, Settings, User } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Helper function (same as in centralTime.ts)
function ctUtcForTz(dayRefUtc: Date, timeHHMMSS: string, tz: string): Date {
  const dayStr = formatInTimeZone(dayRefUtc, tz, 'yyyy-MM-dd');
  return fromZonedTime(`${dayStr}T${timeHHMMSS}`, tz);
}

interface SimConsoleProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SimConsole({ isOpen, onClose }: SimConsoleProps) {
  const { overrides, updateOverrides, resetSimulation } = useSim();
  const [customDateTime, setCustomDateTime] = useState('');
  const [staffSearch, setStaffSearch] = useState('');

  // Fetch staff list for masquerade dropdown
  const { data: staffList } = useQuery({
    queryKey: ['sim-staff-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff')
        .select('id, name, email, is_participant, is_coach, is_super_admin')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: overrides.enabled,
    staleTime: 5 * 60 * 1000,
  });

  // Filter staff by search
  const filteredStaff = useMemo(() => {
    if (!staffList) return [];
    if (!staffSearch) return staffList.slice(0, 20); // Show first 20 if no search
    const searchLower = staffSearch.toLowerCase();
    return staffList
      .filter(s => 
        s.name.toLowerCase().includes(searchLower) || 
        s.email.toLowerCase().includes(searchLower)
      )
      .slice(0, 20);
  }, [staffList, staffSearch]);

  // Get persona label for a staff member
  const getPersonaLabel = (s: { is_participant: boolean; is_coach: boolean; is_super_admin: boolean }) => {
    if (s.is_super_admin) return 'Super Admin';
    if (s.is_coach && !s.is_participant) return 'Coach';
    if (s.is_coach && s.is_participant) return 'Participant + Coach';
    return 'Participant';
  };

  // Get selected staff name
  const selectedStaff = useMemo(() => {
    if (!overrides.masqueradeStaffId || !staffList) return null;
    return staffList.find(s => s.id === overrides.masqueradeStaffId);
  }, [overrides.masqueradeStaffId, staffList]);

  // Generate presets for the current week in Central Time
  const presets = useMemo(() => {
    const { mondayZ } = getWeekAnchors(new Date(), CT_TZ);
    return [
      { 
        label: 'Mon 9am', 
        datetime: ctUtcForTz(mondayZ, '09:00:00', CT_TZ).toISOString() 
      },
      { 
        label: 'Tue 2pm', 
        datetime: ctUtcForTz(addDays(mondayZ, 1), '14:00:00', CT_TZ).toISOString() 
      },
      { 
        label: 'Thu 9am', 
        datetime: ctUtcForTz(addDays(mondayZ, 3), '09:00:00', CT_TZ).toISOString() 
      },
      { 
        label: 'Sun 9pm', 
        datetime: ctUtcForTz(addDays(mondayZ, 6), '21:00:00', CT_TZ).toISOString() 
      },
    ];
  }, []);

  // Current time display
  const currentTime = overrides.nowISO 
    ? formatInTimeZone(new Date(overrides.nowISO), CT_TZ, 'EEE MMM d, h:mm a zzz')
    : 'Real time';

  // Early return AFTER all hooks are called
  if (!isOpen) return null;

  // Event handlers
  const handlePresetClick = (datetime: string) => {
    updateOverrides({ nowISO: datetime });
  };

  const handleCustomDateTime = () => {
    if (customDateTime) {
      const date = new Date(customDateTime);
      updateOverrides({ nowISO: date.toISOString() });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Simulation Console
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable simulation */}
          <div className="flex items-center justify-between">
            <Label htmlFor="enable-sim">Enable Simulation</Label>
            <Switch
              id="enable-sim"
              checked={overrides.enabled}
              onCheckedChange={(enabled) => updateOverrides({ enabled })}
            />
          </div>

          {overrides.enabled && (
            <>
              {/* User Masquerade */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <User className="h-4 w-4" />
                  View As User
                </Label>
                {selectedStaff && (
                  <div className="flex items-center justify-between p-2 bg-muted rounded-md">
                    <div>
                      <div className="font-medium text-sm">{selectedStaff.name}</div>
                      <div className="text-xs text-muted-foreground">{getPersonaLabel(selectedStaff)}</div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => updateOverrides({ masqueradeStaffId: null })}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                <Input
                  placeholder="Search staff by name or email..."
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                  className="text-sm"
                />
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {filteredStaff.map(staff => (
                    <button
                      key={staff.id}
                      onClick={() => {
                        updateOverrides({ masqueradeStaffId: staff.id });
                        setStaffSearch('');
                      }}
                      className={`w-full text-left p-2 rounded-md text-sm hover:bg-muted transition-colors ${
                        overrides.masqueradeStaffId === staff.id ? 'bg-primary/10 border border-primary/30' : ''
                      }`}
                    >
                      <div className="font-medium">{staff.name}</div>
                      <div className="text-xs text-muted-foreground flex justify-between">
                        <span>{staff.email}</span>
                        <span>{getPersonaLabel(staff)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Time Travel */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Time Travel</Label>
                <div className="text-xs text-muted-foreground">Current: {currentTime}</div>
                
                <div className="grid grid-cols-2 gap-2">
                  {presets.map((preset) => (
                    <Button
                      key={preset.label}
                      variant="outline"
                      size="sm"
                      onClick={() => handlePresetClick(preset.datetime)}
                      className="text-xs"
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Input
                    type="datetime-local"
                    value={customDateTime}
                    onChange={(e) => setCustomDateTime(e.target.value)}
                    className="text-xs"
                  />
                  <Button size="sm" onClick={handleCustomDateTime}>Set</Button>
                </div>

                {overrides.nowISO && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateOverrides({ nowISO: undefined })}
                    className="w-full text-xs"
                  >
                    Reset to Real Time
                  </Button>
                )}
              </div>
            </>
          )}

          {/* Reset */}
          <div className="pt-4 border-t">
            <Button variant="outline" onClick={resetSimulation} className="w-full">
              Reset All Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function SimBanner() {
  const { overrides } = useSim();

  if (!overrides.enabled) return null;

  const currentTime = overrides.nowISO 
    ? formatInTimeZone(new Date(overrides.nowISO), CT_TZ, 'EEE MMM d, h:mm a zzz')
    : 'Real time';

  return (
    <div className="bg-warning text-warning-foreground p-2 rounded-md mt-4">
      <div className="text-center text-sm font-medium">
        <Badge variant="secondary" className="mr-2">SIMULATION ACTIVE</Badge>
        Time: {currentTime}
        {overrides.masqueradeStaffId && (
          <span className="mx-2">• Viewing as another user</span>
        )}
      </div>
    </div>
  );
}

interface SimFloatingButtonProps {
  isAdmin: boolean;
}

export function SimFloatingButton({ isAdmin }: SimFloatingButtonProps) {
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);

  // Only show if admin and dev tools enabled
  if (!isAdmin || import.meta.env.VITE_ENABLE_SIMTOOLS !== 'true') {
    return null;
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className="fixed bottom-4 right-4 z-30 shadow-lg"
        onClick={() => setIsConsoleOpen(true)}
      >
        <Settings className="h-4 w-4 mr-1" />
        Sim
      </Button>
      
      <SimConsole 
        isOpen={isConsoleOpen} 
        onClose={() => setIsConsoleOpen(false)} 
      />
    </>
  );
}
