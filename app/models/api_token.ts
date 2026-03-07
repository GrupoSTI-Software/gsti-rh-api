import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'
/**
 * @swagger
 * components:
 *   schemas:
 *      ApiToken:
 *        type: object
 *        properties:
 *          id:
 *            type: number
 *            description: Token id
 *          type:
 *            type: string
 *            description: Token type
 *          origin:
 *            type: string
 *            description: Token origin
 *          token:
 *            type: string
 *            description: Token
 *          name:
 *            type: string
 *            description: Token name
 *          userId:
 *            type: number
 *            description: User id
 *          apiTokenBrowser:
 *            type: string
 *            description: Browser
 *          createdAt:
 *            type: string
 *          expiresAt:
 *            type: string
 *            description: Expiration date
 *
 */

export default class ApiToken extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare type: string

  @column()
  declare origin: string

  @column()
  declare token: string

  @column()
  declare name: string

  @column()
  declare userId: number

  @column()
  declare apiTokenBrowser: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime()
  declare expiresAt: DateTime
}
