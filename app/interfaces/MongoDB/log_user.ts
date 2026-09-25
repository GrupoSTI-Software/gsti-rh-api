import User from '#models/user'
import { Actions } from './enum/actions.js'

interface LogUser {
  user_id: number
  action: Actions
  user_agent: string
  sec_ch_ua_platform: string
  sec_ch_ua: string
  origin: string
  date: string
  record_previous: User
  record_current: User
  /**
   * Correo personal del expediente antes de que el espejo lo sobrescribiera
   * (USRH1789698261612, LFPDPPP art. 11). Nunca va a la respuesta ni al logger.
   */
  record_previous_person_email?: string
}
export type { LogUser }
