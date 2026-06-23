import type { HttpContext } from '@adonisjs/core/http'
import type { I18n } from '@adonisjs/i18n'
import User from '#models/user'
import { ComplaintServiceError } from '#exceptions/complaint_service_error'
import { COMPLAINT_ERROR_CODES } from '#constants/complaint_error_codes'
import { resolveComplaintApiError } from '../helpers/complaint_api_error.js'

/**
 * Utilidades HTTP del módulo de quejas: respuestas de error y autorización de revelación.
 */
export default class ComplaintApiService {
  /** Convierte una excepción en el cuerpo estándar de error del módulo. */
  respondError(
    error: unknown,
    response: HttpContext['response'],
    fallbackStatus: number,
    i18n: I18n
  ) {
    const resolved = resolveComplaintApiError(error, fallbackStatus, i18n)
    response.status(resolved.status)
    return {
      type: 'error',
      title: resolved.title,
      message: resolved.message,
      key: resolved.key,
      detail: resolved.detail,
      code: resolved.errorCode,
      data: null,
    }
  }

  /** Solo el rol root puede revelar identidad o consultar su historial. */
  async assertRevealIdentityPermission(user: User): Promise<void> {
    await user.load('role')

    if (user.role?.roleSlug === 'root') {
      return
    }

    throw ComplaintServiceError.withMessageKey(
      'complaint_reveal_forbidden',
      COMPLAINT_ERROR_CODES.REVEAL_FORBIDDEN,
      403,
      'reveal-permission-denied'
    )
  }
}
