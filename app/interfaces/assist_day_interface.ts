import { DateTime } from 'luxon'
import { AssistInterface } from './assist_interface.js'
import { ShiftInterface } from './shift_interface.js'
import { HolidayInterface } from './holiday_interface.js'
import { ShiftExceptionInterface } from './shift_exception_interface.js'

interface AssistDayInterface {
  day: string
  assist: {
    checkIn: AssistInterface | null
    checkOut: AssistInterface | null
    checkEatIn: AssistInterface | null
    checkEatOut: AssistInterface | null
    dateShift: ShiftInterface | null
    dateShiftApplySince: string | Date | null
    employeeShiftId: number | null
    shiftCalculateFlag: string
    checkInDateTime: DateTime | null
    checkOutDateTime: DateTime | null
    checkInStatus: string
    checkOutStatus: string
    isFutureDay: boolean
    isSundayBonus: boolean
    isRestDay: boolean
    isVacationDate: boolean
    isWorkDisabilityDate: boolean
    isHoliday: boolean
    isBirthday: boolean
    holiday: HolidayInterface | null
    workHoliday?: HolidayInterface | null
    hasExceptions: boolean
    exceptions: ShiftExceptionInterface[]
    assitFlatList?: AssistInterface[]
    isCheckOutNextDay?: boolean
    isCheckOutEatNextDay?: boolean
    isCheckInEatNextDay?: boolean
    hasAssitFlatList?: boolean
    employeeId?: number
  }
}

export type { AssistDayInterface }
