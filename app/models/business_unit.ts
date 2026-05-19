import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import { BaseModel, column, manyToMany } from '@adonisjs/lucid/orm'
import type { ManyToMany } from '@adonisjs/lucid/types/relations'
import User from './user.js'

/**
 * @swagger
 * components:
 *   schemas:
 *      BusinessUnit:
 *        type: object
 *        properties:
 *          businessUnitId:
 *            type: number
 *            description: Id of the object
 *          businessUnitName:
 *            type: string
 *            description: Name of the business
 *          businessUnitSlug:
 *            type: string
 *            description: Clean name of the business
 *          businessUnitLegalName:
 *            type: string
 *            description: Legal name of business
 *          businessUnitcreatedAt:
 *            type: string
 *            description: Date of creation
 *          businessUnitUpdatedAt:
 *            type: string
 *            description: Date of last update
 *          businessUnitDeletedAt:
 *            type: string
 *            description: Date of logic delete
 *
 */
export default class BusinessUnit extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare businessUnitId: number

  @column()
  declare businessUnitName: string

  @column()
  declare businessUnitSlug: string

  @column()
  declare businessUnitLegalName: string

  @column()
  declare businessUnitActive: number

  @column.dateTime({ autoCreate: true })
  declare businessUnitCreatedAt: DateTime | null

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare businessUnitUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'business_unit_deleted_at' })
  declare deletedAt: DateTime | null

  /**
   * Usuarios con acceso a esta unidad de negocio (relación inversa de User.businessUnits).
   */
  @manyToMany(() => User, {
    pivotTable: 'business_unit_users',
    localKey: 'businessUnitId',
    pivotForeignKey: 'business_unit_id',
    relatedKey: 'userId',
    pivotRelatedForeignKey: 'user_id',
    pivotTimestamps: {
      createdAt: 'business_unit_user_created_at',
      updatedAt: 'business_unit_user_updated_at',
    },
  })
  declare users: ManyToMany<typeof User>
}
