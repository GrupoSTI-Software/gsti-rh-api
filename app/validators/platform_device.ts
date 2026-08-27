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
