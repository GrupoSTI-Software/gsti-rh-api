import EmployeeZone from '#models/employee_zone'
import { Actions } from './enum/actions.js'
import Employee from '#models/employee'
import Zone from '#models/zone'

interface LogEmployeeZone {
  user_id: number
  action: Actions
  user_agent: string
  sec_ch_ua_platform: string
  sec_ch_ua: string
  origin: string
  date: string
  record_previous?: EmployeeZone
  record_current: EmployeeZone
  employee?: Employee
  zone?: Zone
}
export type { LogEmployeeZone }

