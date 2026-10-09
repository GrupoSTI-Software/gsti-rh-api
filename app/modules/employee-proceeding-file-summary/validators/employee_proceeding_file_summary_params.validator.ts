import vine from '@vinejs/vine'

/** Parámetro `:employeeId` de `GET /api/employees/:employeeId/proceeding-file-summary`. */
export const employeeProceedingFileSummaryParamsValidator = vine.compile(
  vine.object({
    employeeId: vine.number().withoutDecimals().positive(),
  })
)
