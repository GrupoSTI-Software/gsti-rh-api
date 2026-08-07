import { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import Role from '#models/role'
import RolePresetService from '#services/role_preset_service'
import RoleService from '#services/role_service'
import { RolePresetServiceError } from '#exceptions/role_preset_service_error'
import { buildRolePresetErrorResponse } from '#helpers/role_preset_error_response'
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

  async preview({ auth, request, response, businessUnitScope, i18n }: HttpContext) {
    try {
      const data = await request.validateUsing(rolePresetPreviewValidator)
      const role = await this.loadRole(request.param('roleId'), businessUnitScope)

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

  async apply({ auth, request, response, businessUnitScope, i18n }: HttpContext) {
    try {
      const data = await request.validateUsing(rolePresetApplyValidator)
      const role = await this.loadRole(request.param('roleId'), businessUnitScope)

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

  /**
   * Resuelve el rol del path acotado al tenant de la petición: un rol de otra
   * empresa responde 404 igual que uno inexistente. Los roles de sistema siguen
   * siendo alcanzables (y quedan bloqueados después para quien no es `root`).
   */
  private async loadRole(
    roleId: string | undefined,
    businessUnitScope: number[]
  ): Promise<Role | null> {
    const parsedRoleId = Number(roleId)
    if (!Number.isInteger(parsedRoleId) || parsedRoleId <= 0) {
      return null
    }

    return new RoleService().findRoleByIdInScope(parsedRoleId, businessUnitScope)
  }

  private handleError(
    error: unknown,
    response: HttpContext['response'],
    i18n: HttpContext['i18n']
  ) {
    if (error instanceof RolePresetServiceError) {
      const mapped = buildRolePresetErrorResponse(error, i18n)
      response.status(mapped.status)
      return mapped.body
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
