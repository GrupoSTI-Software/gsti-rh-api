import type { HttpContext } from '@adonisjs/core/http'
import type { I18n } from '@adonisjs/i18n'
import User from '#models/user'
import RoleService from '#services/role_service'
import { ComplaintServiceError } from '#exceptions/complaint_service_error'
import { COMPLAINT_ERROR_CODES } from '#constants/complaint_error_codes'
import {
  COMPLAINT_MODULE_SLUG,
  COMPLAINT_REVEAL_IDENTITY_PERMISSION,
} from '#constants/complaint_identity_reveal'
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

  /** Verifica permiso dedicado `reveal-identity`; operar la bandeja no basta. */
  async assertRevealIdentityPermission(user: User): Promise<void> {
    await user.load('role')

    const roleService = new RoleService()
    const allowed = await roleService.hasAccess(
      user.roleId,
      COMPLAINT_MODULE_SLUG,
      COMPLAINT_REVEAL_IDENTITY_PERMISSION
    )

    if (!allowed) {
      throw ComplaintServiceError.withMessageKey(
        'complaint_reveal_forbidden',
        COMPLAINT_ERROR_CODES.REVEAL_FORBIDDEN,
        403,
        'reveal-permission-denied'
      )
    }
  }
}
