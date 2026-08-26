import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Compass, CalendarClock, LayoutGrid } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import TrainingWorkspace from './TrainingWorkspace';
import { MeetingsAndFocusTab } from './MeetingsAndFocusTab';
import { SchedulingTab } from './SchedulingTab';

// Tabbed home for the training director surface. Meetings and Focus +
// Scheduling are RDA-line machinery (Ariyana's lead cascade) — interim gate:
// super admins only, so directors without a lead tier (Lauren / DFI line)
// get just the Workspace. Revisit when the Functional Director archetype
// lands (Phase C D7).
export default function TrainingHome() {
  const { isSuperAdmin } = useUserRole();

  if (!isSuperAdmin) {
    return <TrainingWorkspace />;
  }

  return (
    <Tabs defaultValue="focus" className="space-y-6">
      <TabsList>
        <TabsTrigger value="focus" className="gap-1.5"><Compass className="h-4 w-4" />Meetings and Focus</TabsTrigger>
        <TabsTrigger value="scheduling" className="gap-1.5"><CalendarClock className="h-4 w-4" />Scheduling</TabsTrigger>
        <TabsTrigger value="workspace" className="gap-1.5"><LayoutGrid className="h-4 w-4" />Workspace</TabsTrigger>
      </TabsList>
      <TabsContent value="focus"><MeetingsAndFocusTab /></TabsContent>
      <TabsContent value="scheduling"><SchedulingTab /></TabsContent>
      <TabsContent value="workspace"><TrainingWorkspace /></TabsContent>
    </Tabs>
  );
}
