import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import MedicalConditionType from './medical_condition_type.js'
import MedicalConditionTypePropertyValue from './medical_condition_type_property_value.js'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'

/**
 * @swagger
 * components:
 *   schemas:
 *     MedicalConditionTypeProperty:
 *       type: object
 *       properties:
 *         medicalConditionTypePropertyId:
 *           type: number
 *           description: Medical condition type property ID
 *         medicalConditionTypePropertyName:
 *           type: string
 *           description: Medical condition type property name
 *         medicalConditionTypePropertyDescription:
 *           type: string
 *           description: Medical condition type property description
 *         medicalConditionTypePropertyDataType:
 *           type: string
 *           description: Medical condition type property data type
 *         medicalConditionTypePropertyRequired:
 *           type: number
 *           description: Medical condition type property required flag
 *         medicalConditionTypeId:
 *           type: number
 *           description: Medical condition type ID
 *         businessUnitId:
 *           type: number
 *           description: Unidad de negocio dueña (hereda del tipo, USRH1784259058487)
 *         medicalConditionTypePropertyActive:
 *           type: number
 *           description: Medical condition type property status
 *         medicalConditionTypePropertyCreatedAt:
 *           type: string
 *           format: date-time
 *         medicalConditionTypePropertyUpdatedAt:
 *           type: string
 *           format: date-time
 *         medicalConditionTypePropertyDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class MedicalConditionTypeProperty extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  @column({ isPrimary: true })
  declare medicalConditionTypePropertyId: number

  @column()
  declare medicalConditionTypePropertyName: string

  @column()
  declare medicalConditionTypePropertyDescription: string

  @column()
  declare medicalConditionTypePropertyDataType: string

  @column()
  declare medicalConditionTypePropertyRequired: number

  @column()
  declare medicalConditionTypeId: number

  /** Marca de pertenencia propia (hereda del tipo médico, USRH1784259058487). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el tipo padre (nunca del payload). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: MedicalConditionTypeProperty) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () =>
        MedicalConditionType.query()
          .where('medicalConditionTypeId', instance.medicalConditionTypeId)
          .first(),
      'el tipo de condición médica'
    )
  }

  @column()
  declare medicalConditionTypePropertyActive: number

  @column.dateTime({ autoCreate: true })
  declare medicalConditionTypePropertyCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare medicalConditionTypePropertyUpdatedAt: DateTime

  @column.dateTime({ columnName: 'medical_condition_type_property_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => MedicalConditionType, {
    foreignKey: 'medicalConditionTypeId',
  })
  declare medicalConditionType: BelongsTo<typeof MedicalConditionType>

  @hasMany(() => MedicalConditionTypePropertyValue, {
    foreignKey: 'medicalConditionTypePropertyId',
    onQuery: (query) => {
      query.whereNull('medical_condition_type_property_value_deleted_at')
    },
  })
  declare propertyValues: HasMany<typeof MedicalConditionTypePropertyValue>
}
