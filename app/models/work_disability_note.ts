import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import encryption from '@adonisjs/core/services/encryption'
import User from './user.js'
import WorkDisability from './work_disability.js'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
/**
 * @swagger
 * components:
 *   schemas:
 *      WorkDisabilityNote:
 *        type: object
 *        properties:
 *          workDisabilityNoteId:
 *            type: number
 *            description: Work disability period ID
 *          workDisabilityNoteDescription:
 *           type: string
 *           description: Work disability note description
 *          workDisabilityId:
 *            type: number
 *            description: Work disability Id
 *          businessUnitId:
 *            type: number
 *            description: Unidad de negocio dueña (hereda de la incapacidad, USRH1784259058498)
 *          userId:
 *            type: number
 *            description: User Id
 *          workDisabilityNoteCreatedAt:
 *            type: string
 *            format: date-time
 *          workDisabilityNoteUpdatedAt:
 *            type: string
 *            format: date-time
 *          workDisabilityNoteDeletedAt:
 *            type: string
 *            format: date-time
 *            nullable: true
 */
export default class WorkDisabilityNote extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  @column({ isPrimary: true })
  declare workDisabilityNoteId: number

  /**
   * Descripción de la nota de incapacidad — cifrada AES-256-CBC en reposo
   * (LFPDPPP art. 3.VI, dato de salud sensible reforzado). No se usa en WHERE de SQL.
   */
  @column({
    prepare: (value: string | null) =>
      value !== null && value !== undefined ? encryption.encrypt(value) : null,
    consume: (value: string | null) => {
      if (value === null || value === undefined) return null
      try {
        return encryption.decrypt<string>(value)
      } catch {
        return null
      }
    },
  })
  declare workDisabilityNoteDescription: string

  @column()
  declare workDisabilityId: number

  /** Marca de pertenencia propia (hereda de la incapacidad, USRH1784259058498). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde la incapacidad padre (nunca del payload). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: WorkDisabilityNote) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => WorkDisability.query().where('workDisabilityId', instance.workDisabilityId).first(),
      'la incapacidad'
    )
  }

  @column()
  declare userId: number

  @column.dateTime({ autoCreate: true })
  declare workDisabilityNoteCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare workDisabilityNoteUpdatedAt: DateTime

  @column.dateTime({ columnName: 'work_disability_note_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => User, {
    foreignKey: 'userId',
    onQuery: (query) => {
      query.preload('person')
    },
  })
  declare user: BelongsTo<typeof User>
}
