/**
 * Fixed fictional cast for the Bluebird Dental demo org (DEMO-1a).
 *
 * Every real staff name and email copied from a live Alcan location gets
 * replaced with one of these entries before anything is written to the
 * database. This list is checked into the repo on purpose: it must stay
 * IDENTICAL across seed runs so the mapping in lib/anonymize.ts stays
 * deterministic (`--refresh` must re-point the same demo person to the
 * same source person every time, not reshuffle the cast).
 *
 * Do not add real names here. Do not reuse a name from any real
 * organization this app serves.
 *
 * Three entries carry `loginRole`. Those three get an actual Supabase Auth
 * user with a real, known password (from env vars — see .env.example) so
 * the presenter can log in as them during capture. Their email uses the
 * descriptive demo-<role>@bluebird.demo form instead of firstname@ so the
 * login identity is easy to find in README / .env docs; every other cast
 * member still gets a firstname@bluebird.demo address and still gets an
 * auth user (the `staff.user_id` column is NOT NULL with a foreign key to
 * auth.users, so every copied staff row needs *some* auth user to exist),
 * but with a random password nobody is ever meant to use.
 */

export type LoginRole = 'participant' | 'coach' | 'admin';

export interface CastMember {
  firstName: string;
  lastName: string;
  email: string;
  loginRole?: LoginRole;
}

export const DEMO_ORG_EMAIL_DOMAIN = 'bluebird.demo';

export const CAST: CastMember[] = [
  { firstName: 'Jamie', lastName: 'Ellison', email: 'demo-staff@bluebird.demo', loginRole: 'participant' },
  { firstName: 'Morgan', lastName: 'Castillo', email: 'demo-coach@bluebird.demo', loginRole: 'coach' },
  { firstName: 'Devon', lastName: 'Ashworth', email: 'demo-admin@bluebird.demo', loginRole: 'admin' },
  { firstName: 'Priya', lastName: 'Sundaram', email: 'priya@bluebird.demo' },
  { firstName: 'Lucas', lastName: 'Ferreira', email: 'lucas@bluebird.demo' },
  { firstName: 'Naomi', lastName: 'Whitfield', email: 'naomi@bluebird.demo' },
  { firstName: 'Theo', lastName: 'Marchetti', email: 'theo@bluebird.demo' },
  { firstName: 'Aaliyah', lastName: 'Grant', email: 'aaliyah@bluebird.demo' },
  { firstName: 'Kian', lastName: 'Okafor', email: 'kian@bluebird.demo' },
  { firstName: 'Bianca', lastName: 'Solano', email: 'bianca@bluebird.demo' },
  { firstName: 'Rowan', lastName: 'Delacroix', email: 'rowan@bluebird.demo' },
  { firstName: 'Sienna', lastName: 'Park', email: 'sienna@bluebird.demo' },
  { firstName: 'Marcus', lastName: 'Devereux', email: 'marcus@bluebird.demo' },
  { firstName: 'Elodie', lastName: 'Bergstrom', email: 'elodie@bluebird.demo' },
  { firstName: 'Griffin', lastName: 'Nakamura', email: 'griffin@bluebird.demo' },
];
