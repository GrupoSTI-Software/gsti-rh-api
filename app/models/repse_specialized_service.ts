import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column, manyToMany } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo, ManyToMany } from '@adonisjs/lucid/types/relations'
import RepseRegistration from '#models/repse_registration'
import ContratoServicioEspecializado from '#models/contrato_servicio_especializado'

/**
 * Estados permitidos para un servicio especializado REPSE. Fuente única: el
 * validator y el tipo se derivan de esta lista.
 *
 * - `active`: el servicio se presta y puede ligarse a contratos.
 * - `inactive`: el servicio se conserva en el catálogo (y en los contratos que
 *   ya lo cubren) pero dejó de ofrecerse.
 *
 * La columna es `VARCHAR(20)`, no `ENUM`: agregar un estado no requiere migración.
 */
export const REPSE_SPECIALIZED_SERVICE_STATUS_VALUES = ['active', 'inactive'] as const

export type RepseSpecializedServiceStatus = (typeof REPSE_SPECIALIZED_SERVICE_STATUS_VALUES)[number]

/**
 * Excepción intencional al mixin `withBusinessUnitScope()` (USRH1783691644909):
 * este modelo no tiene columna `business_unit_id` propia (relación indirecta,
 * ver JSDoc del mixin) y esta HU no agrega migraciones. Su aislamiento se
 * hereda del padre `RepseRegistration` (que sí compone el mixin) mediante
 * `whereHas('repseRegistration', ...)` en cada acceso — ver
 * `repse_specialized_service_service.ts`. Nunca se consulta por PK propio
 * sin ese join.
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     RepseSpecializedService:
 *       type: object
 *       properties:
 *         repseSpecializedServiceId:
 *           type: integer
 *           description: Identificador único del servicio especializado.
 *         repseRegistrationId:
 *           type: integer
 *           description: Registro REPSE padre que ampara este servicio.
 *         name:
 *           type: string
 *           maxLength: 150
 *           description: Nombre del servicio o actividad especializada.
 *         objectDescription:
 *           type: string
 *           description: Descripción del objeto o alcance del servicio.
 *         status:
 *           type: string
 *           enum: [active, inactive]
 *           description: Estado del servicio.
 *         repseSpecializedServiceCreatedAt:
 *           type: string
 *           format: date-time
 *         repseSpecializedServiceUpdatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         repseSpecializedServiceDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class RepseSpecializedService extends compose(BaseModel, SoftDeletes) {
  static table = 'repse_specialized_services'

  @column({ isPrimary: true })
  declare repseSpecializedServiceId: number

  @column()
  declare repseRegistrationId: number

  @column({ columnName: 'repse_specialized_service_name' })
  declare name: string

  @column({ columnName: 'repse_specialized_service_object_description' })
  declare objectDescription: string

  @column({ columnName: 'repse_specialized_service_status' })
  declare status: RepseSpecializedServiceStatus

  @column.dateTime({ autoCreate: true, columnName: 'repse_specialized_service_created_at' })
  declare repseSpecializedServiceCreatedAt: DateTime

  @column.dateTime({
    autoCreate: true,
    autoUpdate: true,
    columnName: 'repse_specialized_service_updated_at',
  })
  declare repseSpecializedServiceUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'repse_specialized_service_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => RepseRegistration, {
    foreignKey: 'repseRegistrationId',
    localKey: 'repseRegistrationId',
  })
  declare repseRegistration: BelongsTo<typeof RepseRegistration>

  @manyToMany(() => ContratoServicioEspecializado, {
    pivotTable: 'contrato_servicio_repse',
    localKey: 'repseSpecializedServiceId',
    pivotForeignKey: 'repse_specialized_service_id',
    relatedKey: 'contratoServicioEspecializadoId',
    pivotRelatedForeignKey: 'contrato_servicio_especializado_id',
    pivotTimestamps: true,
  })
  declare contratosServiciosEspecializados: ManyToMany<typeof ContratoServicioEspecializado>
}
