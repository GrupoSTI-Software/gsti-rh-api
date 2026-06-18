import vine from '@vinejs/vine'

/**
 * Listado paginado con filtros opcionales.
 */
export const traumaticEventReportListValidator = vine.compile(
  vine.object({
    page: vine.number().positive(),
    limit: vine.number().positive().max(500),
    search: vine.string().trim().optional(),
    employeeId: vine.number().positive().optional(),
    traumaticEventTypeId: vine.number().positive().optional(),
    dateFrom: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    dateTo: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
  })
)

/**
 * Alta de un reporte de evento traumático.
 * El servidor asigna: elaboratedAt, origin y capturedByUserId.
 */
export const createTraumaticEventReportValidator = vine.compile(
  vine.object({
    traumaticEventReportEmployeeId: vine.number().positive(),
    traumaticEventTypeId: vine.number().positive(),
    traumaticEventReportOccurredAt: vine.date({ formats: ['YYYY-MM-DD'] }),
    traumaticEventReportInvolvedPeople: vine.string().trim().minLength(1),
    traumaticEventReportDescription: vine.string().trim().minLength(1),
  })
)

/**
 * Edición parcial. Cualquier subconjunto de campos editables es válido.
 * Origen, fecha de elaboración y capturador no se modifican.
 */
export const updateTraumaticEventReportValidator = vine.compile(
  vine.object({
    traumaticEventReportEmployeeId: vine.number().positive().optional(),
    traumaticEventTypeId: vine.number().positive().optional(),
    traumaticEventReportOccurredAt: vine
      .date({ formats: ['YYYY-MM-DD'] })
      .optional(),
    traumaticEventReportInvolvedPeople: vine.string().trim().minLength(1).optional(),
    traumaticEventReportDescription: vine.string().trim().minLength(1).optional(),
  })
)
