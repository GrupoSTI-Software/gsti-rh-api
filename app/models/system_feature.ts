import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import SystemModule from './system_module.js'
import type RegulationClauseFeature from './regulation_clause_feature.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     SystemFeature:
 *       type: object
 *       description: >
 *         Catálogo de funcionalidades del producto Valanserh, organizadas por módulo.
 *         Cada feature tiene un slug estable que la identifica a lo largo de versiones
 *         y un estado global de release (planeado, en_desarrollo, disponible, deprecado).
 *         La relación con numerales regulatorios se establece a través de
 *         regulation_clause_features, permitiendo calcular cobertura normativa
 *         sin mantenimiento manual de porcentajes.
 *       properties:
 *         systemFeatureId:
 *           type: integer
 *           description: Identificador único de la funcionalidad
 *         systemModuleId:
 *           type: integer
 *           description: FK hacia el módulo del sistema al que pertenece la funcionalidad
 *         systemFeatureName:
 *           type: string
 *           description: Nombre descriptivo de la funcionalidad (texto directo, sin i18n en BD)
 *         systemFeatureSlug:
 *           type: string
 *           description: Identificador estable de la funcionalidad (p. ej. "encuesta-nom035-guia-ii")
 *         systemFeatureDescription:
 *           type: string
 *           nullable: true
 *           description: Descripción breve de la funcionalidad y su propósito
 *         systemFeatureStatus:
 *           type: string
 *           enum: [planeado, en_desarrollo, disponible, deprecado]
 *           description: Estado global de release de la funcionalidad
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
export default class SystemFeature extends compose(BaseModel, SoftDeletes) {
  static table = 'system_features'

  /** Identificador único de la funcionalidad. */
  @column({ isPrimary: true })
  declare systemFeatureId: number

  /** FK hacia el módulo del sistema al que pertenece la funcionalidad. */
  @column()
  declare systemModuleId: number

  /** Nombre descriptivo de la funcionalidad (texto directo, sin i18n en BD). */
  @column()
  declare systemFeatureName: string

  /**
   * Identificador estable de la funcionalidad a lo largo de versiones.
   * Ejemplo: "encuesta-nom035-guia-ii", "verificacion-teletrabajo-lista".
   * Único por módulo.
   */
  @column()
  declare systemFeatureSlug: string

  /** Descripción breve de la funcionalidad y su propósito. Puede ser nula. */
  @column()
  declare systemFeatureDescription: string | null

  /**
   * Estado global de release de la funcionalidad.
   * - planeado: en backlog, sin implementación.
   * - en_desarrollo: en sprint activo.
   * - disponible: liberado y accesible para clientes.
   * - deprecado: retirado, reemplazado o discontinuado.
   */
  @column()
  declare systemFeatureStatus: 'planeado' | 'en_desarrollo' | 'disponible' | 'deprecado'

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  /** Módulo del sistema al que pertenece esta funcionalidad. */
  @belongsTo(() => SystemModule, {
    foreignKey: 'systemModuleId',
  })
  declare systemModule: BelongsTo<typeof SystemModule>

  /** Vínculos de cobertura de esta funcionalidad con numerales regulatorios. */
  @hasMany(
    () =>
      // Importación dinámica para evitar dependencia circular con regulation_clause.ts
      import('./regulation_clause_feature.js').then((m) => m.default) as any,
    { foreignKey: 'systemFeatureId' }
  )
  declare regulationClauseFeatures: HasMany<typeof RegulationClauseFeature>
}
