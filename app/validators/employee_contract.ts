import vine from '@vinejs/vine'

export const createEmployeeContractValidator = vine.compile(
  vine.object({
    employeeContractFolio: vine.string().trim().minLength(0).maxLength(100),
    employeeContractStatus: vine.string().trim().minLength(0),
    employeeContractMonthlyNetSalary: vine.number().min(1),
    employeeContractTypeId: vine.number().min(1),
    employeeId: vine.number().min(1),
    departmentId: vine.number().min(1).nullable().optional(),
    positionId: vine.number().min(1).nullable().optional(),
    payrollBusinessUnitId: vine.number().min(1),
  })
)

export const updateEmployeeContractValidator = vine.compile(
  vine.object({
    employeeContractFolio: vine.string().trim().minLength(0).maxLength(100),
    employeeContractStatus: vine.string().trim().minLength(0),
    employeeContractMonthlyNetSalary: vine.number().min(1),
    employeeContractTypeId: vine.number().min(1),
    employeeId: vine.number().min(1),
    departmentId: vine.number().min(1).nullable().optional(),
    positionId: vine.number().min(1).nullable().optional(),
    payrollBusinessUnitId: vine.number().min(1),
  })
)
