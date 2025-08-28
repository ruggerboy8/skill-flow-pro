import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { useAuth, AuthProvider } from "@/hooks/useAuth";
import { useEffect } from "react";

// Page imports
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
import AdminPage from "@/pages/AdminPage";
import EvaluationViewer from "@/pages/EvaluationViewer";
import AdminBuilder from "@/pages/AdminBuilder";
import CycleList from "@/pages/admin/CycleList";
import WeekList from "@/pages/admin/WeekList";
import WeekEditor from "@/pages/admin/WeekEditor";
import NotFound from "@/pages/NotFound";

// Stats pages
import StatsLayout from "@/pages/StatsLayout";
import AtAGlance from "@/pages/stats/AtAGlance";
import StatsScores from "@/pages/StatsScores";
import StatsEvaluations from "@/pages/stats/StatsEvaluations";

function HashShim() {
  const location = useLocation();
  const navigate = useNavigate();
  
  useEffect(() => {
    // If the URL is like https://app/#/reset-password?email=...
    if (location.hash.startsWith("#/")) {
      const newPath = location.hash.slice(1); // "/reset-password?email=..."
      // Replace the URL without reloading, then let Router match it
      navigate(newPath, { replace: true });
    }
  // run only on first load for hash normalization
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  return null;
}

function AppRoutes() {
  const { user, loading, needsPasswordSetup, needsProfileSetup } = useAuth();
  const { pathname } = useLocation();

  // Always allow public routes to be reachable without session
  if (pathname === "/auth/callback") {
    return <AuthCallback />;
  }
  
  if (pathname === "/reset-password") {
    return <ResetPassword />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <Routes>
      <HashShim />
      {/* PUBLIC routes (must be reachable without a session) */}
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* PROTECTED area */}
      {user ? (
        needsPasswordSetup ? (
          <>
            <Route path="/" element={<SetupPassword />} />
            <Route path="*" element={<SetupPassword />} />
          </>
        ) : needsProfileSetup ? (
          <>
            <Route path="/" element={<Setup />} />
            <Route path="*" element={<Setup />} />
          </>
        ) : (
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
            <Route path="coach/:staffId/eval/:evalId" element={<EvaluationHub />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="evaluation/:evalId" element={<EvaluationViewer />} />
            <Route path="builder" element={<AdminBuilder />} />
            <Route path="builder/:roleId" element={<CycleList />} />
            <Route path="builder/:roleId/:cycle" element={<WeekList />} />
            <Route path="builder/:roleId/:cycle/week/:week" element={<WeekEditor />} />
            <Route path="admin/organizations" element={<Navigate to="/admin?tab=organizations" replace />} />
            <Route path="admin/locations" element={<Navigate to="/admin?tab=locations" replace />} />
            <Route path="admin/builder" element={<Navigate to="/builder" replace />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        )
      ) : (
        // No session: send everything else to Login
        <>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Login />} />
        </>
      )}
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
        <Toaster />
      </Router>
    </AuthProvider>
  );
}

export default App;