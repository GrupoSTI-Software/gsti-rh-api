import vine from '@vinejs/vine'
import { noMaskCharRule } from '#validators/no_mask_char_rule'
import { WORK_DISABILITY_MAX_DAYS } from './work_disability_rules.js'

/**
 * Primer día, días amparados y folio: lo común al registro y a la ampliación.
 * El documento (`document`) no pasa por vine: el controlador lo valida para
 * responder con el código estable de archivo, como el resto del módulo.
 */
const periodFields = {
  folio: vine
    .string()
    .trim()
    .toUpperCase()
    .maxLength(100)
    .optional(),
  startDate: vine.date({ formats: ['YYYY-MM-DD'] }),
  days: vine.number().withoutDecimals().min(1).max(WORK_DISABILITY_MAX_DAYS),
}

export const employeeWorkDisabilityParamsValidator = vine.compile(
  vine.object({
    params: vine.object({ employeeId: vine.number().min(1) }),
  })
)

export const registerWorkDisabilityValidator = vine.compile(
  vine.object({
    params: vine.object({ employeeId: vine.number().min(1) }),
    insuranceCoverageTypeId: vine.number().min(1),
    ...periodFields,
    note: vine.string().trim().minLength(1).maxLength(2000).use(noMaskCharRule()).optional(),
  })
)

export const registerWorkDisabilityExtensionValidator = vine.compile(
  vine.object({
    params: vine.object({
      employeeId: vine.number().min(1),
      workDisabilityId: vine.number().min(1),
    }),
    workDisabilityTypeId: vine.number().min(1),
    ...periodFields,
  })
)
