import vine from '@vinejs/vine'
import { positiveIdField } from './create_provider.validator.js'

/**
 * Listado paginado. `businessUnitId` es opcional: sin él se listan todas las
 * unidades permitidas del tenant (aislamiento aplicado igual en el service).
 */
export const listProveedoresRepseValidator = vine.compile(
  vine.object({
    page: vine.number().min(1),
    limit: vine.number().min(1).max(500),
    businessUnitId: positiveIdField.optional(),
  })
)
