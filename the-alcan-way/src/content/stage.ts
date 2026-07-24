// The rooms of the walk-forward world. Each scene (beat) belongs to a room; the
// engine crossfades + dollies between rooms as the family moves through them.
// The journey is out-and-back, so the lobby (front-of-house) is visited twice
// and the hallway is traversed both directions.

export type RoomId = 'lobby' | 'hallway' | 'exam' | 'review'

export interface Room {
  id: RoomId
  label: string
  /** placeholder palette until final perspective art drops in */
  wall: string
  floor: string
}

export const ROOMS: Room[] = [
  { id: 'lobby', label: 'Front of House', wall: 'var(--room-lobby-wall)', floor: 'var(--room-lobby-floor)' },
  { id: 'hallway', label: 'Hallway', wall: 'var(--room-hall-wall)', floor: 'var(--room-hall-floor)' },
  { id: 'exam', label: 'Exam Room', wall: 'var(--room-exam-wall)', floor: 'var(--room-exam-floor)' },
  { id: 'review', label: '', wall: 'var(--room-review-wall)', floor: 'var(--room-review-wall)' },
]
