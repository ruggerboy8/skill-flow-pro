import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export default function CoachLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Extract the tab from the pathname
  const currentTab = location.pathname.startsWith('/coach/promoves') ? 'promoves' : 'staff';
  
  const handleTabChange = (value: string) => {
    if (value === 'staff') {
      navigate('/coach');
    } else {
      navigate(`/coach/${value}`);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold">Coach Dashboard</h1>
      
      <Tabs value={currentTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="staff">All Staff</TabsTrigger>
          <TabsTrigger value="promoves">ProMoves</TabsTrigger>
        </TabsList>
        
        <TabsContent value={currentTab} className="mt-6">
          <Outlet />
        </TabsContent>
      </Tabs>
    </div>
  );
}
