import type { HttpContext } from '@adonisjs/core/http'
import type BusinessAccessScopeService from '#services/business_access_scope_service'

/**
 * Resuelve `companyId` en query/body cuando viene como UUID (alias legacy de
 * `businessUnitId` en módulos NOM035). Si está ausente, no-op.
 *
 * Misma semántica que el param `businessUnitId` del middleware `businessScope`:
 * UUID v4 → id interno; entero positivo en scope → se deja; otro valor → fuera de scope.
 *
 * @returns `'ok'` si no había param o se resolvió; `'not-in-scope'` si el valor es inválido.
 */
export async function resolveLegacyCompanyIdParam(
  ctx: HttpContext,
  scopeService: BusinessAccessScopeService,
  fullScope: number[]
): Promise<'ok' | 'not-in-scope'> {
  const rawCompanyQuery = ctx.request.qs().companyId
  const rawCompanyBody = ctx.request.body().companyId
  const companyRaw = rawCompanyQuery ?? rawCompanyBody

  if (companyRaw === undefined || companyRaw === null || companyRaw === '') {
    return 'ok'
  }

  const companyStr = String(companyRaw)
  const resolvedCompany = await scopeService.resolveInternalId(companyStr, fullScope)

  if (resolvedCompany !== null) {
    ctx.request.updateQs({ ...ctx.request.qs(), companyId: resolvedCompany })
    ctx.request.updateBody({ ...ctx.request.body(), companyId: resolvedCompany })
    return 'ok'
  }

  const companyNumber = Number(companyRaw)
  if (!Number.isInteger(companyNumber) || companyNumber <= 0 || !fullScope.includes(companyNumber)) {
    return 'not-in-scope'
  }

  return 'ok'
}
