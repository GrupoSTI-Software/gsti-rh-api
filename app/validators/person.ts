import vine from '@vinejs/vine'
import { blindIndex } from '#utils/blind_index'
import { TenantContext } from '#utils/tenant_context'
import { livePersonWithIdentityExists } from '#helpers/person_identity_lookup'
import { personEmailExistsGlobally } from '#helpers/person_email_global_uniqueness'
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
      .unique(async (_db, value) => !(await personEmailExistsGlobally(value, 0)))
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
        // USRH1789698261610: se compara solo dentro de la empresa activa. Sin
        // contexto o sin empresa no hay veredicto (regla 10): el controller ya
        // rechazó con 400 antes de validar, así que aquí se deja pasar.
        if (!TenantContext.isActive()) return true
        const [businessUnitId] = TenantContext.getScope()
        if (!businessUnitId) return true
        const exists = await livePersonWithIdentityExists('curp', blindIndex(value), businessUnitId)
        return !exists
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
        // USRH1789698261610: se compara solo dentro de la empresa activa. Sin
        // contexto o sin empresa no hay veredicto (regla 10): el controller ya
        // rechazó con 400 antes de validar, así que aquí se deja pasar.
        if (!TenantContext.isActive()) return true
        const [businessUnitId] = TenantContext.getScope()
        if (!businessUnitId) return true
        const exists = await livePersonWithIdentityExists('rfc', blindIndex(value), businessUnitId)
        return !exists
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
        // USRH1789698261610: se compara solo dentro de la empresa activa. Sin
        // contexto o sin empresa no hay veredicto (regla 10): el controller ya
        // rechazó con 400 antes de validar, así que aquí se deja pasar.
        if (!TenantContext.isActive()) return true
        const [businessUnitId] = TenantContext.getScope()
        if (!businessUnitId) return true
        const exists = await livePersonWithIdentityExists('nss', blindIndex(value), businessUnitId)
        return !exists
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
