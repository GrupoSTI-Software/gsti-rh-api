import vine from '@vinejs/vine'

/** Estados válidos para el campo `status` de un modelo de dispositivo. */
const deviceStatusEnum = ['vigente', 'en_validacion', 'descontinuado'] as const

/**
 * Body para `POST /api/platform/device-models`.
 * `slug` es inmutable: si no se envía se auto-genera desde brand + name
 * en el servicio. Si el landlord lo envía debe cumplir el formato kebab-case.
 */
export const createDeviceModelValidator = vine.compile(
  vine.object({
    brand: vine.string().trim().minLength(1).maxLength(100),
    name: vine.string().trim().minLength(1).maxLength(191),
    slug: vine.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).maxLength(100).optional(),
    status: vine.enum(deviceStatusEnum).optional(),
  })
)

/**
 * Body para `PATCH /api/platform/device-models/:deviceModelId`.
 * Solo brand y name son actualizables. El slug es inmutable (regla de negocio).
 */
export const updateDeviceModelValidator = vine.compile(
  vine.object({
    brand: vine.string().trim().minLength(1).maxLength(100).optional(),
    name: vine.string().trim().minLength(1).maxLength(191).optional(),
  })
)

/**
 * Body para `PUT /api/platform/device-models/:deviceModelId/status`.
 * Transiciones de estado — las valida el servicio.
 */
export const changeDeviceModelStatusValidator = vine.compile(
  vine.object({
    status: vine.enum(deviceStatusEnum),
  })
)

/**
 * Body para `POST /api/platform/devices/units`.
 * Registra una unidad concreta del inventario.
 *
 * Campos en camelCase completo para espejo 1:1 del contrato del spec (§11).
 * Reglas de negocio aplicadas en el servicio (no aquí):
 *   - Orden: modelo existe → vigente → origen/costo → serie libre → crear.
 *   - El modelo debe estar en estado `vigente`.
 *   - El serial debe ser único en toda la plataforma (incluyendo bajas lógicas).
 *   - Aparatos `del_cliente` no aceptan costo ni fecha de adquisición.
 */
export const createDeviceValidator = vine.compile(
  vine.object({
    platformDeviceSerialNumber: vine.string().trim().minLength(1).maxLength(100),
    platformDeviceModelId: vine.number().positive().withoutDecimals(),
    platformDeviceOrigin: vine.enum(['propia', 'del_cliente'] as const),
    platformDeviceAcquisitionCostCents: vine.number().positive().withoutDecimals().optional().nullable(),
    platformDeviceAcquisitionDate: vine.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  })
)

/**
 * Query params para `GET /api/platform/devices/units` (tablero — 1874).
 *
 * Filtros:
 *   - `search`: coincidencia parcial sobre el número de serie (LIKE).
 *   - `modelId`: filtra por modelo del catálogo.
 *   - `status`: `disponible | asignada | retirada` — fuera de catálogo → 422.
 *   - `origin`: `propia | del_cliente` — fuera de catálogo → 422.
 *   - `tenantPublicId`: UUID de la empresa que tiene el aparato (colocación vigente).
 *     Mientras no exista `platform_device_assignments` (ticket 1876) devuelve
 *     siempre array vacío sin error — degradación documentada en §11 del spec.
 *
 * Paginación:
 *   - `page`: ≥ 1, default 1.
 *   - `limit`: 1–100, default 20.
 */
export const listDevicesValidator = vine.compile(
  vine.object({
    search: vine.string().trim().maxLength(100).optional(),
    modelId: vine.number().positive().withoutDecimals().optional(),
    status: vine.enum(['disponible', 'asignada', 'retirada'] as const).optional(),
    origin: vine.enum(['propia', 'del_cliente'] as const).optional(),
    tenantPublicId: vine.string().trim().uuid().optional(),
    page: vine.number().positive().withoutDecimals().optional(),
    limit: vine.number().positive().withoutDecimals().max(100).optional(),
  })
)
