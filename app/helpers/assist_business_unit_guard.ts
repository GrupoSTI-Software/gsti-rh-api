import { ASSIST_ERROR_CODES } from '#constants/assist_error_codes'
import { AssistError } from '#exceptions/assist_error'
import { TenantContext } from '#utils/tenant_context'

/**
 * Resuelve la empresa dueña de una checada, fail-closed (USRH1786554648211, regla 5).
 *
 * Único emisor del rechazo `empresa-de-la-checada-no-resuelta` / `AST.VAL.001`: lo
 * comparten el hook `@beforeCreate` de `Assist` y el repositorio del motor de ingesta,
 * de modo que los dos caminos respondan exactamente el mismo triplete.
 *
 * El mixin `withBusinessUnitScope` sólo cubre lectura y es fail-OPEN sin contexto
 * activo, así que la escritura no puede apoyarse en él: o la empresa llega explícita,
 * o sale del alcance activo, o no se escribe.
 *
 * @param explicit Empresa ya resuelta por el llamador. Si viene, nunca se pisa.
 */
export function resolveAssistBusinessUnitId(explicit?: number | null): number {
  if (explicit) return explicit

  const [businessUnitId] = TenantContext.getScope()
  if (!businessUnitId) {
    throw new AssistError(
      'Empresa de la checada no resuelta',
      ASSIST_ERROR_CODES.TENANT_UNRESOLVED,
      422,
      'empresa-de-la-checada-no-resuelta',
      'La checada no trae empresa y no hay una unidad activa en el alcance.'
    )
  }
  return businessUnitId
}
