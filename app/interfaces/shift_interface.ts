import { DateTime } from 'luxon'

interface ShiftInterface {
  shiftId: number | null
  shiftName: string
  shiftCalculateFlag?: string | null
  shiftDayStart: number | null
  shiftTimeStart: string
  shiftActiveHours: number
  shiftRestDays: string
  shiftAccumulatedFault: number
  shiftLunchTime: number | null
  shiftCompensableLunchSchedule: number | null
  shiftIsChange?: boolean
  shiftCreatedAt: Date | DateTime | string | null
  shiftUpdatedAt: Date | DateTime | string | null
  shiftDeletedAt?: Date | DateTime | string | null
}

export type { ShiftInterface }
