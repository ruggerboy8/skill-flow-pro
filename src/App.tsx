// src/App.tsx
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Outlet, Navigate, useLocation, useParams } from "react-router-dom";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { PwaManager } from "@/components/pwa/PwaManager";
import { BatchProcessorProvider } from "@/contexts/BatchProcessorContext";
import { SimProvider } from "@/devtools/SimProvider";
import { RouteLoadingFallback } from "@/components/RouteLoadingFallback";

// Pages (same imports you already have)
import Login from "@/pages/Login";
import LandingPage from "@/pages/LandingPage";
import AuthCallback from "@/pages/AuthCallback";
import ResetPassword from "@/pages/ResetPassword";
import SetupPassword from "@/pages/SetupPassword";
import ForgotPassword from "@/pages/ForgotPassword";
import Layout from "@/components/Layout";
import Index from "@/pages/Index";
import Welcome from "@/pages/Welcome";
import Profile from "@/pages/Profile";
import MorePage from "@/pages/mobile/MorePage";
import PerformancePage from "@/pages/performance/PerformancePage";
import TeamPage from "@/pages/team/TeamPage";
import TeamStaffPage from "@/pages/team/TeamStaffPage";

import ConfidenceWizard from "@/pages/ConfidenceWizard";
import PerformanceWizard from "@/pages/PerformanceWizard";
import NotFound from "@/pages/NotFound";
import { RequireAccess, allowCoachSurface, allowDashboard, allowFacilitate, allowStaffEvals, allowTraining, allowTeam } from "@/components/RequireAccess";
import StatsEvaluations from "@/pages/stats/StatsEvaluations";
import SurveyTakePage from "@/pages/survey/SurveyTakePage";

// My Role pages
import MyRoleLayout from "@/pages/my-role/MyRoleLayout";
import RoleRadar from "@/components/my-role/RoleRadar";
import PracticeLog from "@/pages/my-role/PracticeLog";
import DomainDetail from "@/pages/my-role/DomainDetail";
import CraftAtlasArea from "@/pages/my-role/CraftAtlasArea";

// PRF-3: everything below is split into its own chunk, lazy-loaded only when
// its route is actually visited. These are the surfaces an ordinary
// participant never opens (admin tools, coach/regional dashboards,
// evaluation review, the recommender/sequencer builder) plus the Clinical
// Director / Doctor role trees, which are a separate persona's surfaces.
// Grouped by the priority order in PRF-3, not by folder.

// Coach / regional dashboards
const CoachLayoutV2 = lazy(() => import("@/pages/coach/CoachLayoutV2"));
const CoachDashboardV2 = lazy(() => import("@/pages/coach/CoachDashboardV2"));
const StaffDetailV2 = lazy(() => import("@/pages/coach/StaffDetailV2"));
const EvaluationHub = lazy(() =>
  import("@/pages/coach/EvaluationHub").then((m) => ({ default: m.EvaluationHub }))
);
const EvaluationCapture = lazy(() => import("@/pages/coach/EvaluationCapture"));
const RegionalDashboard = lazy(() => import("@/pages/dashboard/RegionalDashboard"));
const LocationDetail = lazy(() => import("@/pages/dashboard/LocationDetail"));
// MyLocationPage (office-manager-only) statically wraps LocationDetail, which
// in turn statically embeds CoachDashboardV2. Route-level lazy() on
// LocationDetail/CoachDashboardV2 alone can't split them out of the main
// bundle while MyLocationPage stays an eager import -- Rollup keeps a module
// in whatever chunk still reaches it synchronously. Lazy-loading
// MyLocationPage itself (not part of the participant home path) is what
// actually moves this whole chain into its own chunk.
const MyLocationPage = lazy(() => import("@/pages/my-location/MyLocationPage"));

// Admin surfaces
const AdminPage = lazy(() => import("@/pages/AdminPage"));
const PlatformPage = lazy(() => import("@/pages/PlatformPage"));
const EvalResultsV2 = lazy(() => import("@/pages/admin/EvalResultsV2"));
const SurveyBuilderPage = lazy(() => import("@/pages/admin/SurveyBuilderPage"));
const SurveyResultsPage = lazy(() => import("@/pages/admin/SurveyResultsPage"));

// Evaluation review flows
const EvaluationViewer = lazy(() => import("@/pages/EvaluationViewer"));
const EvaluationReview = lazy(() => import("@/pages/EvaluationReview"));
const EvaluationReviewV2 = lazy(() => import("@/pages/EvaluationReviewV2"));

// Recommender / sequencer surface
const AdminBuilder = lazy(() => import("@/pages/AdminBuilder"));

// Other rarely-visited surfaces
const TrainingHome = lazy(() => import("@/pages/training/TrainingHome"));
const FacilitatePage = lazy(() => import("@/pages/facilitate/FacilitatePage"));

