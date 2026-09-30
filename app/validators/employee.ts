import Employee from '#models/employee'
import vine from '@vinejs/vine'
import {
  EMPLOYEE_HYBRID_MODE,
  EMPLOYEE_WORK_SCHEDULE,
  EMPLOYEE_WORK_SCHEDULE_VALUES,
  EMPLOYEE_HYBRID_MODE_VALUES,
} from '#constants/employee_work_schedule'

/**
 * Schema Vine para el `employee_work_schedule_hybrid_config`.
 *
 * Los tres modos comparten JSON pero con formas distintas:
 * - `SpecificDays` → `{ days: number[] }` con enteros [0..6], 1–6 días.
 * - `DaysPerWeek` / `DaysPerMonth` → `{ count: number }` con entero positivo.
 *
 * Vine no soporta uniones discriminadas naturalmente, así que se declara un
 * schema laxo (ambas propiedades opcionales) y las reglas cruzadas finas se
 * enforzan en `EmployeeTeleworkCalculator.validateHybridConfig` (que corre
 * en el servicio con acceso al turno del empleado). El validador solo evita
 * que llegue basura estructural al servicio.
 */
// Días de semana en convención ISO 8601 (1 = Lunes, ..., 7 = Domingo), la
// misma que usa `shift.shiftRestDays` y el motor de asistencias
// (`WEEKDAY(day) + 1` en MySQL). El máximo cardinal 6 evita clasificar como
// híbrido cuando todos los días laborales son remotos.
const hybridConfigSchema = vine
  .object({
    days: vine
      .array(vine.number().min(1).max(7))
      .minLength(1)
      .maxLength(6)
      .distinct()
      .optional(),
    count: vine.number().min(0).max(31).optional(),
  })
  .optional()

const workScheduleValues = [...EMPLOYEE_WORK_SCHEDULE_VALUES]
const hybridModeValues = [...EMPLOYEE_HYBRID_MODE_VALUES]

export const createEmployeeValidator = vine.compile(
  vine.object({
    employeeSyncId: vine.string().trim().minLength(0).maxLength(50).optional(),
    employeeCode: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(200)
      .unique(async (_db, value) => {
        if (!value || value.trim() === '') {
          return true
        }
        const existingCode = await Employee.query()
          .where('employee_code', value)
          .whereNull('employee_deleted_at')
          .first()
        return !existingCode
      })
      .optional(),
    employeeFirstName: vine.string().trim().minLength(0).maxLength(25).optional(),
    employeeLastName: vine.string().trim().minLength(0).maxLength(25).optional(),
    employeeSecondLastName: vine.string().trim().minLength(0).maxLength(25).optional(),
    employeePayrollCode: vine.string().trim().minLength(0).maxLength(100).optional(),
    companyId: vine.number().min(1),
    // USRH1789328927556: la obligatoriedad se resuelve en store con
    // requireEmployeeStructureForCreate (regla 1), para poder decir cuál
    // falta o que faltan los dos. Vine solo acepta el valor; 0 y vacío
    // los trata el controller como faltantes (regla 2) ANTES de validar.
    departmentId: vine.number().nullable().optional(),
    departmentSyncId: vine.number().min(0).optional(),
    positionId: vine.number().nullable().optional(),
    positionSyncId: vine.number().min(0).optional(),
    positionLevelConfigId: vine.number().min(1).nullable().optional(),
    employeeWorkSchedule: vine.enum(workScheduleValues),
    employeeWorkScheduleHybridMode: vine.enum(hybridModeValues).nullable().optional(),
    employeeWorkScheduleHybridConfig: hybridConfigSchema.nullable(),
    personId: vine
      .number()
      .min(1)
      .unique(async (_db, value) => {
        const existingPersonId = await Employee.query()
          .where('person_id', value)
          .whereNull('employee_deleted_at')
          .first()
        return !existingPersonId
      }),
    employeeTypeId: vine.number().min(1),
    employeeBusinessEmail: vine
      .string()
      .trim()
      .minLength(0)
      .maxLength(200)
      .unique(async (_db, value) => {
        const existingEmail = await Employee.query()
          .whereNull('employee_deleted_at')
          .where('employee_business_email', value)
          .first()
        return !existingEmail
      })
      .optional(),
  })
)

/**
 * `employeeBusinessEmail` se valida también al editar (USRH1789698261612),
 * excluyendo al propio empleado: sin esto el PUT movía el correo institucional
 * a uno que ya usa otro empleado vivo.
 */
export const updateEmployeeValidator = vine.withMetaData<{ employeeId: number }>().compile(
  vine.object({
    employeeSyncId: vine.string().trim().minLength(0).maxLength(50).optional(),
    employeeCode: vine.string().trim().minLength(1).maxLength(200),
    employeeFirstName: vine.string().trim().minLength(0).maxLength(25).optional(),
    employeeLastName: vine.string().trim().minLength(0).maxLength(25).optional(),
    employeeSecondLastName: vine.string().trim().minLength(0).maxLength(25).optional(),
    employeePayrollCode: vine.string().trim().minLength(0).maxLength(100).optional(),
    companyId: vine.number().min(1),
    // USRH1788466831270, regla 1: al editar no son obligatorios. Ausente =
    // conservar lo guardado; `null` = dejar sin asignar (regla 9). El alta
    // los exige en store (USRH1789328927556), no en este validador.
    departmentId: vine.number().min(1).nullable().optional(),
    departmentSyncId: vine.number().min(0).optional(),
    positionId: vine.number().min(1).nullable().optional(),
    positionSyncId: vine.number().min(0).optional(),
    positionLevelConfigId: vine.number().min(1).nullable().optional(),
    employeeTypeId: vine.number().min(1),
    employeeWorkSchedule: vine.enum(workScheduleValues).optional(),
    employeeWorkScheduleHybridMode: vine.enum(hybridModeValues).nullable().optional(),
    employeeWorkScheduleHybridConfig: hybridConfigSchema.nullable(),
    employeeBusinessEmail: vine
      .string()
      .trim()
      .minLength(0)
      .maxLength(200)
      .unique(async (_db, value, field) => {
        if (value === '') return true
        const existingEmail = await Employee.query()
          .whereNull('employee_deleted_at')
          .where('employee_business_email', value)
          .whereNot('employee_id', field.meta.employeeId)
          .first()
        return !existingEmail
      })
      .optional(),
  })
)

/**
 * Re-export de constantes para consumidores del validador (tests, docs).
 */
export const EMPLOYEE_WORK_SCHEDULE_CANONICAL = EMPLOYEE_WORK_SCHEDULE
export const EMPLOYEE_HYBRID_MODE_CANONICAL = EMPLOYEE_HYBRID_MODE
