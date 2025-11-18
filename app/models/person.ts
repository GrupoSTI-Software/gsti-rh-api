/* eslint-disable max-len */
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column, hasOne } from '@adonisjs/lucid/orm'
import type { HasOne } from '@adonisjs/lucid/types/relations'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import Employee from './employee.js'
import User from './user.js'
/**
 * @swagger
 * components:
 *   schemas:
 *      Person:
 *        type: object
 *        properties:
 *          personId:
 *            type: number
 *            description: Person id
 *          personFirstname:
 *            type: string
 *            description: Person firstname
 *          personLastname:
 *            type: string
 *            description: Person lastname
 *          personSecondLastname:
 *            type: string
 *            description: Person second lastname
 *          personGender:
 *            type: string
 *            description: Person gender
 *          personBirthday:
 *            type: string
 *            description: Person birthday (YYYY-MM-DD)
 *          personPhone:
 *            type: string
 *            description: Person phone
 *          personEmail:
 *            type: string
 *            description: Person email
 *          personPhoneSecundary:
 *            type: string
 *            description: Person phone secundary
 *          personCurp:
 *            type: string
 *            description: Person CURP unique
 *          personRfc:
 *            type: string
 *            description: Person RFC with homoclave, unique
 *          personImssNss:
 *            type: string
 *            description: Person social security number
 *          personMaritalStatus:
 *            type: string
 *            description: Person marital status
 *          personPlaceOfBirthCountry:
 *            type: string
 *            description: Person place of birth country
 *          personPlaceOfBirthState:
 *            type: string
 *            description: Person place of birth state
 *          personPlaceOfCity:
 *            type: string
 *            description: Person place of birth city
 *          personCreatedAt:
 *            type: string
 *          personUpdatedAt:
 *            type: string
 *          personDeletedAt:
 *            type: string
 *
 */

export default class Person extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare personId: number

  @column()
  declare personFirstname: string

  @column()
  declare personLastname: string

  @column()
  declare personSecondLastname: string

  @column()
  declare personGender: string

  @column()
  declare personBirthday: string | null

  @column()
  declare personPhone: string

  @column()
  declare personEmail: string

  @column()
  declare personPhoneSecondary: string

  @column()
  declare personCurp: string

  @column()
  declare personRfc: string

  @column()
  declare personImssNss: string

  @column()
  declare personMaritalStatus: string

  @column()
  declare personPlaceOfBirthCountry: string

  @column()
  declare personPlaceOfBirthState: string

  @column()
  declare personPlaceOfBirthCity: string

  @column.dateTime({ autoCreate: true })
  declare personCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare personUpdatedAt: DateTime

  @column.dateTime({ columnName: 'person_deleted_at' })
  declare deletedAt: DateTime | null

  @hasOne(() => Employee, {
    foreignKey: 'personId',
    localKey: 'personId',
    onQuery: (query) => {
      query.whereNull('deletedAt')
    },
  })
  declare employee: HasOne<typeof Employee>

  @hasOne(() => User, {
    foreignKey: 'personId',
    localKey: 'personId',
    onQuery: (query) => {
      query.whereNull('deletedAt')
    },
  })
  declare user: HasOne<typeof User>
}
