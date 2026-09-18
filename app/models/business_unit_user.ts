import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BusinessUnit from './business_unit.js'
import Role from './role.js'
import User from './user.js'

/**
 * @swagger
 * components:
 *   schemas:
 *      BusinessUnitUser:
 *        type: object
 *        properties:
 *          businessUnitUserId:
 *            type: number
 *            description: Identificador de la relación
 *          businessUnitId:
 *            type: number
 *            description: Identificador de la unidad de negocio asociada
 *          userId:
 *            type: number
 *            description: Identificador del usuario asociado
 *          roleId:
 *            type: number
 *            nullable: true
 *            description: Rol efectivo del usuario dentro de esa empresa
 *          businessUnitUserCreatedAt:
 *            type: string
 *          businessUnitUserUpdatedAt:
 *            type: string
 *          businessUnitUserDeletedAt:
 *            type: string
 *
 */
export default class BusinessUnitUser extends compose(BaseModel, SoftDeletes) {
  static table = 'business_unit_users'

  @column({ isPrimary: true })
  declare businessUnitUserId: number

  @column()
  declare businessUnitId: number

  @column()
  declare userId: number

  /**
   * Rol efectivo del usuario DENTRO de esta empresa. Es la fuente de verdad del
   * rol una vez que los roles tienen dueño (`roles.business_unit_id`): la misma
   * cuenta puede ser dueña en una empresa y colaboradora en otra.
   *
   * `null` mientras el backfill no ha corrido; ahí el runtime cae a
   * `users.role_id`, que es el rol único de la etapa anterior.
   */
  @column()
  declare roleId: number | null

  @column.dateTime({ autoCreate: true })
  declare businessUnitUserCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare businessUnitUserUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'business_unit_user_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => User, {
    foreignKey: 'userId',
  })
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Role, {
    foreignKey: 'roleId',
  })
  declare role: BelongsTo<typeof Role>
}
