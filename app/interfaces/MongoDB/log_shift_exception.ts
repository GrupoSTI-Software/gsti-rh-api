import ShiftException from '#models/shift_exception'
import { Actions } from './enum/actions.js'

interface LogShiftException {
  user_id: number
  action: Actions
  user_agent: string
  sec_ch_ua_platform: string
  sec_ch_ua: string
  origin: string
  date: string
  employeeShiftId?: number | null
  record_previous: ShiftException
  record_current: ShiftException
}
export type { LogShiftException }
