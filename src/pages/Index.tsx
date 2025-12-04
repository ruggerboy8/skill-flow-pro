import { useAuth } from '@/hooks/useAuth';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import ThisWeekPanel from '@/components/home/ThisWeekPanel';
import { RecentWinBanner } from '@/components/home/RecentWinBanner';
import { ChristmasWelcome } from '@/components/home/ChristmasWelcome';
import { SimFloatingButton } from '@/devtools/SimConsole';

export default function Index() {
  const { user } = useAuth();
  const { data: staff } = useStaffProfile();

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">ProMoves Progress</h1>
        </div>

        <RecentWinBanner />

        <ChristmasWelcome />

        <ThisWeekPanel />
        
        {/* Deadline disclaimer */}
        <div className="mt-4 rounded-lg border border-border bg-muted/50 p-4 text-center">
          <p className="text-sm text-muted-foreground">
            ProMove scores are due on the same day as your Check In/Out meeting.
          </p>
          <p className="text-xs text-muted-foreground/80 mt-1">
            Scores submitted any other time are marked late.
          </p>
        </div>
      </div>
      
      <SimFloatingButton isAdmin={user?.email === 'johno@reallygoodconsulting.org' || user?.email === 'ryanjoberly@gmail.com'} />
    </div>
  );
}