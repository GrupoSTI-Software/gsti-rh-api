import vine from '@vinejs/vine'

/**
 * Cuerpo de la petición `POST /api/business-units`.
 *
 * Restricciones por spec-USRH1787932877001.md §10:
 * - `businessUnitName` / `businessUnitLegalName`: texto libre, sanitizado con `.trim()`.
 * - Sin `businessUnitId`, `businessUnitSlug`, `businessUnitPublicId` ni `companyId`:
 *   el servicio los asigna internamente.
 * - `contractedEmployees` llega en bloques de 10 mínimo 10; la regla la aplica el servicio.
 */
export const createAdditionalBusinessUnitValidator = vine.compile(
  vine.object({
    businessUnitName: vine.string().trim().minLength(1).maxLength(200),
    businessUnitLegalName: vine.string().trim().minLength(1).maxLength(250).optional(),
    billingPlanId: vine.number().positive().withoutDecimals(),
    contractedEmployees: vine.number().positive().withoutDecimals(),
  })
)
