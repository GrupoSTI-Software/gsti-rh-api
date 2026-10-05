import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, column, belongsTo } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import MedicalConditionTypeProperty from './medical_condition_type_property.js'
import EmployeeMedicalCondition from './employee_medical_condition.js'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
import { withSensitiveWriteGuard } from '#mixins/with_sensitive_write_guard'
import encryption from '@adonisjs/core/services/encryption'
import { sensitiveSerialize } from '#helpers/sensitive_serialize'

/**
 * @swagger
 * components:
 *   schemas:
 *     MedicalConditionTypePropertyValue:
 *       type: object
 *       properties:
 *         medicalConditionTypePropertyValueId:
 *           type: number
 *           description: Medical condition type property value ID
 *         medicalConditionTypePropertyId:
 *           type: number
 *           description: Medical condition type property ID
 *         employeeMedicalConditionId:
 *           type: number
 *           description: Employee medical condition ID
 *         businessUnitId:
 *           type: number
 *           description: Unidad de negocio dueña (hereda de la condición del empleado, USRH1784259058487)
 *         medicalConditionTypePropertyValue:
 *           type: string
 *           description: Valor capturado; cifrado en reposo y enmascarado en la respuesta (se revela por /api/v1/pii/reveal)
 *         medicalConditionTypePropertyValueActive:
 *           type: number
 *           description: Property value status
 *         medicalConditionTypePropertyValueCreatedAt:
 *           type: string
 *           format: date-time
 *         medicalConditionTypePropertyValueUpdatedAt:
 *           type: string
 *           format: date-time
 *         medicalConditionTypePropertyValueDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class MedicalConditionTypePropertyValue extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope(),
  withSensitiveWriteGuard()
) {
  @column({ isPrimary: true })
  declare medicalConditionTypePropertyValueId: number

  @column()
  declare medicalConditionTypePropertyId: number

  @column()
  declare employeeMedicalConditionId: number

  /** Marca de pertenencia propia (hereda de la condición del empleado, USRH1784259058487). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde la condición médica del empleado (nunca del payload). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: MedicalConditionTypePropertyValue) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () =>
        EmployeeMedicalCondition.query()
          .where('employeeMedicalConditionId', instance.employeeMedicalConditionId)
          .first(),
      'la condición médica del empleado'
    )
  }

  /**
   * Valor capturado de la propiedad — cifrado AES-256-CBC en reposo (LFPDPPP
   * art. 3.VI): guarda el mismo dato clínico que el diagnóstico. No se usa en
   * cláusulas WHERE de SQL.
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
    serialize: sensitiveSerialize('MedicalConditionTypePropertyValue', 'medicalConditionTypePropertyValue'),
  })
  declare medicalConditionTypePropertyValue: string

  @column()
  declare medicalConditionTypePropertyValueActive: number

  @column.dateTime({ autoCreate: true })
  declare medicalConditionTypePropertyValueCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare medicalConditionTypePropertyValueUpdatedAt: DateTime

  @column.dateTime({ columnName: 'medical_condition_type_property_value_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => MedicalConditionTypeProperty, {
    foreignKey: 'medicalConditionTypePropertyId',
  })
  declare medicalConditionTypeProperty: BelongsTo<typeof MedicalConditionTypeProperty>

  @belongsTo(() => EmployeeMedicalCondition, {
    foreignKey: 'employeeMedicalConditionId',
  })
  declare employeeMedicalCondition: BelongsTo<typeof EmployeeMedicalCondition>
}
