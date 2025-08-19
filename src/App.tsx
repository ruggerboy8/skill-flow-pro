import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { SimProvider } from "@/devtools/SimProvider";
import { NowProvider } from "@/providers/NowProvider";
import { SimBanner } from "@/devtools/SimConsole";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import Setup from "./pages/Setup";
import SetupPassword from "./pages/SetupPassword";
import Welcome from "./pages/Welcome";
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
import CoachDashboard from "./pages/coach/CoachDashboard";
import CoachDetail from "./pages/coach/CoachDetail";
import RoleList from "./pages/admin/RoleList";
import CycleList from "./pages/admin/CycleList";
import WeekList from "./pages/admin/WeekList";
import WeekEditor from "./pages/admin/WeekEditor";
import NotFound from "./pages/NotFound";
import BackfillIntro from "./pages/backfill/BackfillIntro";
import BackfillWeek from "./pages/backfill/BackfillWeek";
import BackfillReview from "./pages/backfill/BackfillReview";
import { useSim } from "@/devtools/SimProvider";
import { detectBackfillStatus } from "@/lib/backfillDetection";
import { useState, useEffect } from "react";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading, needsPasswordSetup } = useAuth();
  const { overrides } = useSim();
  const [backfillStatus, setBackfillStatus] = useState<{needsBackfill: boolean; isComplete: boolean; checked: boolean}>({
    needsBackfill: false,
    isComplete: false,
    checked: false
  });

  // Check backfill status when user loads
  useEffect(() => {
    if (user && !loading && !needsPasswordSetup) {
      detectBackfillStatus(user.id, overrides).then(status => {
        setBackfillStatus({
          needsBackfill: status.needsBackfill,
          isComplete: status.isComplete,
          checked: true
        });
      });
    }
  }, [user, loading, needsPasswordSetup, overrides]);

  if (loading || !backfillStatus.checked) {
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

  // If user needs backfill and it's not complete, redirect to backfill
  if (backfillStatus.needsBackfill && !backfillStatus.isComplete) {
    // Allow access to backfill routes and logout
    const currentPath = window.location.pathname;
    if (!currentPath.startsWith('/backfill') && currentPath !== '/profile') {
      return (
        <Routes>
          <Route path="/backfill" element={<BackfillIntro />} />
          <Route path="/backfill/:week" element={<BackfillWeek />} />
          <Route path="/backfill/review" element={<BackfillReview />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/backfill" replace />} />
        </Routes>
      );
    }
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Index />} />
        <Route path="welcome" element={<Welcome />} />
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
        <Route path="week/:weekId" element={<Week />} />
        <Route path="week-info/:cycle/:week" element={<WeekInfo />} />
        <Route path="confidence/:week" element={<Confidence />} />
        <Route path="confidence/:week/step/:n" element={<ConfidenceWizard />} />
        <Route path="performance/:week" element={<Performance />} />
        <Route path="performance/:week/step/:n" element={<PerformanceWizard />} />
        <Route path="review/:cycle/:week" element={<Review />} />
        <Route path="backfill" element={<BackfillIntro />} />
        <Route path="backfill/:week" element={<BackfillWeek />} />
        <Route path="backfill/review" element={<BackfillReview />} />
        <Route path="coach" element={<CoachDashboard />} />
        <Route path="coach/:staffId" element={<CoachDetail />} />
        <Route path="builder" element={<RoleList />} />
        <Route path="builder/:roleId" element={<CycleList />} />
        <Route path="builder/:roleId/:cycle" element={<WeekList />} />
        <Route path="builder/:roleId/:cycle/week/:week" element={<WeekEditor />} />
        <Route path="admin/builder" element={<Navigate to="/builder" replace />} />
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
        <SimProvider>
          {({ simulatedTime }) => (
            <NowProvider simulatedTime={simulatedTime}>
              <BrowserRouter>
                <SimBanner />
                <AppRoutes />
              </BrowserRouter>
            </NowProvider>
          )}
        </SimProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;