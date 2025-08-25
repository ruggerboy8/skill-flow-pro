// V2 location-based state computation
// Currently re-exports v1 functionality until refactored

export { 
  getLocationWeekContext,
  isEligibleForProMoves,
  getOnboardingWeeksLeft,
  assembleWeek,
  computeWeekState
} from '@/lib/locationState';

export type { 
  WeekState, 
  LocationWeekContext, 
  StaffStatus 
} from '@/lib/locationState';