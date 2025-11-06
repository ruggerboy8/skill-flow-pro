// src/App.tsx
import { BrowserRouter, Routes, Route, Outlet, Navigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/hooks/useAuth";

// Pages (same imports you already have)
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import ResetPassword from "@/pages/ResetPassword";
import SetupPassword from "@/pages/SetupPassword";
import Setup from "@/pages/Setup";
import Layout from "@/components/Layout";
import Index from "@/pages/Index";
import Welcome from "@/pages/Welcome";
import Profile from "@/pages/Profile";
import Week from "@/pages/Week";
import WeekInfo from "@/pages/WeekInfo";
import Confidence from "@/pages/Confidence";
import ConfidenceWizard from "@/pages/ConfidenceWizard";
import Performance from "@/pages/Performance";
import PerformanceWizard from "@/pages/PerformanceWizard";
import Review from "@/pages/Review";
import BackfillIntro from "@/pages/backfill/BackfillIntro";
import BackfillWeek from "@/pages/backfill/BackfillWeek";
import BackfillReview from "@/pages/backfill/BackfillReview";
import CoachDashboard from "@/pages/coach/CoachDashboard";
import CoachDetail from "@/pages/coach/CoachDetail";
import { EvaluationHub } from "@/pages/coach/EvaluationHub";
import CoachLayout from "@/pages/coach/CoachLayout";
import RemindersTab from "@/pages/coach/RemindersTab";
import AdminPage from "@/pages/AdminPage";
import EvalResults from "@/pages/admin/EvalResults";
import EvaluationViewer from "@/pages/EvaluationViewer";
import AdminBuilder from "@/pages/AdminBuilder";
import CycleList from "@/pages/admin/CycleList";
import WeekList from "@/pages/admin/WeekList";
import WeekEditor from "@/pages/admin/WeekEditor";
import PlannerPage from "@/pages/planner/PlannerPage";
import NotFound from "@/pages/NotFound";
import StatsLayout from "@/pages/StatsLayout";
import AtAGlance from "@/pages/stats/AtAGlance";
import StatsScores from "@/pages/StatsScores";
import StatsEvaluations from "@/pages/stats/StatsEvaluations";

// App routes with pre-routing checks for public pages
function AppRoutes() {
  const { user, loading, needsPasswordSetup, needsProfileSetup } = useAuth();
  const { pathname } = useLocation();

  // Debug logging
  console.log("AppRoutes - Current pathname:", pathname);
  console.log("AppRoutes - Checking reset-password:", pathname.startsWith("/reset-password"));

  // Public routes for auth flows (must run BEFORE auth gating)
  if (pathname.startsWith("/auth/callback")) return <AuthCallback />;
  if (pathname.startsWith("/reset-password")) {
    console.log("AppRoutes - Returning ResetPassword component");
    return <ResetPassword />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!user) return <Login />;
  if (needsPasswordSetup) return <SetupPassword />;
  if (needsProfileSetup) return <Setup />;

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Index />} />
        <Route path="welcome" element={<Welcome />} />
        <Route path="setup" element={<Setup />} />
        <Route path="create-password" element={<SetupPassword />} />
        <Route path="setup-password" element={<SetupPassword />} />

        <Route path="stats" element={<StatsLayout />}>
          <Route index element={<AtAGlance />} />
          <Route path="glance" element={<AtAGlance />} />
          <Route path="scores" element={<StatsScores />} />
          <Route path="evaluations" element={<StatsEvaluations />} />
        </Route>

        <Route path="profile" element={<Profile />} />
        <Route path="reset-password" element={<ResetPassword />} />
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

        <Route path="coach" element={<CoachLayout />}>
          <Route index element={<CoachDashboard />} />
          <Route path="reminders" element={<RemindersTab />} />
        </Route>
        <Route path="coach/:staffId" element={<CoachDetail />} />
        <Route path="coach/:staffId/eval/:evalId" element={<EvaluationHub />} />

        <Route path="admin" element={<AdminPage />} />
        <Route path="admin/eval-results" element={<EvalResults />} />
        <Route path="evaluation/:evalId" element={<EvaluationViewer />} />
        <Route path="builder" element={<AdminBuilder />} />
        <Route path="builder/:roleId" element={<CycleList />} />
        <Route path="builder/:roleId/:cycle" element={<WeekList />} />
        <Route path="builder/:roleId/:cycle/week/:week" element={<WeekEditor />} />
        
        <Route path="planner/dfi" element={<PlannerPage roleId={1} roleName="DFI" />} />
        <Route path="planner/rda" element={<PlannerPage roleId={2} roleName="RDA" />} />

        {/* legacy redirects */}
        <Route path="admin/organizations" element={<Navigate to="/admin?tab=organizations" replace />} />
        <Route path="admin/locations" element={<Navigate to="/admin?tab=locations" replace />} />
        <Route path="admin/builder" element={<Navigate to="/builder" replace />} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

// Create a client instance for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

export default function App() {
  console.log("App component rendering");
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}