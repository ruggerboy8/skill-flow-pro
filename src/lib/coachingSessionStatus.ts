// Canonical coaching session status labels and colors.
// Import this everywhere instead of defining local maps.

export interface SessionStatusConfig {
  label: string;
  className: string;
}

export const SESSION_STATUS_CONFIG: Record<string, SessionStatusConfig> = {
  scheduled:                  { label: 'Draft',              className: 'bg-muted text-muted-foreground' },
  director_prep_ready:        { label: 'Agenda Ready',       className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  scheduling_invite_sent:     { label: 'Invite Sent',        className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400' },
  doctor_prep_submitted:      { label: 'Doctor Prepped',     className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  meeting_pending:            { label: 'Summary Shared',     className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  doctor_confirmed:           { label: 'Completed',          className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  doctor_revision_requested:  { label: 'Doctor Left a Note', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
};

export const DEFAULT_STATUS: SessionStatusConfig = { label: 'Unknown', className: 'bg-muted text-muted-foreground' };

export function getSessionStatusConfig(status: string): SessionStatusConfig {
  return SESSION_STATUS_CONFIG[status] || DEFAULT_STATUS;
}
