import vine from '@vinejs/vine'

/**
 * Validador del endpoint GET /attendance-stats/coverage/absences.
 *
 * - `startDay` / `endDay`: requeridos, formato yyyy-MM-dd. El orden del rango,
 *   que las fechas existan y el tope de días los valida el service.
 * - `empresaContratanteId`: entero positivo requerido. No acepta `companyId`:
 *   ese nombre lo intercepta el middleware `businessScope`.
 * - `branchOfficeIds`: el controller convierte el CSV en arreglo de enteros.
 * - Los ids usan `min(1)` y no `positive()`: en VineJS `positive()` acepta el 0.
 */
export const getAttendanceCoverageAbsencesValidator = vine.compile(
  vine.object({
    startDay: vine.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDay: vine.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    empresaContratanteId: vine.number().withoutDecimals().min(1),
    branchOfficeIds: vine.array(vine.number().withoutDecimals().min(1)).optional(),
    payrollBusinessUnitId: vine.number().withoutDecimals().min(1).optional(),
  })
)

export type GetAttendanceCoverageAbsencesInput = Awaited<
  ReturnType<typeof getAttendanceCoverageAbsencesValidator.validate>
>
