import vine from '@vinejs/vine'
import Person from '#models/person'
import { blindIndex } from '#utils/blind_index'
import { noMaskCharRule } from './no_mask_char_rule.js'
import { PERSON_SUBJECT_TYPES } from '#constants/person_subject_type'

export const createPersonValidator = vine.compile(
  vine.object({
    personSubjectType: vine.enum(PERSON_SUBJECT_TYPES).optional(),
    personFirstname: vine.string().trim().minLength(1).maxLength(150),
    personLastname: vine.string().trim().minLength(0).maxLength(150),
    personSecondLastname: vine.string().trim().minLength(0).maxLength(150).optional(),
    personPhone: vine.string().trim().minLength(0).maxLength(45).use(noMaskCharRule()).optional(),
    personEmail: vine
      .string()
      .trim()
      .minLength(0)
      .maxLength(200)
      .use(noMaskCharRule())
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
      .use(noMaskCharRule())
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
      .use(noMaskCharRule())
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
      .use(noMaskCharRule())
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
    personPhone: vine.string().trim().minLength(0).maxLength(45).use(noMaskCharRule()).optional(),
    personPhoneSecondary: vine.string().trim().minLength(0).maxLength(45).use(noMaskCharRule()).optional(),
    personEmail: vine.string().trim().minLength(0).maxLength(200).use(noMaskCharRule()).optional(),
    personGender: vine.string().trim().minLength(0).maxLength(10).optional(),
    personCurp: vine.string().trim().minLength(0).maxLength(45).use(noMaskCharRule()).optional(),
    personRfc: vine.string().trim().minLength(0).maxLength(45).use(noMaskCharRule()).optional(),
    personImssNss: vine.string().trim().minLength(0).maxLength(45).use(noMaskCharRule()).optional(),
  })
)
