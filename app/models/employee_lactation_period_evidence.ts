import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import EmployeeLactationPeriod from '#models/employee_lactation_period'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'

/**
 * Categoría de evidencia documental adjunta a un periodo de lactancia.
 *
 * - `agreement`: acuerdo escrito patrón-empleada (LFT 170 II).
 * - `birth_support`: comprobante del nacimiento que justifica el periodo.
 * - `other`: cualquier otra evidencia relevante (ej. constancia médica).
 */
export type EmployeeLactationPeriodEvidenceCategory =
  | 'agreement'
  | 'birth_support'
  | 'other'

/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeeLactationPeriodEvidence:
 *       type: object
 *       properties:
 *         employeeLactationPeriodEvidenceId:
 *           type: integer
 *           description: Identificador único de la evidencia.
 *         employeeLactationPeriodId:
 *           type: integer
 *           description: Periodo de lactancia al que está adjunta (FK).
 *         businessUnitId:
 *           type: integer
 *           description: Unidad de negocio dueña (hereda del periodo, USRH1784259058510).
 *         employeeLactationPeriodEvidenceCategory:
 *           type: string
 *           enum: [agreement, birth_support, other]
 *           description: Categoría del documento.
 *         employeeLactationPeriodEvidenceOriginalName:
 *           type: string
 *           nullable: true
 *           description: Nombre original del archivo subido por el usuario.
 *         employeeLactationPeriodEvidenceCreatedAt:
 *           type: string
 *           format: date-time
 *         employeeLactationPeriodEvidenceUpdatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         employeeLactationPeriodEvidenceDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class EmployeeLactationPeriodEvidence extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  static table = 'employee_lactation_period_evidences'

  @column({ isPrimary: true })
  declare employeeLactationPeriodEvidenceId: number

  @column()
  declare employeeLactationPeriodId: number

  /** Marca de pertenencia propia (hereda del periodo, USRH1784259058510). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el periodo padre (nunca del payload). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: EmployeeLactationPeriodEvidence) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () =>
        EmployeeLactationPeriod.query()
          .where('employeeLactationPeriodId', instance.employeeLactationPeriodId)
          .first(),
      'el periodo de lactancia'
    )
  }

  /**
   * `Key` del objeto en S3 (privado). Nunca debe exponerse al cliente; sólo se
   * usa internamente para generar URLs firmadas con `UploadService.getDownloadLink`.
   */
  @column({ serializeAs: null })
  declare employeeLactationPeriodEvidenceFile: string

  @column()
  declare employeeLactationPeriodEvidenceOriginalName: string | null

  @column()
  declare employeeLactationPeriodEvidenceCategory: EmployeeLactationPeriodEvidenceCategory

  @column.dateTime({ autoCreate: true })
  declare employeeLactationPeriodEvidenceCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeLactationPeriodEvidenceUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'employee_lactation_period_evidence_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => EmployeeLactationPeriod, {
    foreignKey: 'employeeLactationPeriodId',
  })
  declare lactationPeriod: BelongsTo<typeof EmployeeLactationPeriod>
}
