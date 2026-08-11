-- Focus Moves: longitudinal growth containers for the doctor coaching
-- track. Replaces the session-scoped "1 discussion topic + 3 action
-- steps" primitives with a Pro Move + plain-language "Our starting point"
-- statement that persists across sessions, gains narrative status updates
-- from the doctor at each prep, and retires when the Pro Move's
-- doctor_good_looks_like is consistently observed.
--
-- pro_moves.action_id is bigint (verified live 2026-08-11).

create table if not exists doctor_focus_items (
  id uuid primary key default gen_random_uuid(),
  doctor_staff_id uuid not null references staff(id) on delete cascade,
  coach_staff_id uuid not null references staff(id) on delete cascade,
  pro_move_id bigint not null references pro_moves(action_id),
  statement text not null default '',
  status text not null default 'draft'
    check (status in ('draft','parked','active','retired')),
  retired_outcome text
    check (retired_outcome in ('landed','set_aside')),
  origin_session_id uuid references coaching_sessions(id) on delete set null,
  activated_at timestamptz,
  retired_at timestamptz,
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_doctor_focus_items_doctor on doctor_focus_items(doctor_staff_id);
create index if not exists idx_doctor_focus_items_coach on doctor_focus_items(coach_staff_id);

-- coaching_touch_updated_at() is a pre-existing generic trigger fn (used by
-- coaching_issues); reused here rather than defining a duplicate.
drop trigger if exists trg_doctor_focus_items_updated_at on doctor_focus_items;
create trigger trg_doctor_focus_items_updated_at
  before update on doctor_focus_items
  for each row execute function coaching_touch_updated_at();

create table if not exists doctor_focus_item_updates (
  id uuid primary key default gen_random_uuid(),
  focus_item_id uuid not null references doctor_focus_items(id) on delete cascade,
  session_id uuid references coaching_sessions(id) on delete set null,
  progress text not null
    check (progress in ('going_well','working_on_it','not_started')),
  note text,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_doctor_focus_item_updates_item on doctor_focus_item_updates(focus_item_id);

alter table doctor_focus_items enable row level security;
alter table doctor_focus_item_updates enable row level security;

-- doctor_focus_items: mirrors coaching_sessions' RLS shape exactly.
drop policy if exists "Doctor can view own focus items" on doctor_focus_items;
create policy "Doctor can view own focus items" on doctor_focus_items
for select
using (doctor_staff_id in (select id from staff where user_id = auth.uid()));

drop policy if exists "Clinical staff view focus items in own org" on doctor_focus_items;
create policy "Clinical staff view focus items in own org" on doctor_focus_items
for select
using (
  is_super_admin(auth.uid())
  or (
    exists (select 1 from staff s where s.user_id = auth.uid() and s.is_clinical_director = true)
    and org_id_of_staff(doctor_staff_id) = current_user_org_id()
  )
);

drop policy if exists "Coach can manage own focus items" on doctor_focus_items;
create policy "Coach can manage own focus items" on doctor_focus_items
for all
using (coach_staff_id in (select id from staff where user_id = auth.uid()))
with check (
  coach_staff_id in (select id from staff where user_id = auth.uid())
  and (
    is_super_admin(auth.uid())
    or (
      exists (select 1 from staff s where s.user_id = auth.uid() and s.is_clinical_director = true)
      and org_id_of_staff(doctor_staff_id) = current_user_org_id()
    )
    or is_assigned_doctor_coach(auth.uid(), doctor_staff_id)
  )
);

drop policy if exists "Clinical staff update focus items in own org" on doctor_focus_items;
create policy "Clinical staff update focus items in own org" on doctor_focus_items
for update
using (
  is_super_admin(auth.uid())
  or (
    exists (select 1 from staff s where s.user_id = auth.uid() and s.is_clinical_director = true)
    and org_id_of_staff(doctor_staff_id) = current_user_org_id()
  )
)
with check (
  is_super_admin(auth.uid())
  or (
    exists (select 1 from staff s where s.user_id = auth.uid() and s.is_clinical_director = true)
    and org_id_of_staff(doctor_staff_id) = current_user_org_id()
  )
);

drop policy if exists "Assigned doctor coach views focus items" on doctor_focus_items;
create policy "Assigned doctor coach views focus items" on doctor_focus_items
for select
using (is_assigned_doctor_coach(auth.uid(), doctor_staff_id));

-- doctor_focus_item_updates: doctor manages their own progress reports;
-- coach/CD/super-admin visibility follows the parent item's org and
-- assignment rules (no org column on this table to check directly).
drop policy if exists "Doctor can manage own focus item updates" on doctor_focus_item_updates;
create policy "Doctor can manage own focus item updates" on doctor_focus_item_updates
for all
using (
  exists (
    select 1 from doctor_focus_items fi
    join staff s on s.id = fi.doctor_staff_id
    where fi.id = doctor_focus_item_updates.focus_item_id
      and s.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from doctor_focus_items fi
    join staff s on s.id = fi.doctor_staff_id
    where fi.id = doctor_focus_item_updates.focus_item_id
      and s.user_id = auth.uid()
  )
);

drop policy if exists "Clinical staff view focus item updates" on doctor_focus_item_updates;
create policy "Clinical staff view focus item updates" on doctor_focus_item_updates
for select
using (
  exists (
    select 1 from doctor_focus_items fi
    where fi.id = doctor_focus_item_updates.focus_item_id
      and (
        is_super_admin(auth.uid())
        or (
          exists (select 1 from staff s where s.user_id = auth.uid() and s.is_clinical_director = true)
          and org_id_of_staff(fi.doctor_staff_id) = current_user_org_id()
        )
        or is_assigned_doctor_coach(auth.uid(), fi.doctor_staff_id)
      )
  )
);
