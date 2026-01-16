import EmployeeShiftChange from '#models/employee_shift_changes'
import { Actions } from './enum/actions.js'

interface LogEmployeeShiftChange {
  user_id: number
  action: Actions
  user_agent: string
  sec_ch_ua_platform: string
  sec_ch_ua: string
  origin: string
  date: string
  employeeShiftId?: number | null
  record_previous: EmployeeShiftChange
  record_current: EmployeeShiftChange
}
export type { LogEmployeeShiftChange }
