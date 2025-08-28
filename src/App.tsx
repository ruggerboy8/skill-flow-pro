function AppRoutes() {
  const { user, loading, needsPasswordSetup, needsProfileSetup } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <Routes>
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