// Canonical coaching session status labels, colors, and next actions.
// Import this everywhere instead of defining local maps — this is the single
// source of truth for how a session's status is described in the UI.

export interface SessionStatusConfig {
  label: string;
  className: string;
  /** Short verb phrase describing what the CD should do next */
  nextAction: string;
}

// DSN-3 slice 2: 5 of the 7 pipeline stages map onto existing --status-*
// tokens (amber "attention" reuse, complete). `scheduling_invite_sent`
// (sky) and `meeting_pending` (purple) are left as hardcoded palette
// classes on purpose — neither fits an existing token, and collapsing both
// onto e.g. --status-released would make two distinct pipeline stages
// visually indistinguishable, which is the whole point of this map. Flagged
// for a future ticket to consider dedicated info/highlight tokens rather
// than inventing one here.
export const SESSION_STATUS_CONFIG: Record<string, SessionStatusConfig> = {
  scheduled:                  { label: 'Draft',              className: 'bg-muted text-muted-foreground',                                                                       nextAction: 'Build agenda' },
  director_prep_ready:        { label: 'Agenda Ready',       className: 'bg-[hsl(var(--status-late-bg))] text-[hsl(var(--status-late))]',                                        nextAction: 'Send to doctor' },
  scheduling_invite_sent:     { label: 'Invite Sent',        className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400',                                          nextAction: "Awaiting doctor's response" },
  doctor_prep_submitted:      { label: 'Doctor Prepped',     className: 'bg-[hsl(var(--status-complete-bg))] text-[hsl(var(--status-complete))]',                                 nextAction: 'Ready for meeting' },
  meeting_pending:            { label: 'Summary Shared',     className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',                              nextAction: 'Doctor can review the summary' },
  doctor_confirmed:           { label: 'Completed',          className: 'bg-[hsl(var(--status-complete-bg))] text-[hsl(var(--status-complete))]',                                 nextAction: 'Schedule next session' },
  doctor_revision_requested:  { label: 'Doctor Left a Note', className: 'bg-[hsl(var(--status-late-bg))] text-[hsl(var(--status-late))]',                                         nextAction: "Review the doctor's note" },
};

export const DEFAULT_STATUS: SessionStatusConfig = { label: 'Unknown', className: 'bg-muted text-muted-foreground', nextAction: '' };

export function getSessionStatusConfig(status: string): SessionStatusConfig {
  return SESSION_STATUS_CONFIG[status] || DEFAULT_STATUS;
}
