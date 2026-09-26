import type { I18n } from '@adonisjs/i18n'
import {
  ACCESS_POINT_EMPLOYEE_ERROR_CODES,
  type AccessPointEmployeeErrorCode,
} from '#constants/access_point_employee_error_codes'
import AccessPointEmployeeServiceError from '#exceptions/access_point_employee_service_error'

/**
 * Forma única del error hacia el cliente: el BO ramifica por `key` y nunca por
 * el texto de `detail`; `code` queda para trazabilidad.
 */
export type ResolvedAccessPointEmployeeApiError = {
  status: number
  title: string
  detail: string
  key: string
  code: AccessPointEmployeeErrorCode
}

/**
 * Convierte cualquier excepción de la asignación de empleados a puntos de
 * acceso en la respuesta estable `{ title, detail, key, code }`.
 *
 * Dictamen de códigos: 400 validación, 404 fuera de alcance, 409 conflicto,
 * 403 sin permiso, 500 no clasificado.
 *
 * @param error Excepción capturada por el controlador.
 * @param i18n Traductor de la petición.
 * @returns El error ya resuelto y localizado.
 */
export function resolveAccessPointEmployeeApiError(
  error: unknown,
  i18n: I18n
): ResolvedAccessPointEmployeeApiError {
  const err = error as {
    code?: string
    messages?: Array<{ message?: string }>
  }

  if (err?.code === 'E_VALIDATION_ERROR') {
    return {
      status: 400,
      title: i18n.formatMessage('access_point_employee_val_input_title'),
      detail:
        err.messages?.[0]?.message ??
        i18n.formatMessage('access_point_employee_val_input_message'),
      key: 'datos-invalidos',
      code: ACCESS_POINT_EMPLOYEE_ERROR_CODES.VAL_INPUT,
    }
  }

  if (error instanceof AccessPointEmployeeServiceError) {
    return {
      status: error.httpStatus,
      title: error.title,
      detail: error.message,
      key: error.key,
      code: error.errorCode,
    }
  }

  return {
    status: 500,
    title: i18n.formatMessage('access_point_employee_internal_title'),
    detail: i18n.formatMessage('access_point_employee_internal_message'),
    key: 'error-interno',
    code: ACCESS_POINT_EMPLOYEE_ERROR_CODES.INTERNAL,
  }
}
