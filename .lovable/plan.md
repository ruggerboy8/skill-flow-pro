# Phase 1: Doctor Onboarding and Baseline Assessment

## ✅ IMPLEMENTATION COMPLETE

All core functionality for Phase 1 has been implemented:
- Database schema with Doctor role, staff flags, and baseline tables
- Clinical Director portal with invitation and management UI
- Doctor baseline assessment wizard with domain-by-domain flow
- Permission hooks and edge function actions
- Route structure and navigation

---

## Summary

This plan builds a doctor-specific coaching flow with a separate Clinical Director portal for Dr. Alex. Doctors will be invited, guided through a baseline self-assessment of all Doctor ProMoves, and their results will be visible to the Clinical Director. The flow is intentionally distinct from the staff weekly cadence.

---

## 1. Database Schema Changes

### 1.1 New Role: Doctor (role_id = 4)
```sql
INSERT INTO roles (role_id, role_name) VALUES (4, 'Doctor');
```

### 1.2 Staff Table Updates
Add flags to identify doctors and clinical directors:
```sql
ALTER TABLE staff 
  ADD COLUMN is_doctor BOOLEAN DEFAULT false,
  ADD COLUMN is_clinical_director BOOLEAN DEFAULT false;
```

### 1.3 Doctor Baseline Assessment Tables
```sql
-- Master assessment record (one per doctor)
CREATE TABLE doctor_baseline_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_staff_id UUID REFERENCES staff(id) NOT NULL UNIQUE,
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Individual ProMove ratings within the baseline
CREATE TABLE doctor_baseline_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES doctor_baseline_assessments(id) ON DELETE CASCADE,
  action_id BIGINT REFERENCES pro_moves(action_id),
  self_score INTEGER CHECK (self_score BETWEEN 1 AND 4),
  self_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(assessment_id, action_id)
);
```

### 1.4 Doctor Learning Materials Storage
Reuse the existing `pro_move_resources` table with new `type` values for doctor-specific content:
- `type = 'doctor_text'` - Pro Move text (description)
- `type = 'doctor_why'` - "Why it matters"
- `type = 'doctor_script'` - Scripting examples
- `type = 'doctor_gut_check'` - Gut Check Questions
- `type = 'doctor_good_looks_like'` - What good looks like

The `content_md` column stores markdown content; `metadata` JSONB can hold structured data if needed.

### 1.5 RLS Policies
```sql
-- Doctors can only view/edit their own baseline
CREATE POLICY "Doctors manage own baseline" ON doctor_baseline_assessments
  FOR ALL USING (
    doctor_staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid() AND is_doctor = true)
  );

CREATE POLICY "Doctors manage own baseline items" ON doctor_baseline_items
  FOR ALL USING (
    assessment_id IN (
      SELECT id FROM doctor_baseline_assessments 
      WHERE doctor_staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
    )
  );

-- Clinical Directors can view all doctor baselines
CREATE POLICY "Clinical Directors view baselines" ON doctor_baseline_assessments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND is_clinical_director = true)
  );

CREATE POLICY "Clinical Directors view baseline items" ON doctor_baseline_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND is_clinical_director = true)
  );
```

---

## 2. Permission Model

### 2.1 Doctor Characteristics
| Flag | Value | Notes |
|------|-------|-------|
| `is_doctor` | `true` | New flag to identify doctors |
| `is_participant` | `false` | Doctors do not follow weekly cadence |
| `role_id` | `4` | Doctor role |
| `primary_location_id` | `null` OR location UUID | Optional - doctors may be roaming |
| `home_route` | `'/doctor'` | Doctor-specific landing page |

### 2.2 Clinical Director Characteristics
| Flag | Value | Notes |
|------|-------|-------|
| `is_clinical_director` | `true` | Dr. Alex gets this flag |
| Existing role flags | unchanged | May also be coach/admin as needed |
| Access | New `/clinical` routes | Bespoke doctor management portal |

### 2.3 Edge Function Preset
Add `doctor` preset to admin-users edge function:
```typescript
doctor: {
  is_participant: false,
  is_doctor: true,
  is_lead: false,
  is_coach: false,
  is_org_admin: false,
  is_super_admin: false,
  home_route: '/doctor',
}
```

---

## 3. User Visibility in Admin Panel

### 3.1 Doctors in Main Admin Users Tab
- Doctors WILL appear in the `/admin?tab=users` list
- Limited edit actions available:
  - Reset password
  - Change location (optional field)
- Actions NOT applicable to doctors (hidden/disabled):
  - is_lead, is_coach, is_participant toggles
  - Weekly submission management
  - Role presets (coach, lead, etc.)

### 3.2 Role Badge Display
Add "Dr" indicator badge alongside existing SA/RM/C/L indicators:
```typescript
if (user.is_doctor) {
  indicators.push({ abbr: 'Dr', label: 'Doctor', color: 'bg-teal-500 text-white' });
}
```

