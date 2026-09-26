import vine from '@vinejs/vine'

export const createRoleValidator = vine.compile(
  vine.object({
    roleName: vine.string().trim().minLength(1).maxLength(100),
    roleDescription: vine.string().trim().minLength(0).maxLength(200).optional(),
    roleActive: vine.boolean().optional(),
    rolePresetSlug: vine.enum(['hr-admin', 'branch-supervisor', 'read-only', 'data-entry']).optional(),
  })
)

export const updateRoleValidator = vine.compile(
  vine.object({
    roleName: vine.string().trim().minLength(1).maxLength(100),
    roleDescription: vine.string().trim().minLength(0).maxLength(200).optional(),
    roleActive: vine.boolean().optional(),
  })
)

export const assignRolesPermissionsBatchValidator = vine.compile(
  vine.object({
    roles: vine
      .array(
        vine.object({
          roleId: vine.number().withoutDecimals().positive(),
          permissions: vine.array(vine.number().withoutDecimals().positive()),
          roleManagementDays: vine.number().withoutDecimals().min(0).nullable(),
        })
      )
      .minLength(1),
  })
)
