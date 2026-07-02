import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, column, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import type { HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import { randomUUID } from 'node:crypto'
import User from './user.js'
import RepseRegistration from './repse_registration.js'

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
  /**
   * Identificador interno secuencial. Solo para FK en tablas internas;
   * nunca se expone en respuestas de la API (serializeAs: null).
   */
  @column({ isPrimary: true, serializeAs: null })
  declare businessUnitId: number

  /**
   * Código público no adivinable (UUID v4). Es el identificador externo
   * de la unidad de negocio en toda comunicación con clientes.
   * Se genera automáticamente al crear el registro (hook beforeCreate).
   */
  @column()
  declare businessUnitPublicId: string

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

  /** Genera el código público (UUID v4) automáticamente al crear la unidad. */
  @beforeCreate()
  static assignPublicId(businessUnit: BusinessUnit) {
    if (!businessUnit.businessUnitPublicId) {
      businessUnit.businessUnitPublicId = randomUUID()
    }
  }

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

  /**
   * Repse asociado a la empresa (catálogo del módulo Repse).
   */
  @hasMany(() => RepseRegistration, {
    foreignKey: 'businessUnitId',
    localKey: 'businessUnitId',
  })
  declare repseRegistrations: HasMany<typeof RepseRegistration>
}