---

## 4. Clinical Director Portal

### 4.1 Route Structure
```text
/clinical                     # Clinical Director home
/clinical/doctors             # Doctor user management (invites, list)
/clinical/doctors/:staffId    # Individual doctor detail (card-based)
/clinical/pro-moves           # Doctor ProMoves editor (bespoke)
```

### 4.2 Clinical Director Layout
Similar pattern to coach layout - minimal wrapper with `<Outlet />`:
```typescript
// src/pages/clinical/ClinicalLayout.tsx
export default function ClinicalLayout() {
  return (
    <div className="space-y-6">
      <Outlet />
    </div>
  );
}
```

### 4.3 Clinical Director Home
Dashboard showing:
- Count of invited doctors
- Count with completed baselines
- Count in progress
- Quick action: "Invite Doctor"

### 4.4 Doctor User Management (`/clinical/doctors`)
A table view for administrative tasks:
- List all doctors (name, email, location or "Multiple/Roaming", status)
- Invite Doctor button (opens dialog)
- Status indicators: Invited, Baseline In Progress, Baseline Complete
- Row actions: Send reset email, Resend invite

### 4.5 Doctor Cards View (Regional Command Center Pattern)
Grid of doctor cards (similar to LocationHealthCard pattern):
```typescript
interface DoctorCardData {
  id: string;
  name: string;
  location_name: string | null;  // null = "Roaming" or "Multiple"
  baseline_status: 'invited' | 'in_progress' | 'completed';
  baseline_completion_pct?: number;  // 0-100 during in_progress
  completed_at?: string;
}
```
Cards are clickable and navigate to `/clinical/doctors/:staffId`.

### 4.6 Doctor Detail Page (`/clinical/doctors/:staffId`)
Following the StaffDetailV2 pattern with tabs/sections:
- **Header**: Doctor name, location (or "Roaming"), status badge
- **Baseline Summary Section**: 
  - If completed: Grid of all ProMove ratings grouped by domain
  - If in progress: Progress indicator + partial results
  - If not started: "Baseline not yet started"
- **Future sections** (out of scope for Phase 1):
  - Coach Notes
  - Check-in History
  - Priority Focus

---

## 5. Doctor Invitation Flow

### 5.1 Invitation UI (Clinical Director Only)
New `InviteDoctorDialog` component with fields:
- Email (required)
- Name (required)
- Organization (required, filtered by CD's scope)
- Location (optional):
  - Dropdown with locations from selected org
  - "Multiple / Roaming" option that sets `primary_location_id = null`
  - Default to "Multiple / Roaming" (null)
- Role auto-set to "Doctor" (role_id = 4)

### 5.2 Edge Function: `invite_doctor` Action
Add to `admin-users/index.ts`:
```typescript
case "invite_doctor": {
  // Only clinical directors can invite doctors
  if (!me.is_clinical_director && !me.is_super_admin) {
    return json({ error: "Only Clinical Directors can invite doctors" }, 403);
  }
  
  const { email, name, location_id, organization_id } = payload ?? {};
  // email, name, organization_id required; location_id is optional
  
  // Create auth user via invite
  const { data: invite } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${SITE_URL}/auth/callback`,
    data: { user_type: 'doctor' }
  });
  
  // Create staff record with is_doctor = true
  // location_id can be null for roaming doctors
  await admin.from("staff").insert({
    name,
    email,
    role_id: 4,  // Doctor
    primary_location_id: location_id || null,  // null = roaming
    is_participant: false,
    is_doctor: true,
    user_id: invite.user.id,
  });
  
  return json({ ok: true });
}
```

### 5.3 Doctor First-Login Routing
In `AppRoutes`, after password setup, check for doctor routing:
```typescript
// After password setup, check user type
const { data: staff } = await supabase
  .from('staff')
  .select('id, is_doctor')
  .eq('user_id', user.id)
  .single();

