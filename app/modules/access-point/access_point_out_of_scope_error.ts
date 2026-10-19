import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import { AdmsError } from '#exceptions/adms_error'

/**
 * Checador fuera del alcance de la empresa (VLRH-P0065, 6).
 *
 * No lleva texto propio: `resolveAdmsApiError` le pone el titulo y el detalle
 * i18n del 404 del checador (`adms_not_found_*`). Lo lanzan la autorizacion
 * del Backoffice y la revalidacion bajo candado del alta y del PIN, asi que
 * "nunca lo vio" y "dejo de participar mientras tanto" son el mismo error.
 */
export class AccessPointOutOfScopeError extends AdmsError {
  constructor() {
    super(
      'punto-acceso-no-encontrado',
      ADMS_ERROR_CODES.AUTHZ_OUT_OF_SCOPE,
      404,
      'punto-acceso-no-encontrado'
    )
    this.name = 'AccessPointOutOfScopeError'
  }
}
