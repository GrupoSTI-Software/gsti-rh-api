import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import TraumaticEventReport from '#models/traumatic_event_report'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'

/**
 * Categoría de la evidencia documental adjunta al reporte.
 *
 * - `written_statement`: escrito del trabajador (NOM-035 §6.5).
 * - `incident_record`: acta o constancia del evento.
 * - `other`: cualquier otra evidencia relevante.
 */
export type TraumaticEventReportEvidenceCategory =
  | 'written_statement'
  | 'incident_record'
  | 'other'

/**
 * @swagger
 * components:
 *   schemas:
 *     TraumaticEventReportEvidence:
 *       type: object
 *       properties:
 *         traumaticEventReportEvidenceId:
 *           type: integer
 *         traumaticEventReportId:
 *           type: integer
 *         businessUnitId:
 *           type: integer
 *           description: Unidad de negocio dueña (hereda del reporte padre, USRH1786595131490).
 *         traumaticEventReportEvidenceCategory:
 *           type: string
 *           enum: [written_statement, incident_record, other]
 *         traumaticEventReportEvidenceOriginalName:
 *           type: string
 *           nullable: true
 *           description: Nombre original del archivo (sin exponer la Key S3).
 *         traumaticEventReportEvidenceCreatedAt:
 *           type: string
 *           format: date-time
 *         traumaticEventReportEvidenceUpdatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class TraumaticEventReportEvidence extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  static readonly table = 'traumatic_event_report_evidences'

  @column({ isPrimary: true })
  declare traumaticEventReportEvidenceId: number

  @column()
  declare traumaticEventReportId: number

  /** Marca de pertenencia propia (hereda del reporte, USRH1786595131490). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el reporte padre (nunca del payload). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: TraumaticEventReportEvidence) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () =>
        TraumaticEventReport.query()
          .where('traumaticEventReportId', instance.traumaticEventReportId)
          .first(),
      'el reporte de evento traumático'
    )
  }

  /**
   * Key del objeto en S3 (privado). `serializeAs: null` garantiza que nunca
   * aparezca en respuestas al cliente; solo se usa internamente para URLs firmadas.
   */
  @column({ serializeAs: null })
  declare traumaticEventReportEvidenceFile: string

  @column()
  declare traumaticEventReportEvidenceOriginalName: string | null

  @column()
  declare traumaticEventReportEvidenceCategory: TraumaticEventReportEvidenceCategory

  @column.dateTime({ autoCreate: true })
  declare traumaticEventReportEvidenceCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare traumaticEventReportEvidenceUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'traumatic_event_report_evidence_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => TraumaticEventReport, { foreignKey: 'traumaticEventReportId' })
  declare report: BelongsTo<typeof TraumaticEventReport>
}
