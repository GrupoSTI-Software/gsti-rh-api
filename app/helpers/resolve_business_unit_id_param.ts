import type { HttpContext } from '@adonisjs/core/http'
import type BusinessAccessScopeService from '#services/business_access_scope_service'

/**
 * Resuelve un parámetro de unidad de negocio en query/body cuando llega como
 * UUID v4 (código público) o entero positivo (legacy). Si está ausente y se
 * proporciona `fallbackId`, lo inyecta en query y body.
 *
 * Misma semántica que `businessUnitId` en `BusinessUnitScopeMiddleware`.
 *
 * @returns `'ok'` si no había param, se resolvió o el entero legacy está en scope;
 *          `'not-in-scope'` si el valor es inválido o fuera del alcance del usuario.
 */
export async function resolveBusinessUnitIdParam(
  ctx: HttpContext,
  scopeService: BusinessAccessScopeService,
  fullScope: number[],
  paramName: string,
  fallbackId?: number
): Promise<'ok' | 'not-in-scope'> {
  const rawQuery = ctx.request.qs()[paramName]
  const rawBody = ctx.request.body()[paramName]
  const candidateRaw = rawQuery ?? rawBody

  if (candidateRaw === undefined || candidateRaw === null || candidateRaw === '') {
    if (fallbackId !== undefined) {
      ctx.request.updateQs({ ...ctx.request.qs(), [paramName]: fallbackId })
      ctx.request.updateBody({ ...ctx.request.body(), [paramName]: fallbackId })
    }
    return 'ok'
  }

  const candidateStr = String(candidateRaw)
  const resolvedFromParam = await scopeService.resolveInternalId(candidateStr, fullScope)

  if (resolvedFromParam !== null) {
    ctx.request.updateQs({ ...ctx.request.qs(), [paramName]: resolvedFromParam })
    ctx.request.updateBody({ ...ctx.request.body(), [paramName]: resolvedFromParam })
    return 'ok'
  }

  const candidateNumber = Number(candidateRaw)
  if (!Number.isInteger(candidateNumber) || candidateNumber <= 0 || !fullScope.includes(candidateNumber)) {
    return 'not-in-scope'
  }

  return 'ok'
}
