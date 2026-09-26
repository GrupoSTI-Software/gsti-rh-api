import vine from '@vinejs/vine'
import { noMaskCharRule } from './no_mask_char_rule.js'

export const createEmployeeSpouseValidator = vine.compile(
  vine.object({
    employeeSpouseFirstname: vine.string().trim().minLength(1).maxLength(150),
    employeeSpouseLastname: vine.string().trim().minLength(0).maxLength(150),
    employeeSpouseSecondLastname: vine.string().trim().minLength(0).maxLength(150),
    employeeSpouseOcupation: vine.string().trim().minLength(0).maxLength(150).optional(),
    employeeSpousePhone: vine.string().trim().minLength(0).maxLength(45).use(noMaskCharRule()).optional(),
    employeeId: vine.number(),
  })
)

export const updateEmployeeSpouseValidator = vine.compile(
  vine.object({
    employeeSpouseFirstname: vine.string().trim().minLength(1).maxLength(150),
    employeeSpouseLastname: vine.string().trim().minLength(0).maxLength(150),
    employeeSpouseSecondLastname: vine.string().trim().minLength(0).maxLength(150),
    employeeSpouseOcupation: vine.string().trim().minLength(0).maxLength(150).optional(),
    employeeSpousePhone: vine.string().trim().minLength(0).maxLength(45).use(noMaskCharRule()).optional(),
  })
)
