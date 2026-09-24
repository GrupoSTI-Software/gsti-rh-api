import vine from '@vinejs/vine'
import {
  ASSET_DEACTIVATION_STATUSES,
  ASSET_STATUSES,
} from '#modules/assets/assets.constants'

/**
 * Folio alfanumérico del activo: texto de 1 a 50 caracteres (único por
 * empresa; lo valida el service). Acepta también el entero que envía el BO
 * anterior y lo guarda como texto.
 */
const fileNumberRule = vine.createRule((value, _options, field) => {
  const text =
    typeof value === 'string'
      ? value.trim()
      : typeof value === 'number' && Number.isInteger(value) && value > 0
        ? String(value)
        : ''
  if (text.length < 1 || text.length > 50) {
    field.report('El folio debe tener de 1 a 50 caracteres', 'fileNumber', field)
    return
  }
  field.mutate(text, field)
})
const fileNumber = () =>
  vine
    .any()
    .use(fileNumberRule())
    .transform((value): string => String(value))

/** Número de serie opcional; vacío se guarda como `null`. */
const serialNumber = () =>
  vine
    .string()
    .trim()
    .maxLength(100)
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value))

export const createSupplieValidator = vine.compile(
  vine.object({
    supplyFileNumber: fileNumber(),
    supplyName: vine.string().trim().minLength(1).maxLength(255),
    supplySerialNumber: serialNumber(),
    supplyDescription: vine.string().trim().maxLength(1000).optional(),
    supplyTypeId: vine.number().positive(),
    supplyStatus: vine.enum(ASSET_STATUSES).optional(),
    supplyAcquisitionDate: vine.string().trim().optional().nullable(),
    supplyAcquisitionValue: vine.number().min(0).optional().nullable(),
  })
)

export const updateSupplieValidator = vine.compile(
  vine.object({
    supplyFileNumber: fileNumber().optional(),
    supplyName: vine.string().trim().minLength(1).maxLength(255).optional(),
    supplySerialNumber: serialNumber(),
    supplyDescription: vine.string().trim().maxLength(1000).optional(),
    supplyTypeId: vine.number().positive().optional(),
    supplyStatus: vine.enum(ASSET_STATUSES).optional(),
    supplyAcquisitionDate: vine.string().trim().optional().nullable(),
    supplyAcquisitionValue: vine.number().min(0).optional().nullable(),
  })
)

export const supplieFilterValidator = vine.compile(
  vine.object({
    page: vine.number().positive().optional(),
    limit: vine.number().positive().max(1000).optional(),
    search: vine.string().trim().optional(),
    supplyTypeId: vine.number().positive().optional(),
    supplyName: vine.string().trim().optional(),
    supplyStatus: vine.enum(ASSET_STATUSES).optional(),
    supplyFileNumber: vine.string().trim().maxLength(50).optional(),
    includeDeleted: vine.boolean().optional(),
  })
)

export const supplieDeactivationValidator = vine.compile(
  vine.object({
    /** Estado destino de la baja; `inactive` si no llega. */
    supplyStatus: vine.enum(ASSET_DEACTIVATION_STATUSES).optional(),
    supplyDeactivationReason: vine.string().trim().minLength(1).maxLength(500),
    supplyDeactivationDate: vine.string().trim().optional(),
  })
)
