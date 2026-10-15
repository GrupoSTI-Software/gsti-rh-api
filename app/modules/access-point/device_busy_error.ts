import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import { AdmsError } from '#exceptions/adms_error'

/**
 * Otra operacion tiene el checador bloqueado y no lo solto a tiempo.
 *
 * No lleva texto propio: `resolveAdmsApiError` le pone el titulo y el detalle
 * i18n (`access_point_device_busy_*`). Es el 409 `equipo-ocupado` que daba el
 * cerrojo con nombre, ahora para la espera del candado del aparato
 * (`inDeviceTransaction`).
 */
export class DeviceBusyError extends AdmsError {
  constructor() {
    super('equipo-ocupado', ADMS_ERROR_CODES.SYS_INTERNAL, 409, 'equipo-ocupado')
    this.name = 'DeviceBusyError'
  }
}
