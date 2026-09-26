import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import EmployeeOffboardingItem from '#models/employee_offboarding_item'

/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeeOffboardingItemEvidence:
 *       type: object
 *       properties:
 *         employeeOffboardingItemEvidenceId:
 *           type: integer
 *         employeeOffboardingItemId:
 *           type: integer
 *         employeeOffboardingItemEvidenceOriginalName:
 *           type: string
 *           nullable: true
 *           description: Nombre original del archivo (sin exponer la Key S3).
 *         employeeOffboardingItemEvidenceCreatedAt:
 *           type: string
 *           format: date-time
 */
/**
 * Evidencia adjunta a un pendiente del expediente de salida
 * (USRH1786568279593). SIN `withBusinessUnitScope()`: el aislamiento lo da el
 * expediente padre por su `business_unit_id` snapshoteado (D-8), igual que el
 * precedente `traumatic_event_report_evidence`.
 */
export default class EmployeeOffboardingItemEvidence extends compose(BaseModel, SoftDeletes) {
  static readonly table = 'employee_offboarding_item_evidences'

  @column({ isPrimary: true })
  declare employeeOffboardingItemEvidenceId: number

  @column()
  declare employeeOffboardingItemId: number

  /**
   * Key del objeto en S3 (privado). `serializeAs: null` garantiza que nunca
   * aparezca en respuestas al cliente; solo se usa para firmar URLs.
   */
  @column({ serializeAs: null })
  declare employeeOffboardingItemEvidenceFile: string

  @column()
  declare employeeOffboardingItemEvidenceOriginalName: string | null

  @column.dateTime({ autoCreate: true })
  declare employeeOffboardingItemEvidenceCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeOffboardingItemEvidenceUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'employee_offboarding_item_evidence_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => EmployeeOffboardingItem, { foreignKey: 'employeeOffboardingItemId' })
  declare item: BelongsTo<typeof EmployeeOffboardingItem>
}
