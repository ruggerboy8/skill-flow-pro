import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import TeamWeeklyFocus from '@/components/doctor/TeamWeeklyFocus';
import TeamRoleExplorer from '@/components/doctor/TeamRoleExplorer';

export default function DoctorMyTeam() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">My Team</h1>

      <Tabs defaultValue="this-week">
        <TabsList className="w-full">
          <TabsTrigger value="this-week" className="flex-1">This Week</TabsTrigger>
          <TabsTrigger value="role-guides" className="flex-1">Role Guides</TabsTrigger>
        </TabsList>

        <TabsContent value="this-week">
          <TeamWeeklyFocus />
        </TabsContent>

        <TabsContent value="role-guides">
          <TeamRoleExplorer />
        </TabsContent>
      </Tabs>
    </div>
  );
}