// Clinical Director pages (separate persona, not part of the participant path)
const ClinicalLayout = lazy(() => import("@/pages/clinical/ClinicalLayout"));
const DoctorManagement = lazy(() => import("@/pages/clinical/DoctorManagement"));
const DoctorProMoveLibrary = lazy(() => import("@/pages/clinical/DoctorProMoveLibrary"));
const DoctorDetail = lazy(() => import("@/pages/clinical/DoctorDetail"));

// Doctor pages (separate persona, not part of the participant path)
const DoctorLayout = lazy(() => import("@/pages/doctor/DoctorLayout"));
const DoctorHome = lazy(() => import("@/pages/doctor/DoctorHome"));
const DoctorMyRole = lazy(() => import("@/pages/doctor/DoctorMyRole"));
const DoctorDomainDetail = lazy(() => import("@/pages/doctor/DoctorDomainDetail"));
const BaselineWizard = lazy(() => import("@/pages/doctor/BaselineWizard"));
const DoctorBaselineResults = lazy(() => import("@/pages/doctor/DoctorBaselineResults"));
const DoctorReviewPrep = lazy(() => import("@/pages/doctor/DoctorReviewPrep"));
const DoctorCoachingHistory = lazy(() => import("@/pages/doctor/DoctorCoachingHistory"));
const DoctorMyTeam = lazy(() => import("@/pages/doctor/DoctorMyTeam"));
const DoctorTeamRoleDetail = lazy(() => import("@/pages/doctor/DoctorTeamRoleDetail"));
const DoctorTeamDomainDetail = lazy(() => import("@/pages/doctor/DoctorTeamDomainDetail"));

// Interpolates the :week param when redirecting legacy /confidence/:week and
// /performance/:week links to their step-1 wizard route. (A plain <Navigate to>
// would send users to a URL with a literal ":week" in it.)
function RedirectToStepOne({ base }: { base: 'confidence' | 'performance' }) {
  const { week } = useParams();
  return <Navigate to={`/${base}/${week}/step/1`} replace />;
}

