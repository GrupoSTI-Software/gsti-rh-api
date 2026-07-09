import type { HttpContext } from '@adonisjs/core/http'
import RoleService from '#services/role_service'

export type ConsentEvidenceAction = 'read' | 'reveal'

export type ConsentEvidenceForbiddenResponse = {
  errorCode: string
  i18nPrefix: string
}

/**
 * Reserva de plataforma para la evidencia de aceptaciones (USRH1783368377327, regla 1):
 * exclusiva del rol `root`; ninguna empresa cliente accede, incluido `super-administrador`
 * (rol de "Director general" de una empresa cliente — ver
 * `app/modules/demo/factories/user_factory.ts:41` — NO es un rol de plataforma GSTI).
 *
 * A propósito NO reutiliza `assertComplianceRepsePermission` (`compliance_repse_rbac.ts`):
 * ese helper hace bypass también para `super-administrador`, lo que filtraría evidencia
 * GLOBAL (todas las empresas) a un director de empresa cliente — viola la regla 1.
 *
 * `RoleService.hasAccess` solo hace bypass automático para `roleSlug === 'root'`; como el
 * permiso `consent-evidence` se siembra únicamente al rol `root`, cualquier otro rol
 * (incluido `super-administrador`) recibe 403 aunque tuviera permisos en otros módulos.
 */
export async function assertConsentEvidenceAccess(
  ctx: HttpContext,
  action: ConsentEvidenceAction,
  forbidden: ConsentEvidenceForbiddenResponse
): Promise<boolean> {
  const user = ctx.auth.user!

  const roleService = new RoleService()
  const hasAccess = await roleService.hasAccess(user.roleId, 'consent-evidence', action)
  if (hasAccess) {
    return true
  }

  const { i18n } = ctx
  ctx.response.status(403).json({
    type: 'error',
    title: i18n.t(`${forbidden.i18nPrefix}_forbidden_read_title`, undefined, 'Sin permiso'),
    message: i18n.t(
      `${forbidden.i18nPrefix}_forbidden_read_message`,
      undefined,
      'No tienes permiso para consultar este módulo.'
    ),
    key: 'sin-permiso',
    errorCode: forbidden.errorCode,
    data: null,
  })
  return false
}
