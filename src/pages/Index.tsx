import { useAuth } from '@/hooks/useAuth';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import ThisWeekPanel from '@/components/home/ThisWeekPanel';
import { RecentWinBanner } from '@/components/home/RecentWinBanner';
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

        <ThisWeekPanel />
        
        {/* Future space for notes, learning resources, etc. */}
      </div>
      
      <SimFloatingButton isAdmin={user?.email === 'johno@reallygoodconsulting.org' || user?.email === 'ryanjoberly@gmail.com'} />
    </div>
  );
}