// src/App.tsx
import { BrowserRouter, Routes, Route, Outlet, Navigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { BatchProcessorProvider } from "@/contexts/BatchProcessorContext";

// Pages (same imports you already have)
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import ResetPassword from "@/pages/ResetPassword";
import SetupPassword from "@/pages/SetupPassword";
import ForgotPassword from "@/pages/ForgotPassword";
import Layout from "@/components/Layout";
import Index from "@/pages/Index";
import Welcome from "@/pages/Welcome";
import Profile from "@/pages/Profile";

import Confidence from "@/pages/Confidence";
import ConfidenceWizard from "@/pages/ConfidenceWizard";
import Performance from "@/pages/Performance";
import PerformanceWizard from "@/pages/PerformanceWizard";
import Review from "@/pages/Review";

// Coach Pages
import CoachLayoutV2 from "@/pages/coach/CoachLayoutV2";
import CoachDashboardV2 from "@/pages/coach/CoachDashboardV2";
import StaffDetailV2 from "@/pages/coach/StaffDetailV2";
import { EvaluationHub } from "@/pages/coach/EvaluationHub";
import AdminPage from "@/pages/AdminPage";
import EvalResultsV2 from "@/pages/admin/EvalResultsV2";
import EvaluationViewer from "@/pages/EvaluationViewer";
import AdminBuilder from "@/pages/AdminBuilder";
import CycleList from "@/pages/admin/CycleList";
import WeekList from "@/pages/admin/WeekList";
import WeekEditor from "@/pages/admin/WeekEditor";
import PlannerPage from "@/pages/planner/PlannerPage";
import NotFound from "@/pages/NotFound";
import StatsEvaluations from "@/pages/stats/StatsEvaluations";
import LocationDetail from "@/pages/dashboard/LocationDetail";
import RegionalDashboard from "@/pages/dashboard/RegionalDashboard";
import MyLocationPage from "@/pages/my-location/MyLocationPage";

// My Role pages
import MyRoleLayout from "@/pages/my-role/MyRoleLayout";
import RoleRadar from "@/components/my-role/RoleRadar";
import PracticeLog from "@/pages/my-role/PracticeLog";
import DomainDetail from "@/pages/my-role/DomainDetail";

// Clinical Director pages
import ClinicalLayout from "@/pages/clinical/ClinicalLayout";
import ClinicalHome from "@/pages/clinical/ClinicalHome";
import DoctorManagement from "@/pages/clinical/DoctorManagement";
import DoctorDetail from "@/pages/clinical/DoctorDetail";

// Doctor pages
import DoctorLayout from "@/pages/doctor/DoctorLayout";
import DoctorHome from "@/pages/doctor/DoctorHome";
import BaselineWizard from "@/pages/doctor/BaselineWizard";

// App routes with pre-routing checks for public pages
function AppRoutes() {
  const { user, loading, needsPasswordSetup } = useAuth();
  const { pathname } = useLocation();

  // Public routes for auth flows (must run BEFORE auth gating)
  if (pathname.startsWith("/auth/callback")) return <AuthCallback />;
  if (pathname.startsWith("/reset-password")) return <ResetPassword />;
  if (pathname.startsWith("/forgot-password")) return <ForgotPassword />;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!user) return <Login />;
  if (needsPasswordSetup) return <SetupPassword />;

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Index />} />
        <Route path="welcome" element={<Welcome />} />
        <Route path="setup-password" element={<SetupPassword />} />


        {/* My Role - new professional guidebook */}
        <Route path="my-role" element={<MyRoleLayout />}>
          <Route index element={<RoleRadar />} />
          <Route path="overview" element={<RoleRadar />} />
          <Route path="practice-log" element={<PracticeLog />} />
          <Route path="evaluations" element={<StatsEvaluations />} />
          {/* Legacy redirects for old tab routes */}
          <Route path="focus" element={<PracticeLog />} />
          <Route path="history" element={<PracticeLog />} />
        </Route>
        
        {/* My Role - Domain Detail (Full Page Takeover - No Tabs) */}
        <Route path="my-role/domain/:domainSlug" element={<DomainDetail />} />

        <Route path="profile" element={<Profile />} />
        <Route path="reset-password" element={<ResetPassword />} />
        
        {/* Redirect legacy pages to wizard versions */}
        <Route path="confidence/:week" element={<Navigate to="/confidence/:week/step/1" replace />} />
        <Route path="confidence/:week/step/:n" element={<ConfidenceWizard />} />
        <Route path="performance/:week" element={<Navigate to="/performance/:week/step/1" replace />} />
        <Route path="performance/:week/step/:n" element={<PerformanceWizard />} />
        <Route path="review/:cycle/:week" element={<Review />} />

        {/* Coach Routes */}
        <Route path="coach" element={<CoachLayoutV2 />}>
          <Route index element={<CoachDashboardV2 />} />
          <Route path=":staffId" element={<StaffDetailV2 />} />
          <Route path=":staffId/eval/:evalId" element={<EvaluationHub />} />
        </Route>

        {/* Dashboard Routes */}
        <Route path="dashboard" element={<RegionalDashboard />} />
        <Route path="dashboard/location/:locationId" element={<LocationDetail />} />
        <Route path="my-location" element={<MyLocationPage />} />

        {/* Clinical Director Routes */}
        <Route path="clinical" element={<ClinicalLayout />}>
          <Route index element={<ClinicalHome />} />
          <Route path="doctors" element={<DoctorManagement />} />
          <Route path="doctors/:staffId" element={<DoctorDetail />} />
        </Route>

        {/* Doctor Routes */}
        <Route path="doctor" element={<DoctorLayout />}>
          <Route index element={<DoctorHome />} />
          <Route path="baseline" element={<BaselineWizard />} />
        </Route>

        <Route path="admin" element={<AdminPage />} />
        <Route path="admin/evaluations" element={<EvalResultsV2 />} />
        {/* Legacy redirects for old eval results paths */}
        <Route path="admin/eval-results" element={<Navigate to="/admin/evaluations" replace />} />
        <Route path="admin/eval-results-v2" element={<Navigate to="/admin/evaluations" replace />} />
        <Route path="evaluation/:evalId" element={<EvaluationViewer />} />
        <Route path="builder" element={<AdminBuilder />} />
        <Route path="builder/:roleId" element={<CycleList />} />
        <Route path="builder/:roleId/:cycle" element={<WeekList />} />
        <Route path="builder/:roleId/:cycle/week/:week" element={<WeekEditor />} />
        
        <Route path="planner/dfi" element={<PlannerPage roleId={1} roleName="DFI" />} />
        <Route path="planner/rda" element={<PlannerPage roleId={2} roleName="RDA" />} />
        <Route path="planner/om" element={<PlannerPage roleId={3} roleName="Office Manager" />} />

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
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BatchProcessorProvider>
          <BrowserRouter>
            <RouteErrorBoundary>
              <AppRoutes />
            </RouteErrorBoundary>
            <Toaster />
          </BrowserRouter>
        </BatchProcessorProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
