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
 * Alta de un reporte de evento traumático desde la app del empleado.
 * NO acepta `traumaticEventReportEmployeeId`: el servidor resuelve el empleado
 * desde el token (regla 1). El servidor asigna elaboratedAt, origin='employee'
 * y capturedByUserId.
 */
export const createEmployeeTraumaticEventReportValidator = vine.compile(
  vine.object({
    traumaticEventTypeId: vine.number().positive(),
    traumaticEventReportOccurredAt: vine.date({ formats: ['YYYY-MM-DD'] }),
    traumaticEventReportInvolvedPeople: vine.string().trim().minLength(1),
    traumaticEventReportDescription: vine.string().trim().minLength(1),
  })
)

/**
 * Filtros para el registro auditable NOM-035 §5.8.c (JSON + export PDF).
 * `page` y `limit` son obligatorios para el JSON; el export los ignora pero
 * los acepta para no duplicar el validador.
 */
export const traumaticEventRegistryFiltersValidator = vine.compile(
  vine.object({
    from: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    to: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    eventTypeId: vine.number().positive().optional(),
    page: vine.number().positive().optional(),
    limit: vine.number().positive().max(500).optional(),
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
