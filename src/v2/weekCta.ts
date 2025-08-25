// Centralized banner copy + CTA for the weekly panel (V2)
import { formatInTimeZone } from 'date-fns-tz';
import type { StaffStatus, LocationWeekContext } from '@/lib/locationState';

type BannerCTA = { label: string; to: string };
export type BannerCopy = { message: string; cta?: BannerCTA };

function fmt(dt: Date, tz: string, pattern = "EEE h:mm a") {
  try { return formatInTimeZone(dt, tz, pattern); } catch { return ''; }
}

export function buildWeekBanner(args: {
  status: StaffStatus;
  location: LocationWeekContext;
  now?: Date;
}): BannerCopy {
  const { status, location } = args;
  const { anchors, timezone } = location;
  const confDue = fmt(anchors.confidence_deadline, timezone);
  const perfDue = fmt(anchors.performance_deadline, timezone);

  switch (status.state) {
    case 'can_checkin':
      return {
        message: `Welcome back! Time to set your confidence for this week's Pro Moves.`,
        cta: { label: 'Rate Confidence', to: '/confidence/current/step/1' }
      };

    case 'missed_checkin':
      return {
        message: `Looks like confidence is late for this week — no worries. You can still record it now.`,
        cta: { label: 'Rate Confidence', to: '/confidence/current/step/1' }
      };

    case 'wait_for_thu':
      return {
        message: `Thanks for submitting your confidence. Come back Thursday (${fmt(anchors.checkout_open, timezone)}) to rate your performance.`,
        cta: { label: 'Rate Performance', to: '/performance/current/step/1' }
      };

    case 'can_checkout':
      return {
        message: `Time to reflect. Rate your performance for this week's Pro Moves.`,
        cta: { label: 'Rate Performance', to: '/performance/current/step/1' }
      };

    case 'missed_checkout':
      return {
        message: `Performance is late for this week — add it now to wrap things up.`,
        cta: { label: 'Rate Performance', to: '/performance/current/step/1' }
      };

    case 'done':
      return {
        message: `Nice work! You're all set for this week.`
      };

    case 'no_assignments':
      return {
        message: `No Pro Moves configured for this week. Please contact your administrator.`
      };

    case 'onboarding':
      return {
        message: `You're in onboarding — Pro Moves will appear once you're ready.`
      };

    default:
      return {
        message: `Review your Pro Moves below.`
      };
  }
}