// App routes with pre-routing checks for public pages
function AppRoutes() {
  const { user, loading, needsPasswordSetup } = useAuth();
  const { pathname } = useLocation();

  // Public routes for auth flows (must run BEFORE auth gating)
  if (pathname.startsWith("/auth/callback")) return <AuthCallback />;
  if (pathname.startsWith("/reset-password")) return <ResetPassword />;
  if (pathname.startsWith("/forgot-password")) return <ForgotPassword />;

  // Public static sedation calculator (public/sedation/index.html). If the SPA
  // fallback catches the URL, hand off to the real file; target the explicit
  // filename so this can never redirect-loop.
  if (pathname === "/sedation" || pathname.startsWith("/sedation/")) {
    window.location.replace("/sedation/index.html");
    return null;
  }

  if (loading) {
    // DSN-5c: app-level auth gate, before we know whether there's a session.
    // The brand loader in "waiting" mode -- discrete laps, never a
    // continuous spin -- replaces the old ad hoc spinner div here.
    return <RouteLoadingFallback />;
  }

  if (!user && pathname === '/') return <LandingPage />;
  if (!user) return <Login />;
  if (needsPasswordSetup) return <SetupPassword />;

  return (
    <Routes>
      {/* Full-screen facilitator presentation (no app chrome). This route
          renders outside Layout, so it's the one lazy route App.tsx still
          needs its own Suspense boundary for -- a full-screen fallback is
          correct here since there's no persistent shell to preserve.
          Everything else lazy is nested under Layout below, where the
          Suspense boundaries live around its <Outlet /> placements instead
          (PRF-3 QA fix: a single top-level Suspense here was unmounting the
          whole app shell -- sidebar, header, tab bar -- on every first visit
          to a lazy route). */}
      <Route
        path="/facilitate"
        element={
          <Suspense fallback={<RouteLoadingFallback />}>
            <RequireAccess allow={allowFacilitate}><FacilitatePage /></RequireAccess>
          </Suspense>
        }
      />
      <Route path="/" element={<Layout />}>
        <Route index element={<Index />} />
        <Route path="login" element={<Navigate to="/" replace />} />
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

        {/* Explore atlas — area page (Concept B screen 2, mobile-shell primary;
            redirects to the domain page on desktop). See
            docs/features/explore-my-role-build-instructions.md section C. */}
        <Route path="my-role/area/:competencyId" element={<CraftAtlasArea />} />

        <Route path="profile" element={<Profile />} />
        <Route path="reset-password" element={<ResetPassword />} />

        {/* Mobile shell: More tab (see docs/features/mobile-build-instructions.md B.4) */}
        <Route path="more" element={<MorePage />} />

        {/* Performance tab (mobile-shell primary; renders in the content area on desktop too, no nav entry) */}
        <Route path="performance" element={<PerformancePage />} />

        {/* Team surface (leads) — mobile-shell only entry points, section F */}
        <Route path="team" element={<RequireAccess allow={allowTeam}><TeamPage /></RequireAccess>} />
        <Route path="team/:staffId" element={<RequireAccess allow={allowTeam}><TeamStaffPage /></RequireAccess>} />
        
        {/* Redirect legacy pages to wizard versions */}
        <Route path="confidence/:week" element={<RedirectToStepOne base="confidence" />} />
        <Route path="confidence/:week/step/:n" element={<ConfidenceWizard />} />
        <Route path="performance/:week" element={<RedirectToStepOne base="performance" />} />
        <Route path="performance/:week/step/:n" element={<PerformanceWizard />} />

        {/* Coach Routes */}
        <Route path="coach" element={<RequireAccess allow={allowCoachSurface}><CoachLayoutV2 /></RequireAccess>}>
          <Route index element={<CoachDashboardV2 />} />
          <Route path=":staffId" element={<StaffDetailV2 />} />
          <Route path=":staffId/eval/:evalId" element={<RequireAccess allow={allowStaffEvals}><EvaluationHub /></RequireAccess>} />
          <Route path=":staffId/eval/:evalId/capture" element={<RequireAccess allow={allowStaffEvals}><EvaluationCapture /></RequireAccess>} />
        </Route>

        {/* Dashboard Routes */}
        {/* N5: one destination, three names — menu label "Command Center", route /dashboard, component RegionalDashboard. */}
        <Route path="dashboard" element={<RequireAccess allow={allowDashboard}><RegionalDashboard /></RequireAccess>} />
        <Route path="dashboard/location/:locationId" element={<RequireAccess allow={allowDashboard}><LocationDetail /></RequireAccess>} />
        <Route path="my-location" element={<MyLocationPage />} />

        {/* Clinical Director Routes */}
        <Route path="clinical" element={<ClinicalLayout />}>
          <Route index element={<DoctorManagement />} />
          <Route path="doctors" element={<Navigate to="/clinical" replace />} />
          <Route path="doctors/:staffId" element={<DoctorDetail />} />
          <Route path="pro-moves" element={<DoctorProMoveLibrary />} />
        </Route>

        {/* Doctor Routes */}
        <Route path="doctor" element={<DoctorLayout />}>
          <Route index element={<DoctorHome />} />
          <Route path="my-role" element={<DoctorMyRole />} />
          <Route path="my-role/domain/:domainSlug" element={<DoctorDomainDetail />} />
          <Route path="baseline" element={<BaselineWizard />} />
          <Route path="baseline-results" element={<DoctorBaselineResults />} />
          <Route path="review-prep/:sessionId" element={<DoctorReviewPrep />} />
          <Route path="coaching-history" element={<DoctorCoachingHistory />} />
          <Route path="my-team" element={<DoctorMyTeam />} />
          <Route path="my-team/role/:roleSlug" element={<DoctorTeamRoleDetail />} />
          <Route path="my-team/role/:roleSlug/domain/:domainSlug" element={<DoctorTeamDomainDetail />} />
        </Route>

        <Route path="admin" element={<AdminPage />} />
        <Route path="settings/integrations" element={<Navigate to="/admin?tab=integrations" replace />} />
        <Route path="platform" element={<PlatformPage />} />
        <Route path="admin/evaluations" element={<EvalResultsV2 />} />
        {/* Legacy redirects for old eval results paths */}
        <Route path="admin/eval-results" element={<Navigate to="/admin/evaluations" replace />} />
        <Route path="admin/eval-results-v2" element={<Navigate to="/admin/evaluations" replace />} />
        {/* Ask Alcan — surveys */}
        <Route path="admin/surveys/new" element={<SurveyBuilderPage />} />
        <Route path="admin/surveys/:id/edit" element={<SurveyBuilderPage />} />
        <Route path="admin/surveys/:id" element={<SurveyResultsPage />} />
        <Route path="survey/:id" element={<SurveyTakePage />} />

        <Route path="evaluation/:evalId" element={<EvaluationViewer />} />
        <Route path="evaluation/:evalId/review" element={<EvaluationReview />} />
        <Route path="evaluation/:evalId/review-v2" element={<EvaluationReviewV2 />} />
        <Route path="builder" element={<AdminBuilder />} />
        <Route path="training" element={<RequireAccess allow={allowTraining}><TrainingHome /></RequireAccess>} />
        {/* Legacy builder deep-links redirect to the current Builder */}
        <Route path="builder/:roleId" element={<Navigate to="/builder" replace />} />
        <Route path="builder/:roleId/:cycle" element={<Navigate to="/builder" replace />} />
        <Route path="builder/:roleId/:cycle/week/:week" element={<Navigate to="/builder" replace />} />

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
      refetchOnWindowFocus: false, // Prevent tab-switch from refetching and resetting UI state
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SimProvider>
          <BatchProcessorProvider>
            <BrowserRouter>
              <RouteErrorBoundary>
                <AppRoutes />
              </RouteErrorBoundary>
              <PwaManager />
              <Toaster />
            </BrowserRouter>
          </BatchProcessorProvider>
        </SimProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
