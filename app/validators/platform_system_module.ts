import vine from '@vinejs/vine'

/** Body para `PUT /api/platform/system-modules/:systemModuleId/active`. */
export const updateSystemModuleActiveValidator = vine.compile(
  vine.object({
    active: vine.boolean(),
  })
)

/** Body para `PUT /api/platform/system-modules/:systemModuleId/permission-enforcement`. */
export const updateSystemModulePermissionEnforcementValidator = vine.compile(
  vine.object({
    active: vine.boolean(),
  })
)
