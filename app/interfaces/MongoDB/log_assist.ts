/** Solo tipado del snapshot en bitácora Mongo; sin escritura directa a `assists`. */
import Assist from '#models/assist'
import { Actions } from './enum/actions.js'
import type { AssistCreateFrom } from '#constants/assist_origin'

interface LogAssist {
  user_id: number
  action: Actions // este es el enum
  user_agent: string
  sec_ch_ua_platform: string
  sec_ch_ua: string
  origin: string
  date: string
  create_from: AssistCreateFrom
  employeeShiftId?: number | null
  record_previous: Assist
  record_current: Assist
}
export type { LogAssist }
