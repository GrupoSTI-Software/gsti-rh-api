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
  /**
   * TTL del access token en segundos (15 min para web y app).
   */
  static accessTokenExpiresIn(): number {
    return 60 * 15
  }

  static accessTokens = DbAccessTokensProvider.forModel(User, {
    expiresIn: User.accessTokenExpiresIn(),
    prefix: 'oauth__sae__',
    table: 'api_tokens',
    type: 'auth_token',
    tokenSecretLength: 80,
  })

  static refreshTokens = DbAccessTokensProvider.forModel(User, {
    expiresIn: 60 * 60 * 24 * 7,
    prefix: 'refresh__sae__',
    table: 'api_tokens',
    type: 'refresh_token',
    tokenSecretLength: 80,
  })

  /**
   * TTL del magic link en segundos (15 min, un solo uso).
   */
  static magicLinkTokenExpiresIn(): number {
    return 60 * 15
  }

  static magicLinkTokens = DbAccessTokensProvider.forModel(User, {
    expiresIn: User.magicLinkTokenExpiresIn(),
    prefix: 'magic__sae__',
    table: 'api_tokens',
    type: 'magic_link',
    tokenSecretLength: 80,
  })

  /**
   * TTL del refresh token en segundos según el origin de la sesión.
   * - app:      30 días
   * - web:      7 días
   * - platform: 7 días (consola landlord — misma ventana que web)
   */
  static refreshTokenExpiresIn(origin: string): number {
    if (origin === 'app') {
      return 60 * 60 * 24 * 30
    }

    if (origin === 'platform') {
      return 60 * 60 * 24 * 7
    }

    return 60 * 60 * 24 * 7
  }

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
   * Indica si el usuario es administrador de la plataforma SaaS (consola interna GSTI).
   * Por defecto `false`; solo se enciende vía bootstrap manual o `POST /api/platform/users`.
   * Ningún flujo de tenant puede escribir este campo.
   */
  @column({ columnName: 'is_platform_admin' })
  declare isPlatformAdmin: boolean

  /**
   * Marca temporal de cuándo el usuario verificó su email mediante el flujo de
   * signup self-service (OTP a correo). `null` para todos los usuarios creados
   * antes de habilitar signup; el login legacy NO evalúa esta columna.
   */
  @column.dateTime()
  declare userEmailVerifiedAt: DateTime | null

  @column()
  declare pinCode: string

  @column.dateTime({ columnName: 'pin_code_expires_at' })
  declare pinCodeExpiresAt: DateTime | null

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
