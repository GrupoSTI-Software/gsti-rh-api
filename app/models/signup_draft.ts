import { DateTime } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'

/**
 * @swagger
 * components:
 *   schemas:
 *     SignupDraft:
 *       type: object
 *       description: |
 *         Borrador temporal del wizard de signup self-service. Persiste los
 *         datos que el prospecto va capturando entre pasos (datos personales,
 *         empresa, OTP) hasta completar el flujo y materializarse en `Person`,
 *         `User` y `BusinessUnit`. La fila se descarta vía soft delete una vez
 *         consumida o cuando expira el OTP.
 *       properties:
 *         signupDraftId:
 *           type: number
 *         signupDraftEmail:
 *           type: string
 *         signupDraftFirstName:
 *           type: string
 *         signupDraftLastName:
 *           type: string
 *         signupDraftSecondLastName:
 *           type: string
 *           nullable: true
 *         signupDraftBusinessUnitName:
 *           type: string
 *         signupDraftPinCode:
 *           type: string
 *           nullable: true
 *           description: Código OTP de corta vida (5-10 min). No es secreto persistente.
 *         signupDraftPinExpiresAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         signupDraftEmailVerifiedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         signupDraftToken:
 *           type: string
 *           nullable: true
 *           description: Token opaco que autoriza el paso "complete" del wizard.
 *         signupDraftCreatedAt:
 *           type: string
 *           format: date-time
 *         signupDraftUpdatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         signupDraftDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class SignupDraft extends compose(BaseModel, SoftDeletes) {
  static table = 'signup_drafts'

  @column({ isPrimary: true })
  declare signupDraftId: number

  @column()
  declare signupDraftEmail: string

  @column()
  declare signupDraftFirstName: string

  @column()
  declare signupDraftLastName: string

  @column()
  declare signupDraftSecondLastName: string | null

  @column()
  declare signupDraftBusinessUnitName: string

  @column()
  declare signupDraftPinCode: string | null

  @column.dateTime()
  declare signupDraftPinExpiresAt: DateTime | null

  @column.dateTime()
  declare signupDraftEmailVerifiedAt: DateTime | null

  @column()
  declare signupDraftToken: string | null

  @column.dateTime({ autoCreate: true })
  declare signupDraftCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare signupDraftUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'signup_draft_deleted_at' })
  declare deletedAt: DateTime | null
}
