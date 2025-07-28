import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export default function StatsLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Extract the tab from the pathname
  const currentTab = location.pathname.split('/').pop() || 'scores';
  
  const handleTabChange = (value: string) => {
    navigate(`/stats/${value}`);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Your Stats</h1>
      
      <Tabs value={currentTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="scores">Scores</TabsTrigger>
          <TabsTrigger value="glance">At-a-Glance</TabsTrigger>
          <TabsTrigger value="eval">6-Week Eval</TabsTrigger>
        </TabsList>
        
        <TabsContent value={currentTab} className="mt-6">
          <Outlet />
        </TabsContent>
      </Tabs>
    </div>
  );
}