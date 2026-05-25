import vine from '@vinejs/vine'

/**
 * Validador compartido por los 3 endpoints de attendance-stats.
 *
 * - `startDay` / `endDay`: requeridos, formato yyyy-MM-dd.
 * - El controller valida `startDay <= endDay` (no se puede hacer aquí porque
 *   VineJS no expone comparación cross-field con mensajes custom).
 * - Acepta IDs como número o como string CSV ("1,2,3") y los normaliza
 *   en el controller antes de invocar el validador.
 */
export const getAttendanceStatsValidator = vine.compile(
  vine.object({
    startDay: vine.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDay: vine.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    departmentIds: vine.array(vine.number().positive()).optional(),
    employeeIds: vine.array(vine.number().positive()).optional(),
    businessUnitId: vine.number().positive().optional(),
    payrollBusinessUnitId: vine.number().positive().optional(),
    branchOfficeIds: vine.array(vine.number().positive()).optional(),
  })
)

export type GetAttendanceStatsInput = Awaited<
  ReturnType<typeof getAttendanceStatsValidator.validate>
>
