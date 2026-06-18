import vine from '@vinejs/vine'

/**
 * Validador del endpoint GET /attendance-stats/coverage.
 *
 * Exige día único (startDay === endDay se valida en el service), companyId
 * (empresa contratante) y los mismos filtros opcionales de attendance-stats.
 */
export const getAttendanceCoverageValidator = vine.compile(
  vine.object({
    startDay: vine.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDay: vine.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    companyId: vine.number().positive(),
    departmentIds: vine.array(vine.number().positive()).optional(),
    employeeIds: vine.array(vine.number().positive()).optional(),
    businessUnitId: vine.number().positive().optional(),
    payrollBusinessUnitId: vine.number().positive().optional(),
    branchOfficeIds: vine.array(vine.number().positive()).optional(),
  })
)

export type GetAttendanceCoverageInput = Awaited<
  ReturnType<typeof getAttendanceCoverageValidator.validate>
>
