import vine from '@vinejs/vine'

const LACTATION_PERIOD_TYPE_VALUES = ['two_rest_periods', 'reduced_hour'] as const

const LACTATION_REDUCTION_APPLICATION_VALUES = ['start', 'end', 'split'] as const

const lactationPeriodNotesField = vine.string().trim().maxLength(500).nullable()

const lactationPeriodTypeField = vine.enum(LACTATION_PERIOD_TYPE_VALUES)

const lactationReductionApplicationField = vine.enum(
  LACTATION_REDUCTION_APPLICATION_VALUES
)

/**
 * Listado paginado.
 * - `page` y `limit` son requeridos por contrato (límite máx 500 alineado al patrón general).
 * - `employeeId` opcional para filtrar por empleada.
 */
export const employeeLactationPeriodListValidator = vine.compile(
  vine.object({
    page: vine.number().positive(),
    limit: vine.number().positive().max(500),
    employeeId: vine.number().positive().optional(),
  })
)

/**
 * Alta de un periodo de lactancia.
 * - Coherencia estricta de fechas: end > start (`afterField`).
 * - El sanity check de 24 meses se aplica en el service para devolver 422 con
 *   key `lactation-period-unreasonable-range` (Vine sólo valida formato).
 */
export const createEmployeeLactationPeriodValidator = vine.compile(
  vine.object({
    employeeId: vine.number().positive(),
    lactationPeriodStartDate: vine.date({ formats: ['YYYY-MM-DD'] }),
    lactationPeriodEndDate: vine
      .date({ formats: ['YYYY-MM-DD'] })
      .afterField('lactationPeriodStartDate'),
    lactationPeriodType: lactationPeriodTypeField,
    lactationReductionApplication: lactationReductionApplicationField.optional(),
    lactationPeriodNotes: lactationPeriodNotesField.optional(),
  })
)

/**
 * Edición parcial. Cualquier subconjunto de campos es válido.
 * La coherencia (end > start) y el sanity de 24 meses se evalúan en el service
 * fusionando el payload con los valores actuales del registro.
 */
export const updateEmployeeLactationPeriodValidator = vine.compile(
  vine.object({
    employeeId: vine.number().positive().optional(),
    lactationPeriodStartDate: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    lactationPeriodEndDate: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    lactationPeriodType: lactationPeriodTypeField.optional(),
    lactationReductionApplication: lactationReductionApplicationField.optional(),
    lactationPeriodNotes: lactationPeriodNotesField.optional(),
  })
)
