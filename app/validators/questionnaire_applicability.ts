import vine from '@vinejs/vine'

/**
 * Filtros del listado de aplicabilidad NOM-035.
 *
 * `businessUnitId` / `companyId` se validan como enteros internos porque el
 * middleware `businessScope` ya resolvió el UUID v4 (header / query) al ID
 * numérico antes de llegar al controller. `companyId` es alias legacy.
 */
export const questionnaireApplicabilityFilterValidator = vine.compile(
  vine.object({
    businessUnitId: vine.number().positive().optional(),
    companyId: vine.number().positive().optional(),
  })
)
