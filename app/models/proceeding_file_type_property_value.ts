import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
import { TenantContext } from '#utils/tenant_context'
import Employee from './employee.js'
/**
 * @swagger
 * components:
 *   schemas:
 *     ProceedingFileTypePropertyValue:
 *       type: object
 *       properties:
 *         proceedingFileTypePropertyValueId:
 *           type: number
 *           description: Proceeding file type property value ID
 *         proceedingFileTypePropertyValueValue:
 *           type: string
 *           nullable: true
 *           description: Proceeding file type property value value
 *         proceedingFileTypePropertyValueActive:
 *           type: number
 *           nullable: true
 *         proceedingFileTypePropertyId:
 *           type: number
 *           nullable: true
 *           description: Proceeding file type property id
 *         employeeId:
 *           type: number
 *           nullable: true
 *           description: Employee id
 *         businessUnitId:
 *           type: number
 *           description: >
 *             Unidad de negocio dueña (USRH1786595131481). Resuelta por el
 *             sistema — nunca del payload — desde el empleado cuando hay
 *             employeeId, o desde la unidad activa del request cuando el
 *             valor cuelga del expediente de configuración de empresa.
 *         proceedingFileId:
 *           type: number
 *           nullable: true
 *           description: Proceeding file id
 *         proceedingFileTypePropertyValueCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the proceeding file type property value was created
 *         proceedingFileTypePropertyValueUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the proceeding file type property value was last updated
 *         proceedingFileTypePropertyValueDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Date and time when the proceeding file type property value was soft-deleted
 *       example:
 *         proceedingFileTypePropertyValueId: 1
 *         proceedingFileTypePropertyValueValue: 'Ingles'
 *         proceedingFileTypePropertyValueActive: 1
 *         proceedingFileTypePropertyId: 1
 *         employeeId: 1
 *         proceedingFileId: 1
 *         proceedingFileTypePropertyValueCreatedAt: '2025-03-12T12:00:00Z'
 *         proceedingFileTypePropertyValueUpdatedAt: '2025-03-12T13:00:00Z'
 *         proceedingFileTypePropertyValueDeletedAt: null
 */

export default class ProceedingFileTypePropertyValue extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  @column({ isPrimary: true })
  declare proceedingFileTypePropertyValueId: number

  @column()
  declare proceedingFileTypePropertyValueValue: string

  @column()
  declare proceedingFileTypePropertyValueActive: number

  @column()
  declare proceedingFileTypePropertyId: number

  @column()
  declare employeeId: number | null

  /**
   * Marca de pertenencia propia (cierre de IDOR, USRH1786595131481).
   * Nunca se acepta del payload; ver `assignBusinessUnitId`.
   */
  @column()
  declare businessUnitId: number

  /**
   * Resuelve businessUnitId por su cuenta (regla 4): del empleado cuando
   * hay employeeId (regla 2, `Employee` ya está acotado por su propio
   * `withBusinessUnitScope`, así que un employeeId ajeno no resuelve); si
   * no, de la unidad activa del request (regla 3 — expediente de
   * configuración de empresa). Nunca se lee del payload ni la elige el
   * usuario.
   */
  @beforeCreate()
  static async assignBusinessUnitId(instance: ProceedingFileTypePropertyValue) {
    if (instance.businessUnitId) return

    if (instance.employeeId) {
      instance.businessUnitId = await resolveParentBusinessUnitId(
        () => Employee.query().where('employeeId', instance.employeeId!).first(),
        'el empleado'
      )
      return
    }

    const [businessUnitId] = TenantContext.getScope()
    if (!businessUnitId) {
      throw new Error(
        'No se pudo resolver la unidad de negocio: no hay unidad activa en el alcance'
      )
    }
    instance.businessUnitId = businessUnitId
  }

  @column()
  declare proceedingFileId: number

  @column.dateTime({ autoCreate: true })
  declare proceedingFileTypePropertyValueCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare proceedingFileTypePropertyValueUpdatedAt: DateTime

  @column.dateTime({ columnName: 'proceeding_file_type_property_value_deleted_at' })
  declare deletedAt: DateTime | null
}
