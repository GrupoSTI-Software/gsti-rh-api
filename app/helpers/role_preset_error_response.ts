import type { HttpContext } from '@adonisjs/core/http'
import { ROLE_PRESET_ERROR_CODES } from '#constants/role_preset_error_codes'
import { RolePresetServiceError } from '#exceptions/role_preset_service_error'

const MESSAGE_KEYS: Record<string, [string, string]> = {
  [ROLE_PRESET_ERROR_CODES.MISSING_PERMISSIONS]: [
    'role_preset_missing_permissions_title',
    'role_preset_missing_permissions_detail',
  ],
  [ROLE_PRESET_ERROR_CODES.STALE_PRESET_VERSION]: [
    'role_preset_stale_version_title',
    'role_preset_stale_version_detail',
  ],
  [ROLE_PRESET_ERROR_CODES.STALE_ROLE_PERMISSIONS]: [
    'role_preset_stale_role_title',
    'role_preset_stale_role_detail',
  ],
  [ROLE_PRESET_ERROR_CODES.APPLY_FAILED]: [
    'role_preset_apply_failed_title',
    'role_preset_apply_failed_detail',
  ],
}

export interface RolePresetErrorResponse {
  status: number
  body: {
    title: string
    detail: string
    key: string | undefined
    data: Record<string, unknown> | undefined
  }
}

/**
 * Traduce un `RolePresetServiceError` al contrato HTTP del cliente. Vive fuera
 * del controller de plantillas porque el alta de rol con plantilla
 * (`RoleController.store`) aplica el mismo servicio y debe responder con el
 * mismo estatus y las mismas llaves, no con un 500 genérico.
 */
export function buildRolePresetErrorResponse(
  error: RolePresetServiceError,
  i18n: HttpContext['i18n']
): RolePresetErrorResponse {
  const keys = MESSAGE_KEYS[error.code]
  const messages = keys
    ? { title: i18n.formatMessage(keys[0]), detail: i18n.formatMessage(keys[1]) }
    : { title: error.title ?? error.message, detail: error.detail ?? error.message }

  return {
    status: error.httpStatus,
    body: {
      title: messages.title,
      detail: messages.detail,
      key: error.key,
      data: error.data,
    },
  }
}
