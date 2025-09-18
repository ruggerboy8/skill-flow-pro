import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export default function StatsLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Extract the tab from the pathname
  const currentTab = location.pathname.split('/').pop() || 'glance';
  
  const handleTabChange = (value: string) => {
    navigate(`/stats/${value}`);
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold">Your Stats</h1>
      
      <Tabs value={currentTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="glance">At-a-Glance</TabsTrigger>
          <TabsTrigger value="scores">Weekly Scores</TabsTrigger>
          <TabsTrigger value="evaluations">Evaluations</TabsTrigger>
        </TabsList>
        
        <TabsContent value={currentTab} className="mt-6">
          <Outlet />
        </TabsContent>
      </Tabs>
    </div>
  );
}