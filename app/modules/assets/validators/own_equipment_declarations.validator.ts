import vine from '@vinejs/vine'
import { SUPPLY_TYPE_TELEWORK_CATEGORIES } from '#constants/supply_type_telework_category'

/**
 * Cuerpo de `POST /api/employees/:employeeId/own-equipment-declarations` (§13,
 * lista blanca): categoría de la norma, descripción y fecha de inicio
 * obligatorias, condiciones opcionales.
 *
 * `monthlyFee` NO pasa por Vine: el controlador lo lee crudo
 * (`request.input('monthlyFee')`) y el servicio lo valida con `parseMonthlyFee`
 * —una validación con `Number` dejaría pasar `""` como 0—. Tampoco entra ningún
 * campo del servidor (`feeSource`, `status`, `endDate`, `closedReason`,
 * `businessUnitId`, `employeeId`, archivo): los fija el alta.
 */
export const createOwnEquipmentDeclarationValidator = vine.compile(
  vine.object({
    category: vine.enum(SUPPLY_TYPE_TELEWORK_CATEGORIES),
    description: vine.string().trim().minLength(1).maxLength(255),
    conditions: vine.string().trim().maxLength(2000).optional(),
    startDate: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
)
