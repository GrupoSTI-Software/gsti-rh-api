import { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import Role from '#models/role'
import RolePresetService from '#services/role_preset_service'
import { RolePresetServiceError } from '#exceptions/role_preset_service_error'
import { ROLE_PRESET_ERROR_CODES } from '#constants/role_preset_error_codes'
import { isSystemRoleLockedForUser } from '#helpers/system_role_lock'
import { rolePresetApplyValidator, rolePresetPreviewValidator } from '#validators/role_preset'

export default class RolePresetController {
  async index({ response }: HttpContext) {
    const service = new RolePresetService()
    response.status(200)

    return {
      type: 'success',
      data: { presets: service.list() },
    }
  }

  async preview({ auth, request, response, i18n }: HttpContext) {
    try {
      const data = await request.validateUsing(rolePresetPreviewValidator)
      const role = await this.loadRole(request.param('roleId'))

      if (!role) {
        response.status(404)
        return {
          title: i18n.formatMessage('role_preset_stale_role_title'),
          detail: i18n.formatMessage('role_preset_stale_role_detail'),
          key: 'rol-no-encontrado',
          data: { roleId: request.param('roleId') },
        }
      }

      if (await isSystemRoleLockedForUser(auth, role)) {
        response.status(403)
        return {
          title: i18n.formatMessage('system_role_locked_title'),
          detail: i18n.formatMessage('system_role_locked_detail'),
          key: 'rol-sistema-bloqueado',
        }
      }

      const preview = await new RolePresetService().preview(role.roleId, data.presetSlug, data.mode)
      response.status(200)
      return {
        type: 'success',
        data: { preview },
      }
    } catch (error) {
      return this.handleError(error, response, i18n)
    }
  }

  async apply({ auth, request, response, i18n }: HttpContext) {
    try {
      const data = await request.validateUsing(rolePresetApplyValidator)
      const role = await this.loadRole(request.param('roleId'))

      if (!role) {
        response.status(404)
        return {
          title: i18n.formatMessage('role_preset_stale_role_title'),
          detail: i18n.formatMessage('role_preset_stale_role_detail'),
          key: 'rol-no-encontrado',
          data: { roleId: request.param('roleId') },
        }
      }

      if (await isSystemRoleLockedForUser(auth, role)) {
        response.status(403)
        return {
          title: i18n.formatMessage('system_role_locked_title'),
          detail: i18n.formatMessage('system_role_locked_detail'),
          key: 'rol-sistema-bloqueado',
        }
      }

      const result = await db.transaction((trx) =>
        new RolePresetService().apply(role.roleId, data, trx)
      )
      response.status(201)
      return {
        type: 'success',
        data: result,
      }
    } catch (error) {
      return this.handleError(error, response, i18n)
    }
  }

  private async loadRole(roleId: string | undefined): Promise<Role | null> {
    return Role.query().whereNull('role_deleted_at').where('role_id', roleId ?? '').first()
  }

  private handleError(
    error: unknown,
    response: HttpContext['response'],
    i18n: HttpContext['i18n']
  ) {
    if (error instanceof RolePresetServiceError) {
      response.status(error.httpStatus)
      const messages = this.messagesForError(error, i18n)
      return {
        title: messages.title,
        detail: messages.detail,
        key: error.key,
        data: error.data,
      }
    }

    if (this.isValidationError(error)) {
      response.status(422)
      return {
        title: i18n.formatMessage('role_preset_invalid_input_title'),
        detail: error.messages?.[0]?.message,
        key: 'entrada-invalida',
      }
    }

    response.status(500)
    return {
      title: i18n.formatMessage('role_preset_apply_failed_title'),
      detail: i18n.formatMessage('role_preset_apply_failed_detail'),
      key: 'aplicacion-plantilla-fallida',
    }
  }

  private messagesForError(
    error: RolePresetServiceError,
    i18n: HttpContext['i18n']
  ): { title: string; detail: string } {
    const messageKeys: Record<string, [string, string]> = {
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
    const keys = messageKeys[error.code]
    return keys
      ? { title: i18n.formatMessage(keys[0]), detail: i18n.formatMessage(keys[1]) }
      : { title: error.title ?? error.message, detail: error.detail ?? error.message }
  }

  private isValidationError(
    error: unknown
  ): error is { code: string; messages?: { message: string }[] } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'E_VALIDATION_ERROR'
    )
  }
}