if (staff?.is_doctor) {
  // Check baseline status
  const { data: baseline } = await supabase
    .from('doctor_baseline_assessments')
    .select('status')
    .eq('doctor_staff_id', staff.id)
    .maybeSingle();
  
  if (!baseline || baseline.status !== 'completed') {
    navigate('/doctor/baseline');
  } else {
    navigate('/doctor');
  }
}
```

---

## 6. Doctor ProMoves Management

### 6.1 Existing ProMove Library Enhancement
In `ProMoveLibrary.tsx`, the role dropdown already loads all roles. Once role_id=4 exists, "Doctor" will appear in the filter. Clinical Directors (and super admins) can create/edit Doctor ProMoves here.

### 6.2 Bespoke Doctor ProMoves Editor (`/clinical/pro-moves`)
A dedicated page within the Clinical Director portal with:
- Auto-filtered to role_id = 4 (Doctor only)
- Simplified UI focused on doctor content
- Same CRUD operations as main ProMoveLibrary
- Dedicated learning materials panel

### 6.3 Doctor Learning Materials Drawer
New `DoctorMaterialsDrawer` component for editing doctor-specific fields:

| Field | Resource Type | Storage |
|-------|--------------|---------|
| Pro Move Text | `doctor_text` | `content_md` |
| Why It Matters | `doctor_why` | `content_md` |
| Scripting | `doctor_script` | `content_md` |
| Gut Check Questions | `doctor_gut_check` | `content_md` (markdown list) |
| What Good Looks Like | `doctor_good_looks_like` | `content_md` |

UI Layout:
- Five collapsible sections, each with a textarea/markdown editor
- Save button persists to `pro_move_resources` table
- Read-only mode for doctors viewing during baseline

---

## 7. Baseline Self-Assessment Flow

### 7.1 Route: `/doctor/baseline`
Accessible only to users with `is_doctor = true`.

### 7.2 Desktop-Optimized Domain-by-Domain Assessment

The baseline is designed for desktop/laptop use, showing all ProMoves for a domain at once in a scannable table format.

**Step 1: Welcome**
- Personalized greeting: "Welcome, Dr. [Name]"
- Purpose statement: "This is a self-reflection exercise to calibrate where you are today"
- Tone: "Coaching, not grading"
- Button: "Begin Assessment"

**Steps 2-5: Domain Assessment (one step per domain)**

Each domain step displays all ProMoves in that domain in a table layout:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  Clinical Domain                                         Step 1 of 4   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────┬─────────────┐   │
│  │ Pro Move                                          │   Rating    │   │
│  ├───────────────────────────────────────────────────┼─────────────┤   │
│  │ ▶ Completes thorough patient assessment...        │ ① ② ③ ④    │   │
│  ├───────────────────────────────────────────────────┼─────────────┤   │
│  │ ▶ Explains treatment options clearly...           │ ① ② ③ ④    │   │
│  ├───────────────────────────────────────────────────┼─────────────┤   │
│  │ ▶ Documents findings accurately and timely...     │ ① ② ③ ④    │   │
│  └───────────────────────────────────────────────────┴─────────────┘   │
│                                                                         │
│  Click any Pro Move to view details and calibration materials          │
│                                                                         │
│                                        [← Previous]  [Next Domain →]   │
└─────────────────────────────────────────────────────────────────────────┘
```

UI Elements:
- **ProMove Row**: Clickable row that opens the learning materials drawer
- **Rating Buttons**: 1-4 scale displayed inline, radio-button style
- **Progress Indicator**: "Step 2 of 5" or domain progress bar
- **Auto-save**: Ratings saved on selection (no explicit save button needed)

### 7.3 Learning Materials Drawer (Read-Only)

When a doctor clicks a ProMove row, a Sheet/Drawer slides in from the right showing:
- **Pro Move Statement** (header)
- **Why It Matters** (collapsible section)
- **Scripting** (collapsible section)
- **Gut Check Questions** (collapsible section)
- **What Good Looks Like** (collapsible section)

Drawer includes the rating buttons at the bottom so doctors can rate without closing.

### 7.4 Completion Step

**Final Step: Summary & Complete**
- All domains listed with completion checkmarks
- Table of all ratings at a glance (grouped by domain)
- "Submit Baseline" button to finalize
- Confirmation: "Your baseline is complete. Dr. Alex will reach out to schedule your baseline check-in."

### 7.5 Data Flow
- On wizard start: Create `doctor_baseline_assessments` record with `status = 'in_progress'`
- As user rates each ProMove: Upsert to `doctor_baseline_items` (auto-save)
- On final submission: Update assessment `status = 'completed'`, set `completed_at`

### 7.6 Resumable Progress
If doctor returns to `/doctor/baseline` with in-progress assessment:
- Resume from first domain with incomplete ratings
- Show previously entered ratings pre-filled

---

## 8. File Structure

