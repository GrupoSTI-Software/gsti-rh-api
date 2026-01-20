import Zone from '#models/zone'
import { Actions } from './enum/actions.js'

interface LogZone {
  user_id: number
  action: Actions
  user_agent: string
  sec_ch_ua_platform: string
  sec_ch_ua: string
  origin: string
  date: string
  record_previous?: Zone
  record_current: Zone
}
export type { LogZone }

