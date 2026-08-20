/* eslint-disable max-len */
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeSave, column, hasOne } from '@adonisjs/lucid/orm'
import type { HasOne } from '@adonisjs/lucid/types/relations'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import encryption from '@adonisjs/core/services/encryption'
import { blindIndex } from '#utils/blind_index'
import { sensitiveSerialize } from '#helpers/sensitive_serialize'
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
 *          personPhoneSecondary:
 *            type: string
 *            description: Person phone secondary
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

  /**
   * Teléfono principal del trabajador — cifrado AES-256-CBC en reposo (LFPDPPP art. 3.VI,
   * dato de contacto). Columna ampliada a VARCHAR(191). No es clave de búsqueda primaria;
   * su LIKE en person_service se retira en USRH1782854997782 y no se restaura.
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
    serialize: sensitiveSerialize('Person', 'personPhone'),
  })
  declare personPhone: string | null

  /**
   * Correo electrónico del trabajador — cifrado AES-256-CBC en reposo (LFPDPPP art. 3.VI,
   * dato de contacto buscable). Sin ALTER (VARCHAR(200) aloja el ciphertext).
   * La validación de unicidad y la búsqueda LIKE se retiran en USRH1782854997782;
   * se restauran por huella en 08-10-04-01.
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
    serialize: sensitiveSerialize('Person', 'personEmail'),
  })
  declare personEmail: string | null

  /**
   * Teléfono secundario del trabajador — cifrado AES-256-CBC en reposo (LFPDPPP art. 3.VI,
   * dato de contacto). Columna ampliada a VARCHAR(191). Sin búsquedas asociadas.
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
    serialize: sensitiveSerialize('Person', 'personPhoneSecondary'),
  })
  declare personPhoneSecondary: string | null

  /**
   * CURP del trabajador — cifrado AES-256-CBC en reposo (LFPDPPP art. 3.VI, dato de
   * identificación). Columna ampliada a VARCHAR(191) para alojar ciphertext y dejar
   * espacio al blind-index de 08-10-04-01. La validación de unicidad y la búsqueda
   * exacta/LIKE se retiran en USRH1782854997782; se restauran por huella en 08-10-04-01.
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
    serialize: sensitiveSerialize('Person', 'personCurp'),
  })
  declare personCurp: string | null

  /**
   * RFC del trabajador — cifrado AES-256-CBC en reposo (LFPDPPP art. 3.VI, dato de
   * identificación). Columna ampliada a VARCHAR(191). La validación de unicidad y la
   * búsqueda LIKE se retiran en USRH1782854997782; se restauran por huella en 08-10-04-01.
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
    serialize: sensitiveSerialize('Person', 'personRfc'),
  })
  declare personRfc: string | null

  /**
   * NSS (Número de Seguridad Social IMSS) del trabajador — cifrado AES-256-CBC en reposo
   * (LFPDPPP art. 3.VI, dato de identificación). Columna ampliada a VARCHAR(191).
   * La validación de unicidad y la búsqueda LIKE se retiran en USRH1782854997782;
   * se restauran por huella en 08-10-04-01.
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
    serialize: sensitiveSerialize('Person', 'personImssNss'),
  })
  declare personImssNss: string | null

  /** Huella HMAC-SHA256 de personCurp normalizado. Uso interno; no se serializa en respuestas. */
  @column({ serializeAs: null })
  declare personCurpHash: string | null

  /** Huella HMAC-SHA256 de personRfc normalizado. Uso interno; no se serializa en respuestas. */
  @column({ serializeAs: null })
  declare personRfcHash: string | null

  /** Huella HMAC-SHA256 de personImssNss normalizado. Uso interno; no se serializa en respuestas. */
  @column({ serializeAs: null })
  declare personImssNssHash: string | null

  /** Huella HMAC-SHA256 de personEmail normalizado. Uso interno; no se serializa en respuestas. */
  @column({ serializeAs: null })
  declare personEmailHash: string | null

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

  /**
   * Calcula las huellas de los identificadores antes de persistir.
   * Se ejecuta sobre los valores en claro (antes de que `prepare` los cifre).
   * Las huellas permiten validar unicidad sin descifrar (blind-index).
   */
  @beforeSave()
  static calculateIdentifierHashes(person: Person) {
    if (person.personCurp) person.personCurpHash = blindIndex(person.personCurp)
    if (person.personRfc) person.personRfcHash = blindIndex(person.personRfc)
    if (person.personImssNss) person.personImssNssHash = blindIndex(person.personImssNss)
    if (person.personEmail) person.personEmailHash = blindIndex(person.personEmail)
  }

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
