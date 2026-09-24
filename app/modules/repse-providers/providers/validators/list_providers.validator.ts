import vine from '@vinejs/vine'
import { positiveIdField } from './create_provider.validator.js'

/** Largo máximo del término de búsqueda `q` del listado. */
export const LIST_PROVIDERS_SEARCH_MAX_LENGTH = 150

/**
 * Listado paginado. `businessUnitId` es opcional: sin él se listan todas las
 * unidades permitidas del tenant (aislamiento aplicado igual en el service).
 */
export const listProveedoresRepseValidator = vine.compile(
  vine.object({
    page: vine.number().min(1),
    limit: vine.number().min(1).max(500),
    businessUnitId: positiveIdField.optional(),
    /** Búsqueda por razón social o folio (parcial) y por RFC (solo exacto). */
    q: vine.string().trim().maxLength(LIST_PROVIDERS_SEARCH_MAX_LENGTH).optional(),
  })
)
