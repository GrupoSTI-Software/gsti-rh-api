import AccessPoint from '#models/access_point'
import { Actions } from './enum/actions.js'

interface LogAccessPoint {
  user_id: number
  action: Actions
  user_agent: string
  sec_ch_ua_platform: string
  sec_ch_ua: string
  origin: string
  date: string
  record_previous?: AccessPoint
  record_current: AccessPoint
}
export type { LogAccessPoint }
