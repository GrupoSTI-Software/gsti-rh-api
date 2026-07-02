import vine from '@vinejs/vine'
import Person from '#models/person'
import { blindIndex } from '#utils/blind_index'

export const createPersonValidator = vine.compile(
  vine.object({
    personFirstname: vine.string().trim().minLength(1).maxLength(150),
    personLastname: vine.string().trim().minLength(0).maxLength(150),
    personSecondLastname: vine.string().trim().minLength(0).maxLength(150).optional(),
    personPhone: vine.string().trim().minLength(0).maxLength(45).optional(),
    personEmail: vine
      .string()
      .trim()
      .minLength(0)
      .maxLength(200)
      .unique(async (_db, value) => {
        if (!value || value.trim() === '') return true
        const existing = await Person.query()
          .whereNull('person_deleted_at')
          .where('person_email_hash', blindIndex(value))
          .first()
        return !existing
      })
      .optional(),
    personGender: vine.string().trim().minLength(0).maxLength(10).optional(),
    personCurp: vine
      .string()
      .trim()
      .minLength(0)
      .maxLength(45)
      .unique(async (_db, value) => {
        if (!value || value.trim() === '') return true
        const existing = await Person.query()
          .whereNull('person_deleted_at')
          .where('person_curp_hash', blindIndex(value))
          .first()
        return !existing
      })
      .optional(),
    personRfc: vine
      .string()
      .trim()
      .minLength(0)
      .maxLength(45)
      .unique(async (_db, value) => {
        if (!value || value.trim() === '') return true
        const existing = await Person.query()
          .whereNull('person_deleted_at')
          .where('person_rfc_hash', blindIndex(value))
          .first()
        return !existing
      })
      .optional(),
    personImssNss: vine
      .string()
      .trim()
      .minLength(0)
      .maxLength(45)
      .unique(async (_db, value) => {
        if (!value || value.trim() === '') return true
        const existing = await Person.query()
          .whereNull('person_deleted_at')
          .where('person_imss_nss_hash', blindIndex(value))
          .first()
        return !existing
      })
      .optional(),
  })
)

export const updatePersonValidator = vine.compile(
  vine.object({
    personFirstname: vine.string().trim().minLength(1).maxLength(150),
    personLastname: vine.string().trim().minLength(0).maxLength(150),
    personSecondLastname: vine.string().trim().minLength(0).maxLength(150).optional(),
    personPhone: vine.string().trim().minLength(0).maxLength(45).optional(),
    personEmail: vine.string().trim().minLength(0).maxLength(200).optional(),
    personGender: vine.string().trim().minLength(0).maxLength(10).optional(),
    personCurp: vine.string().trim().minLength(0).maxLength(45).optional(),
    personRfc: vine.string().trim().minLength(0).maxLength(45).optional(),
    personImssNss: vine.string().trim().minLength(0).maxLength(45).optional(),
  })
)
