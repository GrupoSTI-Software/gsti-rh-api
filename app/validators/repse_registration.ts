import vine from '@vinejs/vine'

const REPSE_STATUS_VALUES = ['active'] as const

/**
 * Folio REPSE: cadena alfanumérica con guiones, máximo 50 caracteres.
 * Se restringe el set de caracteres para evitar inyección y caracteres
 * exóticos no documentados por la STPS.
 */
const folioField = vine
  .string()
  .trim()
  .minLength(1)
  .maxLength(50)
  .regex(/^[A-Za-z0-9-]+$/)

const repseStatusField = vine.enum(REPSE_STATUS_VALUES)

/**
 * Identificador positivo estricto: `vine.number().positive()` acepta `0`
 * porque sólo descarta negativos; usamos `.min(1)` para asegurar `> 0`.
 */
const positiveIdField = vine.number().min(1)

/**
 * Listado paginado por empresa.
 *
 * - `page` y `limit` son requeridos por contrato (límite máx 500 alineado al
 *   patrón general de los catálogos).
 * - `businessUnitId` es requerido: el contrato del HU dice "filtrando por
 *   businessUnitId" para asegurar que cada cliente vea sólo registros de su
 *   empresa.
 */
export const repseRegistrationListValidator = vine.compile(
  vine.object({
    page: vine.number().min(1),
    limit: vine.number().min(1).max(500),
    businessUnitId: positiveIdField,
  })
)

/**
 * Alta de un registro REPSE.
 *
 * - Coherencia estricta de fechas: `expiresAt` debe ser posterior a
 *   `registeredAt` (validación inicial vía `afterField`; el service la
 *   reconfirma sobre el set fusionado).
 */
export const createRepseRegistrationValidator = vine.compile(
  vine.object({
    businessUnitId: positiveIdField,
    folio: folioField,
    registeredAt: vine.date({ formats: ['YYYY-MM-DD'] }),
    expiresAt: vine.date({ formats: ['YYYY-MM-DD'] }).afterField('registeredAt'),
    status: repseStatusField.optional(),
  })
)

/**
 * Edición parcial. Cualquier subconjunto de campos es válido.
 *
 * La coherencia (expiresAt > registeredAt) y la unicidad de `folio` se
 * evalúan en el service fusionando el payload con los valores actuales del
 * registro.
 */
export const updateRepseRegistrationValidator = vine.compile(
  vine.object({
    businessUnitId: positiveIdField.optional(),
    folio: folioField.optional(),
    registeredAt: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    expiresAt: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    status: repseStatusField.optional(),
  })
)
