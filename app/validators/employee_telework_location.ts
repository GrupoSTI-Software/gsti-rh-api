import vine from '@vinejs/vine'
import { TELEWORK_LOCATION_TYPE_VALUES } from '#constants/employee_telework_location_error_codes'

/**
 * Esquema base compartido entre alta y edición del lugar de teletrabajo
 * (NOM-037 5.1). La dirección es snapshot propio; los mínimos NOT NULL son
 * calle, ciudad y estado. Fijeza (5.1.2) y conectividad (5.1.1) son
 * booleanos explícitos para no depender de defaults del cliente.
 */
const teleworkLocationBaseSchema = {
  employeeTeleworkLocationType: vine.enum(TELEWORK_LOCATION_TYPE_VALUES),
  employeeTeleworkLocationStreet: vine.string().trim().minLength(1).maxLength(200),
  employeeTeleworkLocationExternalNumber: vine.string().trim().maxLength(50).optional().nullable(),
  employeeTeleworkLocationInternalNumber: vine.string().trim().maxLength(50).optional().nullable(),
  employeeTeleworkLocationSettlement: vine.string().trim().maxLength(150).optional().nullable(),
  employeeTeleworkLocationCity: vine.string().trim().minLength(1).maxLength(150),
  employeeTeleworkLocationState: vine.string().trim().minLength(1).maxLength(150),
  employeeTeleworkLocationCountry: vine.string().trim().minLength(1).maxLength(100).optional(),
  employeeTeleworkLocationZipcode: vine.string().trim().maxLength(10).optional().nullable(),
  employeeTeleworkLocationIsFixedAgreed: vine.boolean(),
  employeeTeleworkLocationHasInternet: vine.boolean(),
  employeeTeleworkLocationHasAdequateEquipment: vine.boolean(),
  employeeTeleworkLocationConnectivityNotes: vine
    .string()
    .trim()
    .maxLength(500)
    .optional()
    .nullable(),
}

export const createEmployeeTeleworkLocationValidator = vine.compile(
  vine.object({
    employeeId: vine.number().positive(),
    ...teleworkLocationBaseSchema,
  })
)

export const updateEmployeeTeleworkLocationValidator = vine.compile(
  vine.object({
    ...teleworkLocationBaseSchema,
  })
)
