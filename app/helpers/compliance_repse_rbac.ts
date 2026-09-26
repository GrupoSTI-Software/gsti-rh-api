import type { HttpContext } from '@adonisjs/core/http'
import RoleService from '#services/role_service'

export type ComplianceRepseAction = 'read' | 'create' | 'update' | 'delete'

export type ComplianceRepseForbiddenResponse = {
  errorCode: string
  i18nPrefix: string
}

/**
 * Verifica permiso granular del módulo REPSE/compliance.
 * Permite la acción si el rol tiene el permiso específico o `gestion`.
 * Root, super-administrador y owner (USRH1783712837561) omiten la verificación:
 * owner queda al menos igual que super-administrador para no perder acceso que
 * ya tenía la cuenta self-service antes de esta HU.
 */
export async function assertComplianceRepsePermission(
  ctx: HttpContext,
  moduleSlug: string,
  action: ComplianceRepseAction,
  forbidden: ComplianceRepseForbiddenResponse
): Promise<boolean> {
  const user = ctx.auth.user!
  await user.preload('role')
  const roleSlug = user.role?.roleSlug
  if (roleSlug === 'root' || roleSlug === 'super-administrador' || roleSlug === 'owner') {
    return true
  }

  const roleService = new RoleService()
  const hasAction = await roleService.hasAccess(user.roleId, moduleSlug, action)
  const hasGestion = await roleService.hasAccess(user.roleId, moduleSlug, 'gestion')
  if (hasAction || hasGestion) {
    return true
  }

  const isRead = action === 'read'
  const titleKey = isRead
    ? `${forbidden.i18nPrefix}_forbidden_read_title`
    : `${forbidden.i18nPrefix}_forbidden_write_title`
  const messageKey = isRead
    ? `${forbidden.i18nPrefix}_forbidden_read_message`
    : `${forbidden.i18nPrefix}_forbidden_write_message`
  const titleFallback = isRead ? 'Sin permiso de consulta' : 'Sin permiso'
  const messageFallback = isRead
    ? 'No tienes permiso para consultar este módulo.'
    : 'No tienes permiso para realizar esta operación.'

  ctx.response.status(403).json({
    type: 'error',
    title: ctx.i18n.t(titleKey, undefined, titleFallback),
    message: ctx.i18n.t(messageKey, undefined, messageFallback),
    key: 'sin-permiso',
    errorCode: forbidden.errorCode,
    data: null,
  })
  return false
}
