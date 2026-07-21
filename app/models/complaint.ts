import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Employee from './employee.js'
import BusinessUnit from './business_unit.js'
import ComplaintCategory from './complaint_category.js'
import type { ComplaintStatus } from '#constants/complaint'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'

/**
 * @swagger
 * components:
 *   schemas:
 *     Complaint:
 *       type: object
 *       properties:
 *         complaintId:
 *           type: number
 *           description: Complaint id
 *         complaintFolio:
 *           type: string
 *           description: Complaint folio
 *         complaintCategoryId:
 *           type: number
 *           description: FK al catálogo de categorías del buzón (NOM-035)
 *         complaintDescription:
 *           type: string
 *           description: description of the complaint
 *         complaintStatus:
 *           type: string
 *           enum: [nuevo, en-revision, resuelto, cerrado]
 *           description: Complaint workflow status
 *         complaintCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Complaint created at
 *         complaintUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Complaint updated at
 *         complaintDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Complaint deleted at
 */
export default class Complaint extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  static table = 'complaints'

  @column({ isPrimary: true })
  declare complaintId: number

  /** FK confidencial: no se expone en serializers por defecto. */
  @column({ serializeAs: null })
  declare employeeId: number

  /**
   * Marca de pertenencia — ya se puebla en `complaint_service.ts` al crear
   * (desde `employee.businessUnitId`). Hook defensivo: guard estándar, no
   * resuelve nada nuevo (USRH1784259058521).
   */
  @column()
  declare businessUnitId: number

  /** Guard defensivo: no sobreescribe si ya viene poblado desde el servicio. */
  @beforeCreate()
  static async assignBusinessUnitId(instance: Complaint) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

  @column()
  declare complaintFolio: string

  @column({ serializeAs: null })
  declare complaintPassphraseHash: string

  @column()
  declare complaintCategoryId: number

  @column()
  declare complaintDescription: string

  @column()
  declare complaintStatus: ComplaintStatus

  @column.dateTime({ autoCreate: true })
  declare complaintCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare complaintUpdatedAt: DateTime

  @column.dateTime({ columnName: 'complaint_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, { foreignKey: 'employeeId' })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => BusinessUnit, { foreignKey: 'businessUnitId' })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => ComplaintCategory, { foreignKey: 'complaintCategoryId' })
  declare complaintCategory: BelongsTo<typeof ComplaintCategory>
}
