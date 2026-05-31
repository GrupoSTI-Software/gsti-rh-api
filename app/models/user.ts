import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column, manyToMany } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import Person from './person.js'
import type { BelongsTo, ManyToMany } from '@adonisjs/lucid/types/relations'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import Role from './role.js'
import BusinessUnit from './business_unit.js'

/**
 * @swagger
 * components:
 *   schemas:
 *      User:
 *        type: object
 *        properties:
 *          userId:
 *            type: number
 *            description: User id
 *          userEmail:
 *            type: string
 *            description: User email
 *          userPassword:
 *            type: string
 *            description: User password
 *          userToken:
 *            type: string
 *            description: User token
 *          userActive:
 *            type: number
 *            description: User status
 *          userPinCode:
 *            type: string
 *            description: User pin code
 *          userPinCodeExpiresAt:
 *            type: Date
 *            description: User expiration date pin code
 *          roleId:
 *            type: number
 *            description: Role id
 *          personId:
 *            type: number
 *            description: Person id
 *          userBusinessAccess:
 *            type: string
 *            deprecated: true
 *            description: |
 *              [Deprecado] CSV legado con los slugs de las unidades de negocio asignadas al usuario.
 *              La nueva fuente de verdad es la tabla pivote `business_unit_users` (relación `businessUnits`).
 *              Esta columna se conserva por compatibilidad con código heredado que aún la lee.
 *          userEmailType:
 *            type: string
 *            description: Email type
 *          userCreatedAt:
 *            type: string
 *          userUpdatedAt:
 *            type: string
 *          userDeletedAt:
 *            type: string
 *
 */

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['userEmail'],
  passwordColumnName: 'userPassword',
})

export default class User extends compose(BaseModel, SoftDeletes, AuthFinder) {
  static accessTokens = DbAccessTokensProvider.forModel(User, {
    expiresIn: 60 * 60 * 24,
    prefix: 'oauth__sae__',
    table: 'api_tokens',
    type: 'auth_token',
    tokenSecretLength: 80,
  })

  @column({ isPrimary: true })
  declare userId: number

  @column()
  declare userEmail: string

  @column({ serializeAs: null })
  declare userPassword: string

  @column()
  declare userToken: string

  @column()
  declare userActive: number

  /**
   * Marca temporal de cuándo el usuario verificó su email mediante el flujo de
   * signup self-service (OTP a correo). `null` para todos los usuarios creados
   * antes de habilitar signup; el login legacy NO evalúa esta columna.
   */
  @column.dateTime()
  declare userEmailVerifiedAt: DateTime | null

  @column()
  declare pinCode: string

  @column()
  declare userPinCodeExpiresAt: DateTime | null

  /**
   * @deprecated CSV legado con los slugs de las unidades de negocio asignadas al usuario.
   *
   * La nueva fuente de verdad es la tabla pivote `business_unit_users`, expuesta a través
   * de la relación `businessUnits`. Esta columna permanece nullable en la base de datos por
   * compatibilidad con código heredado que aún la lee (~27 archivos del repositorio).
   *
   * Su eliminación física se programará en una historia posterior, una vez confirmado en
   * producción que la pivote es la única fuente consultada.
   */
  @column()
  declare userBusinessAccess: string | null

  @column()
  declare roleId: number

  @column()
  declare personId: number

  @column()
  declare userEmailType: string

  @column.dateTime({ autoCreate: true })
  declare userCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare userUpdatedAt: DateTime

  @column.dateTime({ columnName: 'user_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Person, {
    foreignKey: 'personId',
  })
  declare person: BelongsTo<typeof Person>

  @belongsTo(() => Role, {
    foreignKey: 'roleId',
  })
  declare role: BelongsTo<typeof Role>

  /**
   * Unidades de negocio a las que el usuario tiene acceso.
   * Fuente de verdad para el aislamiento multi-tenant a nivel de usuario.
   */
  @manyToMany(() => BusinessUnit, {
    pivotTable: 'business_unit_users',
    localKey: 'userId',
    pivotForeignKey: 'user_id',
    relatedKey: 'businessUnitId',
    pivotRelatedForeignKey: 'business_unit_id',
    pivotTimestamps: {
      createdAt: 'business_unit_user_created_at',
      updatedAt: 'business_unit_user_updated_at',
    },
    onQuery(query) {
      query.whereNull('business_unit_user_deleted_at')
    },
  })
  declare businessUnits: ManyToMany<typeof BusinessUnit>
}
