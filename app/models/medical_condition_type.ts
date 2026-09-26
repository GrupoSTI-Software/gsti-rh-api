import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, column, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import MedicalConditionTypeProperty from './medical_condition_type_property.js'
import EmployeeMedicalCondition from './employee_medical_condition.js'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { TenantContext } from '#utils/tenant_context'

/**
 * @swagger
 * components:
 *   schemas:
 *     MedicalConditionType:
 *       type: object
 *       properties:
 *         medicalConditionTypeId:
 *           type: number
 *           description: Medical condition type ID
 *         businessUnitId:
 *           type: number
 *           description: Unidad de negocio dueña (dato médico sensible, USRH1784259058487)
 *         medicalConditionTypeName:
 *           type: string
 *           description: Medical condition type name
 *         medicalConditionTypeDescription:
 *           type: string
 *           description: Medical condition type description
 *         medicalConditionTypeActive:
 *           type: number
 *           description: Medical condition type status
 *         medicalConditionTypeCreatedAt:
 *           type: string
 *           format: date-time
 *         medicalConditionTypeUpdatedAt:
 *           type: string
 *           format: date-time
 *         medicalConditionTypeDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class MedicalConditionType extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  @column({ isPrimary: true })
  declare medicalConditionTypeId: number

  /** Marca de pertenencia propia (dato médico sensible, USRH1784259058487). */
  @column()
  declare businessUnitId: number

  /**
   * Resuelve businessUnitId desde la unidad activa del request (nunca del payload).
   * Catálogo privado por cliente — no hay padre empleado.
   */
  @beforeCreate()
  static assignBusinessUnitId(instance: MedicalConditionType) {
    if (instance.businessUnitId) return
    const [businessUnitId] = TenantContext.getScope()
    if (!businessUnitId) {
      throw new Error(
        'No se pudo resolver la unidad de negocio: no hay unidad activa en el alcance'
      )
    }
    instance.businessUnitId = businessUnitId
  }

  @column()
  declare medicalConditionTypeName: string

  @column()
  declare medicalConditionTypeDescription: string

  @column()
  declare medicalConditionTypeActive: number

  @column.dateTime({ autoCreate: true })
  declare medicalConditionTypeCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare medicalConditionTypeUpdatedAt: DateTime

  @column.dateTime({ columnName: 'medical_condition_type_deleted_at' })
  declare deletedAt: DateTime | null

  @hasMany(() => MedicalConditionTypeProperty, {
    foreignKey: 'medicalConditionTypeId',
    onQuery: (query) => {
      query.whereNull('medical_condition_type_property_deleted_at')
    },
  })
  declare properties: HasMany<typeof MedicalConditionTypeProperty>

  @hasMany(() => EmployeeMedicalCondition, {
    foreignKey: 'medicalConditionTypeId',
    onQuery: (query) => {
      query.whereNull('employee_medical_condition_deleted_at')
    },
  })
  declare employeeMedicalConditions: HasMany<typeof EmployeeMedicalCondition>
}
