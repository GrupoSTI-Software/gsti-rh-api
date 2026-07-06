import vine from '@vinejs/vine'
import { noMaskCharRule } from './no_mask_char_rule.js'

export const createEmployeeBankValidator = vine.compile(
  vine.object({
    employeeBankAccountClabe: vine.string().trim().minLength(1).maxLength(250).use(noMaskCharRule()),
    employeeBankAccountNumber: vine.string().trim().minLength(0).maxLength(250).use(noMaskCharRule()).optional(),
    employeeBankAccountCardNumber: vine.string().trim().minLength(0).maxLength(250).use(noMaskCharRule()).optional(),
    employeeBankAccountType: vine.string().trim().minLength(0).maxLength(50).optional(),
    employeeBankAccountCurrencyType: vine.string().trim().minLength(1).maxLength(3),
    employeeId: vine.number(),
    bankId: vine.number(),
  })
)

export const updateEmployeeBankValidator = vine.compile(
  vine.object({
    // optional en update: null = "no modificar" (el BO envía null cuando el campo
    // se mostraba enmascarado y el usuario no ingresó un nuevo valor).
    employeeBankAccountClabe: vine.string().trim().minLength(1).maxLength(250).use(noMaskCharRule()).optional(),
    employeeBankAccountNumber: vine.string().trim().minLength(0).maxLength(250).use(noMaskCharRule()).optional(),
    employeeBankAccountCardNumber: vine.string().trim().minLength(0).maxLength(250).use(noMaskCharRule()).optional(),
    employeeBankAccountType: vine.string().trim().minLength(0).maxLength(50).optional(),
    employeeBankAccountCurrencyType: vine.string().trim().minLength(1).maxLength(3),
  })
)
