import vine from '@vinejs/vine'

const REPSE_SPECIALIZED_SERVICE_STATUS_VALUES = ['active'] as const

/**
 * Identificador positivo estricto: `vine.number().positive()` acepta `0`,
 * por lo que usamos `.min(1)` para asegurar `> 0`.
 */
const positiveIdField = vine.number().min(1)

/**
 * Nombre del servicio especializado (3–150 caracteres). Se aplica `trim()`
 * para evitar nombres con espacios sólo en los bordes.
 */
const nameField = vine.string().trim().minLength(3).maxLength(150)

/**
 * Descripción del objeto del servicio. La HU la incluye en el contrato de
 * creación como obligatoria, por lo que validamos al menos un carácter
 * (almacenamiento subyacente: TEXT, sin tope superior arbitrario).
 */
const objectDescriptionField = vine.string().trim().minLength(1)

const repseSpecializedServiceStatusField = vine.enum(REPSE_SPECIALIZED_SERVICE_STATUS_VALUES)

/**
 * Listado paginado por registro REPSE padre.
 *
 * - `page` y `limit` requeridos (límite máx 500 alineado al patrón general).
 * - `repseRegistrationId` requerido: la HU dice "filtrando por
 *   repseRegistrationId" para que cada cliente vea sólo el catálogo del
 *   registro REPSE que le corresponde.
 */
export const repseSpecializedServiceListValidator = vine.compile(
  vine.object({
    page: vine.number().min(1),
    limit: vine.number().min(1).max(500),
    repseRegistrationId: positiveIdField,
  })
)

/**
 * Alta de un servicio especializado.
 *
 * - `repseRegistrationId`, `name` y `objectDescription` son obligatorios
 *   según el criterio de aceptación 1 de la HU.
 * - `status` es opcional: si no se envía el servicio asume `active` en la
 *   capa de servicio.
 */
export const createRepseSpecializedServiceValidator = vine.compile(
  vine.object({
    repseRegistrationId: positiveIdField,
    name: nameField,
    objectDescription: objectDescriptionField,
    status: repseSpecializedServiceStatusField.optional(),
  })
)

/**
 * Edición parcial. Cualquier subconjunto de campos es válido; la capa de
 * servicio fusiona el payload con el estado actual del registro y revalida
 * las reglas de negocio (tenant del registro padre).
 */
export const updateRepseSpecializedServiceValidator = vine.compile(
  vine.object({
    repseRegistrationId: positiveIdField.optional(),
    name: nameField.optional(),
    objectDescription: objectDescriptionField.optional(),
    status: repseSpecializedServiceStatusField.optional(),
  })
)
