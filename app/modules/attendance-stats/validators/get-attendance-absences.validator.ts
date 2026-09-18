import vine from '@vinejs/vine'
import type { FieldContext } from '@vinejs/vine/types'
import { DateTime } from 'luxon'

const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Id de sucursal como texto decimal: sin signo, sin ceros a la izquierda, sin
 * punto ni notación hexadecimal, binaria o exponencial (`0x10`, `1e3`, `+5`,
 * `5.0` no pasan). Se valida antes de convertir porque `Number()` los acepta.
 */
const STRICT_ID_PATTERN = /^[1-9]\d*$/

/** Tope del id: por encima, `Number()` redondea en silencio a otro entero. */
const MAX_SAFE_ID = BigInt(Number.MAX_SAFE_INTEGER)

/**
 * Rechaza un id decimal mayor que `Number.MAX_SAFE_INTEGER`
 * (`9007199254740993` se convertiría en `9007199254740992`). Corre después del
 * regex, así que `BigInt` siempre recibe dígitos.
 */
const safeIntegerIdRule = vine.createRule(
  (value: unknown, _options: undefined, field: FieldContext) => {
    if (typeof value !== 'string' || !field.isValid) return
    if (BigInt(value) > MAX_SAFE_ID) {
      field.report(
        'El campo {{ field }} excede el id máximo permitido.',
        'maxSafeId',
        field,
        undefined
      )
    }
  }
)

/**
 * Rechaza una fecha yyyy-MM-dd que no existe en el calendario (2026-02-31,
 * 2026-13-01). Corre después del regex; usa el mismo criterio que
 * `countRangeDaysInclusive`, así que el service no vuelve a encontrarla.
 */
const existingIsoDayRule = vine.createRule(
  (value: unknown, _options: undefined, field: FieldContext) => {
    if (typeof value !== 'string' || !field.isValid) return
    if (!DateTime.fromISO(value, { zone: 'utc' }).isValid) {
      field.report(
        'La fecha {{ field }} no existe en el calendario.',
        'existingIsoDay',
        field,
        undefined
      )
    }
  }
)

/**
 * Piezas crudas del query `branchOfficeIds` (CSV o parámetro repetido) para
 * que las valide `getAttendanceAbsencesValidator`. No descarta ni convierte
 * ninguna: un token que no sea un entero decimal de 1 a
 * `Number.MAX_SAFE_INTEGER` (`abc`, `0`, `1.5`, `0x10`, `1e3`, `+5`, vacío)
 * hace fallar la validación con 400 `entrada-invalida` y `details`, en lugar
 * de convertirse en "sin filtro" y ampliar la consulta a toda la plantilla.
 *
 * @returns `undefined` si el parámetro no trae valor (ausente, en blanco o
 *   arreglo vacío): sin filtro de sucursales.
 */
export function splitBranchOfficeIdsQuery(value: unknown): unknown[] | undefined {
  if (value === undefined || value === null) return undefined
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined
    return value.map((item: unknown) => (typeof item === 'string' ? item.trim() : item))
  }
  const raw = String(value)
  if (raw.trim() === '') return undefined
  return raw.split(',').map((token) => token.trim())
}

/**
 * Validador del endpoint GET /attendance-stats/absences.
 *
 * - `startDay` / `endDay`: requeridos, formato yyyy-MM-dd y fecha existente.
 *   El orden del rango y el tope de días los valida el service.
 * - `branchOfficeIds`: el controller parte el CSV con `splitBranchOfficeIdsQuery`.
 *   Cada pieza llega como texto y debe cumplir `STRICT_ID_PATTERN` y no pasar
 *   de `Number.MAX_SAFE_INTEGER`; solo entonces se convierte a número. Un
 *   número crudo (no texto) también falla: el query siempre trae texto.
 * - `payrollBusinessUnitId`: el controller lo parsea como el resto del módulo.
 * - Los ids usan `min(1)` y no `positive()`: en VineJS `positive()` acepta el 0.
 */
export const getAttendanceAbsencesValidator = vine.compile(
  vine.object({
    startDay: vine.string().trim().regex(ISO_DAY_PATTERN).use(existingIsoDayRule()),
    endDay: vine.string().trim().regex(ISO_DAY_PATTERN).use(existingIsoDayRule()),
    branchOfficeIds: vine
      .array(
        vine
          .string()
          .regex(STRICT_ID_PATTERN)
          .use(safeIntegerIdRule())
          .transform((value) => Number(value))
      )
      .optional(),
    payrollBusinessUnitId: vine.number().withoutDecimals().min(1).optional(),
  })
)
