import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import RegulatoryAuthority from './regulatory_authority.js'
import RegulationClause from './regulation_clause.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     Regulation:
 *       type: object
 *       description: Norma o ley emitida por una autoridad regulatoria (p. ej. NOM-035-STPS-2018).
 *       properties:
 *         regulationId:
 *           type: integer
 *           description: Identificador único de la regulación
 *         regulatoryAuthorityId:
 *           type: integer
 *           description: FK hacia la autoridad regulatoria emisora
 *         regulationCode:
 *           type: string
 *           description: Código oficial de la regulación (p. ej. "NOM-035-STPS")
 *         regulationTitle:
 *           type: string
 *           description: Título completo de la regulación
 *         regulationType:
 *           type: string
 *           enum: [NOM, NMX, LEY, REGLAMENTO, ACUERDO, RESOLUCION]
 *           description: Tipo normativo de la regulación
 *         regulationVersion:
 *           type: string
 *           description: Versión o año de publicación (p. ej. "2018")
 *         regulationPublicationDate:
 *           type: string
 *           format: date
 *           description: Fecha de publicación en el DOF
 *         regulationEffectiveDate:
 *           type: string
 *           format: date
 *           description: Fecha de entrada en vigor
 *         regulationLastRevisionDate:
 *           type: string
 *           format: date
 *           nullable: true
 *           description: Fecha de la última revisión oficial
 *         regulationStatus:
 *           type: string
 *           enum: [vigente, modificada, derogada]
 *           description: Estado vigente de la regulación
 *         regulationScopeDescriptionKey:
 *           type: string
 *           nullable: true
 *           description: Clave i18n para la descripción del ámbito de aplicación
 *         regulationGeneralAuditDescriptionKey:
 *           type: string
 *           nullable: true
 *           description: Clave i18n para la descripción general de auditoría
 *         regulationOfficialUrl:
 *           type: string
 *           nullable: true
 *           description: URL del DOF o fuente oficial
 *         regulationInternalNotes:
 *           type: string
 *           nullable: true
 *           description: Notas internas de implementación (no expuestas al cliente)
 *         regulationRetentionMinYears:
 *           type: integer
 *           nullable: true
 *           description: Años mínimos de retención documental exigidos por la norma
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         deletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class Regulation extends compose(BaseModel, SoftDeletes) {
  static table = 'regulations'

  /** Identificador único de la regulación. */
  @column({ isPrimary: true })
  declare regulationId: number

  /** FK hacia la autoridad regulatoria emisora. */
  @column()
  declare regulatoryAuthorityId: number

  /** Código oficial (p. ej. "NOM-035-STPS"). */
  @column()
  declare regulationCode: string

  /** Título completo de la regulación. */
  @column()
  declare regulationTitle: string

  /** Tipo normativo: NOM, NMX, LEY, REGLAMENTO, ACUERDO o RESOLUCION. */
  @column()
  declare regulationType: 'NOM' | 'NMX' | 'LEY' | 'REGLAMENTO' | 'ACUERDO' | 'RESOLUCION'

  /** Versión o año de publicación (p. ej. "2018"). */
  @column()
  declare regulationVersion: string

  /** Fecha de publicación en el Diario Oficial de la Federación. */
  @column({
    consume: (value: string) => (value ? new Date(value) : null),
  })
  declare regulationPublicationDate: Date

  /** Fecha de entrada en vigor de la regulación. */
  @column({
    consume: (value: string) => (value ? new Date(value) : null),
  })
  declare regulationEffectiveDate: Date

  /** Fecha de la última revisión oficial (puede ser nula). */
  @column({
    consume: (value: string) => (value ? new Date(value) : null),
  })
  declare regulationLastRevisionDate: Date | null

  /** Estado vigente de la regulación. */
  @column()
  declare regulationStatus: 'vigente' | 'modificada' | 'derogada'

  /** Clave i18n para la descripción del ámbito de aplicación. */
  @column()
  declare regulationScopeDescriptionKey: string | null

  /** Clave i18n para la descripción general de auditoría. */
  @column()
  declare regulationGeneralAuditDescriptionKey: string | null

  /** URL del DOF o fuente oficial de la norma. */
  @column()
  declare regulationOfficialUrl: string | null

  /** Notas internas de implementación; no se exponen al cliente. */
  @column()
  declare regulationInternalNotes: string | null

  /** Años mínimos de retención documental exigidos por la norma. */
  @column()
  declare regulationRetentionMinYears: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  /** Autoridad regulatoria que emitió esta norma. */
  @belongsTo(() => RegulatoryAuthority, {
    foreignKey: 'regulatoryAuthorityId',
  })
  declare regulatoryAuthority: BelongsTo<typeof RegulatoryAuthority>

  /** Numerales jerárquicos (cláusulas) que componen la norma. */
  @hasMany(() => RegulationClause, {
    foreignKey: 'regulationId',
  })
  declare clauses: HasMany<typeof RegulationClause>
}
