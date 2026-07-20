import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import encryption from '@adonisjs/core/services/encryption'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Employee from '#models/employee'
import EmployeeChildren from '#models/employee_children'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'

/**
 * Tipo de aplicación del horario de lactancia.
 * - two_rest_periods: dos reposos extraordinarios de 30 minutos.
 * - reduced_hour: reducción de 1 hora de la jornada laboral.
 */
export type EmployeeLactationPeriodType = 'two_rest_periods' | 'reduced_hour'

/**
 * Modalidad en que la trabajadora aplicará la reducción de jornada.
 * - start: al inicio de la jornada.
 * - end: al final de la jornada (default LFT).
 * - split: dividida en dos bloques (entrada / salida o intermedios).
 */
export type EmployeeLactationPeriodReductionApplication = 'start' | 'end' | 'split'

/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeeLactationPeriod:
 *       type: object
 *       properties:
 *         employeeLactationPeriodId:
 *           type: integer
 *           description: Identificador único del periodo de lactancia.
 *         employeeId:
 *           type: integer
 *           description: Empleada (FK a employees).
 *         businessUnitId:
 *           type: integer
 *           description: Unidad de negocio dueña (defensa en profundidad, USRH1784259058510).
 *         employeeLactationPeriodStartDate:
 *           type: string
 *           format: date
 *           description: Fecha de inicio del periodo de lactancia (YYYY-MM-DD).
 *         employeeLactationPeriodEndDate:
 *           type: string
 *           format: date
 *           description: Fecha de fin del periodo de lactancia (YYYY-MM-DD).
 *         employeeLactationPeriodType:
 *           type: string
 *           enum: [two_rest_periods, reduced_hour]
 *           description: Modalidad de descanso (LFT 170 II).
 *         employeeLactationPeriodReductionApplication:
 *           type: string
 *           enum: [start, end, split]
 *           description: Cómo se aplica la reducción dentro de la jornada.
 *         employeeLactationPeriodNotes:
 *           type: string
 *           nullable: true
 *           maxLength: 500
 *           description: Observaciones adicionales del periodo.
 *         employeeChildrenId:
 *           type: integer
 *           nullable: true
 *           description: |
 *             Vínculo OPCIONAL al hijo registrado de la empleada que justifica
 *             el derecho de lactancia. FK a `employee_children.employee_children_id`
 *             con `ON DELETE SET NULL`: si se borra el hijo, el periodo se
 *             conserva con el vínculo en nulo. Si se envía, debe pertenecer
 *             al mismo empleado del periodo (validación en el service,
 *             422 con key `hijo-no-pertenece-al-empleado`).
 *         employeeChild:
 *           type: object
 *           nullable: true
 *           description: |
 *             Mini-objeto del hijo vinculado (preload de la relación
 *             `belongsTo`). Sólo se expone en respuestas de list/create/update
 *             cuando hay vínculo, para que la card del front pinte el chip
 *             sin un round-trip adicional.
 *           properties:
 *             employeeChildrenId: { type: integer }
 *             employeeChildrenFirstname: { type: string }
 *             employeeChildrenLastname: { type: string }
 *             employeeChildrenSecondLastname: { type: string }
 *             employeeChildrenBirthday: { type: string, format: date, nullable: true }
 *         employeeLactationPeriodCreatedAt:
 *           type: string
 *           format: date-time
 *         employeeLactationPeriodUpdatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         employeeLactationPeriodDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class EmployeeLactationPeriod extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  static table = 'employee_lactation_periods'

  @column({ isPrimary: true })
  declare employeeLactationPeriodId: number

  @column()
  declare employeeId: number

  /** Marca de pertenencia propia (defensa en profundidad, USRH1784259058510). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde la empleada padre (nunca del payload). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: EmployeeLactationPeriod) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'la empleada'
    )
  }

  @column.date()
  declare employeeLactationPeriodStartDate: DateTime

  @column.date()
  declare employeeLactationPeriodEndDate: DateTime

  @column()
  declare employeeLactationPeriodType: EmployeeLactationPeriodType

  @column()
  declare employeeLactationPeriodReductionApplication: EmployeeLactationPeriodReductionApplication

  /**
   * Observaciones del período de lactancia — cifradas AES-256-CBC en reposo
   * (LFPDPPP art. 3.VI, dato de salud sensible reforzado). Nullable; no se usa en WHERE.
   */
  @column({
    prepare: (value: string | null) =>
      value !== null && value !== undefined ? encryption.encrypt(value) : null,
    consume: (value: string | null) => {
      if (value === null || value === undefined) return null
      try {
        return encryption.decrypt<string>(value)
      } catch {
        return null
      }
    },
  })
  declare employeeLactationPeriodNotes: string | null

  /**
   * Vínculo OPCIONAL al hijo registrado de la empleada. Es `null` cuando:
   *   1. El usuario no eligió un hijo al capturar (escenario común
   *      cuando aún no se actualizó el expediente de hijos).
   *   2. El hijo previamente vinculado fue eliminado (FK
   *      `ON DELETE SET NULL` definida en la migración).
   */
  @column()
  declare employeeChildrenId: number | null

  @column.dateTime({ autoCreate: true })
  declare employeeLactationPeriodCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeLactationPeriodUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'employee_lactation_period_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  /**
   * Relación BelongsTo opcional. El preload puede traer `null` cuando
   * el periodo se guardó sin hijo vinculado o cuando el hijo fue
   * eliminado posteriormente (FK SET NULL).
   */
  @belongsTo(() => EmployeeChildren, {
    foreignKey: 'employeeChildrenId',
  })
  declare employeeChild: BelongsTo<typeof EmployeeChildren>
}
