import ProceedingFile from '#models/proceeding_file'
import { Actions } from './enum/actions.js'

interface LogProceedingFile {
  user_id: number
  action: Actions
  user_agent: string
  sec_ch_ua_platform: string
  sec_ch_ua: string
  origin: string
  date: string
  record_previous: ProceedingFile
  record_current: ProceedingFile
}
export type { LogProceedingFile }

