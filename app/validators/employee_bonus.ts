import vine from '@vinejs/vine'

export const createEmployeeBonusValidator = vine.compile(
  vine.object({
    employeeId: vine.number().positive(),
    employeeBonusConcept: vine.string().trim().minLength(1).maxLength(255),
    employeeBonusQuantity: vine.number().positive(),
    employeeBonusUnitAmount: vine.number().min(0.01),
    employeeBonusTotal: vine.number().min(0.01),
    employeeBonusAssignmentDate: vine.string().trim().minLength(1),
    employeeBonusPaymentDate: vine.string().trim().minLength(1),
  })
)

export const updateEmployeeBonusValidator = vine.compile(
  vine.object({
    employeeBonusConcept: vine.string().trim().minLength(1).maxLength(255),
    employeeBonusQuantity: vine.number().positive(),
    employeeBonusUnitAmount: vine.number().min(0.01),
    employeeBonusTotal: vine.number().min(0.01),
    employeeBonusAssignmentDate: vine.string().trim().minLength(1),
    employeeBonusPaymentDate: vine.string().trim().minLength(1),
  })
)
