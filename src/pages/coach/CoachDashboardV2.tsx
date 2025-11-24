import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useStaffWeeklyScores } from '@/hooks/useStaffWeeklyScores';
import { useAuth } from '@/hooks/useAuth';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { Loader2, RefreshCw, CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addWeeks, startOfWeek } from 'date-fns';
import { cn } from '@/lib/utils';

export default function CoachDashboardV2() {
  const { user } = useAuth();
  const profileQuery = useStaffProfile({ redirectToSetup: false });
  const [selectedWeek, setSelectedWeek] = useState<Date | undefined>(undefined);
  
  // Format as YYYY-MM-DD for the RPC (only if a week is selected)
  const weekOfString = selectedWeek ? format(startOfWeek(selectedWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd') : null;
  
  const { data, loading, error, reload } = useStaffWeeklyScores({ weekOf: weekOfString });

  const handlePreviousWeek = () => {
    setSelectedWeek(prev => {
      const base = prev || new Date();
      return addWeeks(startOfWeek(base, { weekStartsOn: 1 }), -1);
    });
  };

  const handleNextWeek = () => {
    setSelectedWeek(prev => {
      const base = prev || new Date();
      return addWeeks(startOfWeek(base, { weekStartsOn: 1 }), 1);
    });
  };

  const displayWeek = selectedWeek 
    ? format(startOfWeek(selectedWeek, { weekStartsOn: 1 }), 'MMM d, yyyy')
    : 'Most Recent Week';

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">Error loading staff data: {error.message}</p>
        <Button onClick={reload} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Coach Dashboard V2</h1>
          <p className="text-muted-foreground">Phase 1: Raw data verification</p>
        </div>
        <Button onClick={reload} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Reload Data
        </Button>
      </div>

      <div className="flex items-center gap-2 p-4 bg-muted/50 rounded-lg">
        <Button 
          variant="outline" 
          size="sm"
          onClick={handlePreviousWeek}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "justify-start text-left font-normal min-w-[200px]",
                !selectedWeek && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {displayWeek}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedWeek}
              onSelect={(date) => {
                if (date) {
                  setSelectedWeek(startOfWeek(date, { weekStartsOn: 1 }));
                }
              }}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>

        <Button 
          variant="outline" 
          size="sm"
          onClick={handleNextWeek}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        {selectedWeek && (
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setSelectedWeek(undefined)}
          >
            Reset to Latest
          </Button>
        )}
      </div>

      <div className="space-y-2 p-4 bg-muted/50 rounded-lg text-sm">
        <div className="font-semibold">Debug Info:</div>
        <div className="grid grid-cols-2 gap-2 text-muted-foreground">
          <div>Your scope type:</div>
          <div className="font-mono">{profileQuery.data?.coach_scope_type || 'null (super admin?)'}</div>
          <div>Your scope ID:</div>
          <div className="font-mono text-xs">{profileQuery.data?.coach_scope_id || 'null'}</div>
          <div>Is super admin:</div>
          <div>{profileQuery.data?.is_super_admin ? 'Yes' : 'No'}</div>
          <div>Staff members visible:</div>
          <div className="font-semibold">{data.length}</div>
        </div>
      </div>

      <Accordion type="single" collapsible className="space-y-2">
        {data.map((item) => (
          <AccordionItem key={item.staff.id} value={item.staff.id} className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex flex-col items-start gap-1 text-left">
                <div className="font-semibold">{item.staff.name}</div>
                <div className="text-sm text-muted-foreground">
                  {item.staff.role_name} • {item.staff.location_name} • {item.staff.organization_name}
                  <span className="ml-2">({item.scores.length} scores)</span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              {item.scores.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No scores recorded yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Week of</TableHead>
                      <TableHead>Pro Move / Domain</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Performance</TableHead>
                      <TableHead>Flags</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {item.scores.map((score) => (
                      <TableRow key={score.score_id}>
                        <TableCell className="font-mono text-sm">
                          {score.week_of || 'N/A'}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="text-sm">{score.action_statement}</div>
                            {score.domain_name && (
                              <div className="text-xs text-muted-foreground">{score.domain_name}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {score.confidence_score !== null && (
                              <div className="font-semibold">{score.confidence_score}</div>
                            )}
                            {score.confidence_date && (
                              <div className="text-xs text-muted-foreground">
                                {format(new Date(score.confidence_date), 'MMM d, h:mm a')}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {score.performance_score !== null && (
                              <div className="font-semibold">{score.performance_score}</div>
                            )}
                            {score.performance_date && (
                              <div className="text-xs text-muted-foreground">
                                {format(new Date(score.performance_date), 'MMM d, h:mm a')}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 text-xs">
                            {score.confidence_late && (
                              <span className="text-orange-600">Conf Late</span>
                            )}
                            {score.performance_late && (
                              <span className="text-orange-600">Perf Late</span>
                            )}
                            {score.self_select && (
                              <span className="text-blue-600">Self-Select</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <div>C: {score.confidence_source}</div>
                          <div>P: {score.performance_source}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
