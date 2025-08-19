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
import { X, Settings } from 'lucide-react';

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

  // Generate presets for the current week in Central Time
  // This MUST be called before any conditional returns to avoid hook order issues
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

                {/* Quick scenario buttons */}
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      updateOverrides({ 
                        forceNewUser: true,
                        forceBackfillComplete: false,
                        forceBacklogCount: 0
                      });
                    }}
                    className="w-full text-xs"
                  >
                    Simulate New User
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Clear backfill localStorage
                      localStorage.removeItem('backfillProgress');
                      updateOverrides({ 
                        forceNewUser: false,
                        forceBackfillComplete: false
                      });
                    }}
                    className="w-full text-xs"
                  >
                    Clear Backfill Progress
                  </Button>
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
              </div>

              {/* Score Overrides */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Score Overrides</Label>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="force-confidence" className="text-sm">Force Has Confidence</Label>
                    <Select
                      value={overrides.forceHasConfidence === null ? 'auto' : String(overrides.forceHasConfidence)}
                      onValueChange={(value) => 
                        updateOverrides({ 
                          forceHasConfidence: value === 'auto' ? null : value === 'true' 
                        })
                      }
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="force-performance" className="text-sm">Force Has Performance</Label>
                    <Select
                      value={overrides.forceHasPerformance === null ? 'auto' : String(overrides.forceHasPerformance)}
                      onValueChange={(value) => 
                        updateOverrides({ 
                          forceHasPerformance: value === 'auto' ? null : value === 'true' 
                        })
                      }
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Backlog Override */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Backlog Override</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    placeholder="Auto"
                    value={overrides.forceBacklogCount ?? ''}
                    onChange={(e) => 
                      updateOverrides({ 
                        forceBacklogCount: e.target.value ? Number(e.target.value) : null 
                      })
                    }
                    className="w-20"
                  />
                  <Label className="text-sm text-muted-foreground">items</Label>
                </div>
              </div>

              {/* User State Overrides */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">User State</Label>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Force New User</Label>
                    <Select
                      value={overrides.forceNewUser === null ? 'auto' : String(overrides.forceNewUser)}
                      onValueChange={(value) => 
                        updateOverrides({ 
                          forceNewUser: value === 'auto' ? null : value === 'true' 
                        })
                      }
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Force Backfill Complete</Label>
                    <Select
                      value={overrides.forceBackfillComplete === null ? 'auto' : String(overrides.forceBackfillComplete)}
                      onValueChange={(value) => 
                        updateOverrides({ 
                          forceBackfillComplete: value === 'auto' ? null : value === 'true' 
                        })
                      }
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
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
    <div className="fixed top-0 left-0 right-0 bg-warning text-warning-foreground p-2 z-40">
      <div className="max-w-4xl mx-auto text-center text-sm font-medium">
        <Badge variant="secondary" className="mr-2">SIMULATION ACTIVE</Badge>
        Time: {currentTime}
        {overrides.forceHasConfidence !== null && (
          <span className="mx-2">• Confidence: {overrides.forceHasConfidence ? 'ON' : 'OFF'}</span>
        )}
        {overrides.forceHasPerformance !== null && (
          <span className="mx-2">• Performance: {overrides.forceHasPerformance ? 'ON' : 'OFF'}</span>
        )}
        {overrides.forceBacklogCount !== null && (
          <span className="mx-2">• Backlog: {overrides.forceBacklogCount}</span>
        )}
        {overrides.forceNewUser !== null && (
          <span className="mx-2">• New User: {overrides.forceNewUser ? 'ON' : 'OFF'}</span>
        )}
        {overrides.forceBackfillComplete !== null && (
          <span className="mx-2">• Backfill: {overrides.forceBackfillComplete ? 'DONE' : 'PENDING'}</span>
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
  // Note: isAdmin should be checked for specific email in parent component
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