### 8.1 New Files
```text
src/pages/clinical/
  ClinicalLayout.tsx              # Wrapper with Outlet
  ClinicalHome.tsx                # Dashboard for CD
  DoctorManagement.tsx            # Table view for invites/admin
  DoctorCards.tsx                 # Card grid (command center pattern)
  DoctorDetail.tsx                # Individual doctor detail page

src/pages/doctor/
  DoctorLayout.tsx                # Wrapper for doctor routes
  DoctorHome.tsx                  # Post-baseline landing page
  BaselineWizard.tsx              # Main baseline flow controller
  
src/components/clinical/
  DoctorCard.tsx                  # Individual doctor card component
  InviteDoctorDialog.tsx          # Invite doctor form
  BaselineSummaryPanel.tsx        # View doctor's baseline results

src/components/doctor/
  BaselineWelcome.tsx             # Welcome step
  DomainAssessmentStep.tsx        # All ProMoves for one domain
  ProMoveRow.tsx                  # Single row with rating buttons
  BaselineComplete.tsx            # Completion/summary step
  DoctorMaterialsSheet.tsx        # Read-only materials drawer

src/components/admin/
  DoctorMaterialsDrawer.tsx       # Edit doctor learning materials

src/hooks/
  useDoctorBaseline.tsx           # Baseline state and mutations
  useDoctorProMoves.tsx           # Fetch Doctor ProMoves with materials
  useClinicalDirector.tsx         # CD access checks and scope
```

### 8.2 Modified Files
```text
supabase/functions/admin-users/index.ts  # Add invite_doctor action, doctor preset
src/hooks/useUserRole.tsx                 # Add isDoctor, isClinicalDirector
src/hooks/useStaffProfile.tsx             # Include is_doctor, is_clinical_director
src/components/Layout.tsx                 # Add clinical nav items for CD
src/components/AppSidebar.tsx             # Add doctor/clinical nav sections
src/App.tsx                               # Add /doctor and /clinical routes
src/components/admin/AdminUsersTab.tsx    # Handle doctor display, limited actions
src/integrations/supabase/types.ts        # Regenerate after migration
```

---

## 9. Implementation Sequence

### Phase 1a: Database Foundation
1. Add role_id = 4 (Doctor) to roles table
2. Add `is_doctor`, `is_clinical_director` columns to staff table
3. Create `doctor_baseline_assessments` and `doctor_baseline_items` tables
4. Create RLS policies for baseline tables
5. Set `is_clinical_director = true` for Dr. Alex's staff record

### Phase 1b: Permission Updates
1. Update `useUserRole` hook with `isDoctor`, `isClinicalDirector`
2. Update `useStaffProfile` to fetch new columns
3. Add `doctor` preset to admin-users edge function
4. Add `invite_doctor` action to admin-users edge function

### Phase 1c: Admin Panel Updates
1. Update AdminUsersTab to show "Dr" badge for doctors
2. Conditionally hide/disable non-applicable actions for doctors
3. Handle null location display ("Roaming")

### Phase 1d: Clinical Director Portal
1. Create ClinicalLayout and route structure
2. Build ClinicalHome dashboard
3. Build DoctorManagement table view
4. Build InviteDoctorDialog (with optional location)
5. Build DoctorCards grid view
6. Build DoctorDetail page with BaselineSummaryPanel

### Phase 1e: Doctor ProMoves Content
1. Create doctor competencies (placeholder set for role_id = 4)
2. Create sample Doctor ProMoves (action_id entries)
3. Build DoctorMaterialsDrawer for editing learning content
4. Wire up ProMoveLibrary to filter for Doctor role

### Phase 1f: Baseline Assessment Flow
1. Create DoctorLayout and routing
2. Build BaselineWizard controller with domain-by-domain steps
3. Build DomainAssessmentStep with table layout
4. Build ProMoveRow with inline rating buttons
5. Build DoctorMaterialsSheet (read-only drawer)
6. Build BaselineWelcome and BaselineComplete steps
7. Implement useDoctorBaseline hook (create, save ratings, complete)
8. Wire first-login routing for doctors

### Phase 1g: Integration and Polish
1. Add sidebar navigation for doctors and clinical directors
2. Test full flow: invite -> login -> baseline -> CD views
3. Error handling and edge cases

---

## Technical Notes

### Why Separate Baseline Tables?
- Doctors do not follow the staff evaluation cadence (no program_year/quarter)
- One-time baseline assessment, not recurring
- Simpler schema tailored to doctor needs
- Clear data isolation from staff evaluations

### Learning Materials Strategy
Reusing `pro_move_resources` with doctor-specific `type` values:
- Leverages existing infrastructure
- No schema changes needed
- Future flexibility for additional content types

### Optional Location Handling
- `primary_location_id = null` indicates roaming/multiple locations
- Display as "Roaming" or "Multiple Locations" in UI
- Invitation dialog defaults to optional (null) selection
- No foreign key constraint issues since column is already nullable

### Sidebar Navigation Logic
```typescript
// In AppSidebar or Layout
if (isClinicalDirector) {
  // Show: Clinical Director Portal link
}
if (isDoctor) {
  // Show: Doctor Home, My Baseline (if not completed)
  // Hide: All staff-specific items (confidence, performance, etc.)
}
```

### Privacy Model
- Doctor baseline data is highly restricted via RLS
- Only the doctor + Clinical Directors + Super Admins can view
- No cross-doctor visibility for doctors
- Reinforces "coaching, not performance management" posture

