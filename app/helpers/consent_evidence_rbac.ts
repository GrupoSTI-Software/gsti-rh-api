import type { HttpContext } from '@adonisjs/core/http'

export type ConsentEvidenceAction = 'read' | 'reveal'

export type ConsentEvidenceForbiddenResponse = {
  errorCode: string
  i18nPrefix: string
}

/**
 * Reserva de plataforma para la evidencia de aceptaciones (USRH1783368377327, regla 1):
 * exclusiva del rol `root`; ninguna empresa cliente accede, incluido `super-administrador`
 * (rol de "Director general" de una empresa cliente — ver
 * `app/modules/demo/factories/user_factory.ts:41` — NO es un rol de plataforma GSTI)
 * ni `owner` (USRH1783712837561, mismo caso: rol de empresa cliente, acotado a su tenant).
 *
 * A propósito NO reutiliza `assertComplianceRepsePermission` (`compliance_repse_rbac.ts`):
 * ese helper hace bypass también para `super-administrador`/`owner`, lo que filtraría
 * evidencia GLOBAL (todas las empresas) a un rol de empresa cliente — viola la regla 1.
 *
 * A propósito tampoco delega en `RoleService.hasAccess`: desde USRH1783712837561 ese
 * gate también hace bypass para `owner` (además de `root`), y esta reserva es GLOBAL
 * entre empresas — delegar filtraría evidencia de todas las empresas al owner de una
 * sola, rompiendo el aislamiento de tenant que es la regla central de esa HU. Por eso
 * el chequeo de rol es explícito y local: solo `root` pasa.
 */
export async function assertConsentEvidenceAccess(
  ctx: HttpContext,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- se conserva por compatibilidad de firma con los callers existentes.
  _action: ConsentEvidenceAction,
  forbidden: ConsentEvidenceForbiddenResponse
): Promise<boolean> {
  const user = ctx.auth.user!
  await user.preload('role')

  if (user.role?.roleSlug === 'root') {
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
