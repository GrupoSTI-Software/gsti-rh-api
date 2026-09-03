import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import EmployeeOffboarding from '#models/employee_offboarding'
import User from '#models/user'

/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeeOffboardingDocument:
 *       type: object
 *       properties:
 *         employeeOffboardingDocumentId:
 *           type: integer
 *         employeeOffboardingId:
 *           type: integer
 *         employeeOffboardingDocumentType:
 *           type: string
 *           enum: [separation_letter]
 *         employeeOffboardingDocumentFolio:
 *           type: string
 *         employeeOffboardingDocumentFileName:
 *           type: string
 *         employeeOffboardingDocumentSizeBytes:
 *           type: integer
 *         employeeOffboardingDocumentEmployeeName:
 *           type: string
 *         employeeOffboardingDocumentPositionName:
 *           type: string
 *           nullable: true
 *         employeeOffboardingDocumentDepartmentName:
 *           type: string
 *           nullable: true
 *         employeeOffboardingDocumentLegalName:
 *           type: string
 *         employeeOffboardingDocumentHireDate:
 *           type: string
 *           format: date
 *         employeeOffboardingDocumentReferenceDate:
 *           type: string
 *           format: date
 *         employeeOffboardingDocumentReferenceDateSource:
 *           type: string
 *           enum: [terminated, planned]
 *         employeeOffboardingDocumentSeniorityDays:
 *           type: integer
 *         employeeOffboardingDocumentContentHash:
 *           type: string
 *           description: sha256 hex del archivo emitido (integridad, no autoría).
 *         employeeOffboardingDocumentIsCurrent:
 *           type: boolean
 *         employeeOffboardingDocumentGeneratedByUserId:
 *           type: integer
 *           nullable: true
 *         employeeOffboardingDocumentCreatedAt:
 *           type: string
 *           format: date-time
 */
/**
 * Documento emitido del expediente de salida (USRH1787433503686). SIN
 * `withBusinessUnitScope()`: el aislamiento lo da el expediente padre por su
 * `business_unit_id` snapshoteado (dos saltos), igual que las evidencias; el
 * mixin es no-op sin `TenantContext` y componerlo aquí crearía dos políticas
 * de aislamiento en el mismo módulo.
 */
export default class EmployeeOffboardingDocument extends compose(BaseModel, SoftDeletes) {
  static readonly table = 'employee_offboarding_documents'

  @column({ isPrimary: true })
  declare employeeOffboardingDocumentId: number

  @column()
  declare employeeOffboardingId: number

  @column()
  declare employeeOffboardingDocumentType: string

  @column()
  declare employeeOffboardingDocumentFolio: string

  /**
   * Key del objeto en S3 (privado). `serializeAs: null` garantiza que nunca
   * aparezca en respuestas al cliente; solo se usa para firmar URLs.
   */
  @column({ serializeAs: null })
  declare employeeOffboardingDocumentFile: string

  @column()
  declare employeeOffboardingDocumentFileName: string

  @column()
  declare employeeOffboardingDocumentSizeBytes: number

  @column()
  declare employeeOffboardingDocumentEmployeeName: string

  @column()
  declare employeeOffboardingDocumentPositionName: string | null

  @column()
  declare employeeOffboardingDocumentDepartmentName: string | null

  @column()
  declare employeeOffboardingDocumentLegalName: string

  @column.date()
  declare employeeOffboardingDocumentHireDate: DateTime

  @column.date()
  declare employeeOffboardingDocumentReferenceDate: DateTime

  @column()
  declare employeeOffboardingDocumentReferenceDateSource: string

  @column()
  declare employeeOffboardingDocumentSeniorityDays: number

  @column()
  declare employeeOffboardingDocumentContentHash: string

  @column()
  declare employeeOffboardingDocumentIsCurrent: boolean

  @column()
  declare employeeOffboardingDocumentSupersededDocumentId: number | null

  @column()
  declare employeeOffboardingDocumentGeneratedByUserId: number | null

  @column.dateTime({ autoCreate: true })
  declare employeeOffboardingDocumentCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeOffboardingDocumentUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'employee_offboarding_document_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => EmployeeOffboarding, { foreignKey: 'employeeOffboardingId' })
  declare offboarding: BelongsTo<typeof EmployeeOffboarding>

  @belongsTo(() => User, { foreignKey: 'employeeOffboardingDocumentGeneratedByUserId' })
  declare generatedByUser: BelongsTo<typeof User>
}
