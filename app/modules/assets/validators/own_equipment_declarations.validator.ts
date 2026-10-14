import vine from '@vinejs/vine'
import { SUPPLY_TYPE_TELEWORK_CATEGORIES } from '#constants/supply_type_telework_category'
import { OWN_EQUIPMENT_CLOSE_REASONS } from '../assets.constants.js'

/**
 * Validadores del ciclo de vida de la declaración de equipo propio
 * (VLRH-H1791493045968). Lista blanca: ningún campo del servidor (`feeSource`,
 * `status`, `businessUnitId`, `employeeId`, archivo) entra por el body —los
 * fija el propio módulo— y `monthlyFee` nunca pasa por Vine (el controlador lo
 * lee crudo con `request.input` y el servicio lo valida con `parseMonthlyFee`,
 * porque un `Number` dejaría pasar `""` como 0).
 */

/**
 * Id numérico de la ruta (`:declarationId`). Réplica del `routeId` privado de
 * `assets.validator.ts` —ese archivo no está en el censo de esta HU y no se
 * toca—: positivo y entero, con el `.min(1)` extra que rechaza el 0 que
 * `positive()` de VineJS admite.
 */
const routeId = () => vine.number().positive().withoutDecimals()

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

/** Params de `PUT /api/own-equipment-declarations/:declarationId` y del cierre. */
export const declarationIdParamsValidator = vine.compile(
  vine.object({ declarationId: routeId().min(1) })
)

/**
 * Cuerpo de `PUT /api/own-equipment-declarations/:declarationId` (ajuste): la
 * fecha de vigencia y los datos de la versión nueva, todos opcionales —el
 * servicio decide si el cambio es real comparando contra la fila vieja—.
 * `monthlyFee` viaja fuera de Vine (`request.input`, igual que el alta) y
 * `conditions: null` es un valor válido: limpia las condiciones (R5).
 */
export const adjustOwnEquipmentDeclarationValidator = vine.compile(
  vine.object({
    effectiveDate: vine
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    description: vine.string().trim().minLength(1).maxLength(255).optional(),
    conditions: vine.string().trim().maxLength(2000).nullable().optional(),
  })
)

/**
 * Cuerpo de `POST /api/own-equipment-declarations/:declarationId/close`
 * (término): fecha de fin opcional y motivo obligatorio del catálogo. El enum
 * rebota `adjusted` (R8: solo lo pone el sistema al ajustar) y cualquier
 * literal fuera de `OWN_EQUIPMENT_CLOSE_REASONS`.
 */
export const closeOwnEquipmentDeclarationValidator = vine.compile(
  vine.object({
    endDate: vine
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    closedReason: vine.enum(OWN_EQUIPMENT_CLOSE_REASONS),
  })
)
