import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Compass, CalendarClock, LayoutGrid } from 'lucide-react';
import TrainingWorkspace from './TrainingWorkspace';
import { LeadFocusTab } from './LeadFocusTab';
import { SchedulingTab } from './SchedulingTab';

// Tabbed home for the training director surface: the new Lead focus + Scheduling
// tabs alongside the Slice-1 issues Workspace.
export default function TrainingHome() {
  return (
    <Tabs defaultValue="focus" className="space-y-6">
      <TabsList>
        <TabsTrigger value="focus" className="gap-1.5"><Compass className="h-4 w-4" />Lead focus</TabsTrigger>
        <TabsTrigger value="scheduling" className="gap-1.5"><CalendarClock className="h-4 w-4" />Scheduling</TabsTrigger>
        <TabsTrigger value="workspace" className="gap-1.5"><LayoutGrid className="h-4 w-4" />Workspace</TabsTrigger>
      </TabsList>
      <TabsContent value="focus"><LeadFocusTab /></TabsContent>
      <TabsContent value="scheduling"><SchedulingTab /></TabsContent>
      <TabsContent value="workspace"><TrainingWorkspace /></TabsContent>
    </Tabs>
  );
}
