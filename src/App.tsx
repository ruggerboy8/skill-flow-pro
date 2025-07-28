import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import Setup from "./pages/Setup";
import SetupPassword from "./pages/SetupPassword";
import Index from "./pages/Index";
import Week from "./pages/Week";
import WeekInfo from "./pages/WeekInfo";
import Confidence from "./pages/Confidence";
import ConfidenceWizard from "./pages/ConfidenceWizard";
import Performance from "./pages/Performance";
import PerformanceWizard from "./pages/PerformanceWizard";
import Review from "./pages/Review";
import Stats from "./pages/Stats";
import StatsLayout from "./pages/StatsLayout";
import StatsScores from "./pages/StatsScores";
import StatsGlance from "./pages/StatsGlance";
import StatsEval from "./pages/StatsEval";
import Profile from "./pages/Profile";
import RoleList from "./pages/admin/RoleList";
import CycleList from "./pages/admin/CycleList";
import WeekList from "./pages/admin/WeekList";
import WeekEditor from "./pages/admin/WeekEditor";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading, needsPasswordSetup } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  // If user needs to set up a password, show password setup page
  if (needsPasswordSetup) {
    return <SetupPassword />;
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Index />} />
        <Route path="setup" element={<Setup />} />
        <Route path="create-password" element={<SetupPassword />} />
        <Route path="setup-password" element={<SetupPassword />} />
        <Route path="stats" element={<StatsLayout />}>
          <Route index element={<StatsScores />} />
          <Route path="scores" element={<StatsScores />} />
          <Route path="glance" element={<StatsGlance />} />
          <Route path="eval" element={<StatsEval />} />
        </Route>
        <Route path="profile" element={<Profile />} />
        <Route path="week" element={<Week />} />
        <Route path="week-info/:cycle/:week" element={<WeekInfo />} />
        <Route path="confidence/:week" element={<Confidence />} />
        <Route path="confidence/:focusId/:index" element={<ConfidenceWizard />} />
        <Route path="performance/:week" element={<Performance />} />
        <Route path="performance/:focusId/:index" element={<PerformanceWizard />} />
        <Route path="review/:cycle/:week" element={<Review />} />
        <Route path="builder" element={<RoleList />} />
        <Route path="builder/:roleId" element={<CycleList />} />
        <Route path="builder/:roleId/:cycle" element={<WeekList />} />
        <Route path="builder/:roleId/:cycle/week/:week" element={<WeekEditor />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;