import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import Regulation from './regulation.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     RegulatoryAuthority:
 *       type: object
 *       description: Autoridad normativa mexicana (STPS, IMSS, INFONAVIT, SAT, INAI, etc.) que emite regulaciones laborales.
 *       properties:
 *         regulatoryAuthorityId:
 *           type: integer
 *           description: Identificador único de la autoridad regulatoria
 *         regulatoryAuthoritySlug:
 *           type: string
 *           description: Identificador textual único (p. ej. "stps", "imss")
 *         regulatoryAuthorityShortName:
 *           type: string
 *           description: Siglas o nombre corto de la autoridad (p. ej. "STPS")
 *         regulatoryAuthorityFullName:
 *           type: string
 *           description: Nombre completo oficial de la autoridad
 *         regulatoryAuthorityCountryCode:
 *           type: string
 *           description: Código ISO 3166-1 alpha-3 del país (default "MX")
 *         regulatoryAuthorityJurisdiction:
 *           type: string
 *           enum: [federal, local, estatal]
 *           description: Ámbito de jurisdicción de la autoridad
 *         regulatoryAuthorityDescriptionKey:
 *           type: string
 *           nullable: true
 *           description: Clave i18n para la descripción de la autoridad (resources/lang/{es,en}/regulatory.json)
 *         regulatoryAuthorityAuditDescriptionKey:
 *           type: string
 *           nullable: true
 *           description: Clave i18n para la descripción de auditoría de la autoridad
 *         regulatoryAuthorityWebsite:
 *           type: string
 *           nullable: true
 *           description: URL del sitio oficial de la autoridad
 *         regulatoryAuthorityIcon:
 *           type: string
 *           nullable: true
 *           description: Nombre del ícono representativo de la autoridad
 *         regulatoryAuthorityBrandColor:
 *           type: string
 *           nullable: true
 *           description: Color de marca en formato hexadecimal (#RRGGBB)
 *         regulatoryAuthorityIsActive:
 *           type: integer
 *           description: Indica si la autoridad está activa (1) o inactiva (0)
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
export default class RegulatoryAuthority extends compose(BaseModel, SoftDeletes) {
  static table = 'regulatory_authorities'

  /** Identificador único de la autoridad regulatoria. */
  @column({ isPrimary: true })
  declare regulatoryAuthorityId: number

  /** Identificador textual único usado en URLs y seeds (p. ej. "stps"). */
  @column()
  declare regulatoryAuthoritySlug: string

  /** Siglas o nombre corto de la autoridad (p. ej. "STPS"). */
  @column()
  declare regulatoryAuthorityShortName: string

  /** Nombre completo oficial de la autoridad. */
  @column()
  declare regulatoryAuthorityFullName: string

  /** Código ISO 3166-1 alpha-3 del país emisor. Default: "MX". */
  @column()
  declare regulatoryAuthorityCountryCode: string

  /** Ámbito de jurisdicción: federal, local o estatal. */
  @column()
  declare regulatoryAuthorityJurisdiction: 'federal' | 'local' | 'estatal'

  /** Clave i18n para descripción general (resources/lang/{es,en}/regulatory.json). */
  @column()
  declare regulatoryAuthorityDescriptionKey: string | null

  /** Clave i18n para descripción orientada a auditoría. */
  @column()
  declare regulatoryAuthorityAuditDescriptionKey: string | null

  /** URL del sitio web oficial de la autoridad. */
  @column()
  declare regulatoryAuthorityWebsite: string | null

  /** Nombre del ícono representativo. */
  @column()
  declare regulatoryAuthorityIcon: string | null

  /** Color de marca en formato hexadecimal (#RRGGBB). */
  @column()
  declare regulatoryAuthorityBrandColor: string | null

  /** Indica si la autoridad está activa (1) o inactiva (0). */
  @column()
  declare regulatoryAuthorityIsActive: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  /** Regulaciones emitidas por esta autoridad. */
  @hasMany(() => Regulation, {
    foreignKey: 'regulatoryAuthorityId',
  })
  declare regulations: HasMany<typeof Regulation>
}
