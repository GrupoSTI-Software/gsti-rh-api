import vine from '@vinejs/vine'
import { LACTATION_COMPLIANCE_STATUS_VALUES } from '#constants/employee_lactation_compliance_status'

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
 *
 * Los nombres de los campos espejan exactamente las columnas del modelo
 * `EmployeeLactationPeriod` (prefijo `employeeLactationPeriod*`) para mantener
 * un único contrato entre frontend, validator, service y persistencia.
 *
 * - Coherencia estricta de fechas: end > start (`afterField`).
 * - El sanity check de 24 meses se aplica en el service para devolver 422 con
 *   key `lactation-period-unreasonable-range` (Vine sólo valida formato).
 */
export const createEmployeeLactationPeriodValidator = vine.compile(
  vine.object({
    employeeId: vine.number().positive(),
    employeeLactationPeriodStartDate: vine.date({ formats: ['YYYY-MM-DD'] }),
    employeeLactationPeriodEndDate: vine
      .date({ formats: ['YYYY-MM-DD'] })
      .afterField('employeeLactationPeriodStartDate'),
    employeeLactationPeriodType: lactationPeriodTypeField,
    employeeLactationPeriodReductionApplication:
      lactationReductionApplicationField.optional(),
    employeeLactationPeriodNotes: lactationPeriodNotesField.optional(),
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
    employeeLactationPeriodStartDate: vine
      .date({ formats: ['YYYY-MM-DD'] })
      .optional(),
    employeeLactationPeriodEndDate: vine
      .date({ formats: ['YYYY-MM-DD'] })
      .optional(),
    employeeLactationPeriodType: lactationPeriodTypeField.optional(),
    employeeLactationPeriodReductionApplication:
      lactationReductionApplicationField.optional(),
    employeeLactationPeriodNotes: lactationPeriodNotesField.optional(),
  })
)

/**
 * Validador de filtros del reporte de cumplimiento (JSON paginado + export PDF).
 *
 * Reglas:
 * - `page` / `limit` requeridos para el endpoint JSON. Para el export PDF se
 *   reusa el mismo validador pero el service ignora la paginación y trae todo
 *   lo que cumpla los demás filtros.
 * - `status` opcional dentro del set cerrado del módulo (`activa`,
 *   `por_vencer`, `vencida`).
 * - `from` / `to` opcionales. Si vienen ambos, el sanity check `from <= to`
 *   se hace en el service (Vine permite expresarlo aquí con `afterField`
 *   pero queremos un código de error tipado consistente con el resto del
 *   módulo, así que lo movemos al service para devolver 400 con detalle).
 * - `employeeId` opcional para acotar a una empleada específica.
 */
export const employeeLactationComplianceReportValidator = vine.compile(
  vine.object({
    page: vine.number().positive(),
    limit: vine.number().positive().max(500),
    status: vine.enum([...LACTATION_COMPLIANCE_STATUS_VALUES]).optional(),
    from: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    to: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    employeeId: vine.number().positive().optional(),
    /**
     * Acota el reporte a una sola unidad de negocio (la seleccionada en el
     * header global del backoffice). El service valida que el id esté
     * dentro del `businessUnitScope` del usuario para evitar escapes
     * multitenant — si no lo está, el reporte responde vacío sin filtrar
     * a ciegas por todo el scope.
     */
    businessUnitId: vine.number().positive().optional(),
  })
)
