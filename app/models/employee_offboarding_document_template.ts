import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BusinessUnit from '#models/business_unit'
import User from '#models/user'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import type { DocumentTemplateValidationResult } from '#modules/employee-offboarding/document-templates/document_template_validation_result.type'

/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeeOffboardingDocumentTemplate:
 *       type: object
 *       properties:
 *         employeeOffboardingDocumentTemplateId:
 *           type: integer
 *         employeeOffboardingDocumentTemplateDocumentType:
 *           type: string
 *           enum: [separation_letter]
 *         employeeOffboardingDocumentTemplateVersionNumber:
 *           type: integer
 *         employeeOffboardingDocumentTemplateStatus:
 *           type: string
 *           enum: [current, superseded, rejected]
 *         employeeOffboardingDocumentTemplateOriginalFileName:
 *           type: string
 *         employeeOffboardingDocumentTemplateFileSizeBytes:
 *           type: integer
 *         employeeOffboardingDocumentTemplateContentSha256:
 *           type: string
 *           description: sha256 hex del archivo TAL COMO quedó almacenado (post-intake).
 *         employeeOffboardingDocumentTemplateValidationResult:
 *           type: object
 *           nullable: true
 *         employeeOffboardingDocumentTemplateUploadedByUserId:
 *           type: integer
 *           nullable: true
 *         employeeOffboardingDocumentTemplateCreatedAt:
 *           type: string
 *           format: date-time
 */
/**
 * Versión de la plantilla propia del documento de salida (USRH1788553841100).
 * Compone `withBusinessUnitScope()` como defensa en profundidad — el mixin es
 * fail-open sin `TenantContext`, así que el candado real es el
 * `business_unit_id` explícito del repositorio. SIN `SoftDeletes`: ninguna
 * versión se borra (regla 5). La columna generada `..._is_current` que
 * sostiene el UNIQUE de vigencia NO se declara: MySQL rechaza escribirla.
 */
export default class EmployeeOffboardingDocumentTemplate extends compose(
  BaseModel,
  withBusinessUnitScope()
) {
  static readonly table = 'employee_offboarding_document_templates'

  @column({ isPrimary: true })
  declare employeeOffboardingDocumentTemplateId: number

  @column()
  declare businessUnitId: number

  @column()
  declare employeeOffboardingDocumentTemplateDocumentType: string

  @column()
  declare employeeOffboardingDocumentTemplateVersionNumber: number

  @column()
  declare employeeOffboardingDocumentTemplateStatus: string

  /**
   * Key privada de S3. `serializeAs: null` es el primer candado; el segundo
   * es el DTO enumerado campo por campo, que tampoco la incluye.
   */
  @column({ serializeAs: null })
  declare employeeOffboardingDocumentTemplateStorageKey: string

  @column()
  declare employeeOffboardingDocumentTemplateOriginalFileName: string

  @column()
  declare employeeOffboardingDocumentTemplateFileSizeBytes: number

  /**
   * `columnName` explícito: la estrategia de nombres de Lucid separa los
   * dígitos (`…_content_sha_256`) y la columna real es `…_content_sha256`.
   */
  @column({ columnName: 'employee_offboarding_document_template_content_sha256' })
  declare employeeOffboardingDocumentTemplateContentSha256: string

  /**
   * JSON tipado (`DocumentTemplateValidationResult | null`). Esta rebanada
   * siempre escribe `null`; lo puebla ESB-05-07-08. El driver puede devolver
   * la columna JSON ya parseada o como cadena: `consume` acepta ambas.
   */
  @column({
    prepare: (value: DocumentTemplateValidationResult | null | undefined): string | null =>
      value === null || value === undefined ? null : JSON.stringify(value),
    consume: (value: unknown): DocumentTemplateValidationResult | null => {
      if (value === null || value === undefined) return null
      if (typeof value === 'string') {
        try {
          return JSON.parse(value) as DocumentTemplateValidationResult
        } catch {
          return null
        }
      }
      return value as DocumentTemplateValidationResult
    },
  })
  declare employeeOffboardingDocumentTemplateValidationResult: DocumentTemplateValidationResult | null

  @column()
  declare employeeOffboardingDocumentTemplateUploadedByUserId: number | null

  @column.dateTime({ autoCreate: true })
  declare employeeOffboardingDocumentTemplateCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeOffboardingDocumentTemplateUpdatedAt: DateTime | null

  @belongsTo(() => BusinessUnit, { foreignKey: 'businessUnitId' })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => User, { foreignKey: 'employeeOffboardingDocumentTemplateUploadedByUserId' })
  declare uploadedByUser: BelongsTo<typeof User>
}
