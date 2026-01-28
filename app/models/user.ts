import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import Person from './person.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import Role from './role.js'

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
 *            description: Business access
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

  @column()
  declare pinCode: string

  @column()
  declare userPinCodeExpiresAt: DateTime | null

  @column()
  declare userBusinessAccess: string

  @column()
  declare roleId: number

  @column()
  declare personId: number

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
}
