import vine from '@vinejs/vine'

export const createDepartmentValidator = vine.compile(
  vine.object({
    departmentName: vine.string().trim().minLength(1).maxLength(100),
    departmentAlias: vine.string().trim().minLength(0).maxLength(250).optional(),
    /** Lista separada por comas; ver preparación en servicio. */
    aliases: vine.string().maxLength(2000).optional().nullable(),
    departmentIsDefault: vine.boolean().optional(),
    departmentActive: vine.boolean().optional(),
    parentDepartmentId: vine.number().min(0).optional(),
  })
)

export const updateDepartmentValidator = vine.compile(
  vine.object({
    departmentCode: vine.string().trim().minLength(1).maxLength(50),
    departmentName: vine.string().trim().minLength(1).maxLength(100),
    departmentAlias: vine.string().trim().minLength(0).maxLength(250).optional(),
    aliases: vine.string().maxLength(2000).optional().nullable(),
    departmentIsDefault: vine.boolean().optional(),
    departmentActive: vine.boolean().optional(),
    parentDepartmentId: vine.number().min(0).optional(),
  })
)
