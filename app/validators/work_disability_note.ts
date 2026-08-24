import vine from '@vinejs/vine'
import { noMaskCharRule } from './no_mask_char_rule.js'

export const createWorkDisabilityNoteValidator = vine.compile(
  vine.object({
    workDisabilityNoteDescription: vine.string().trim().minLength(1).use(noMaskCharRule()),
    workDisabilityId: vine.number().min(1),
  })
)
export const updateWorkDisabilityNoteValidator = vine.compile(
  vine.object({
    workDisabilityNoteDescription: vine.string().trim().minLength(1).use(noMaskCharRule()).optional(),
  })
)
