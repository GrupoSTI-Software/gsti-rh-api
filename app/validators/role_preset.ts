import vine from '@vinejs/vine'

export const rolePresetPreviewValidator = vine.compile(
  vine.object({
    presetSlug: vine.enum(['hr-admin', 'branch-supervisor', 'read-only', 'data-entry']),
    mode: vine.enum(['merge', 'replace']),
  })
)

export const rolePresetApplyValidator = vine.compile(
  vine.object({
    presetSlug: vine.enum(['hr-admin', 'branch-supervisor', 'read-only', 'data-entry']),
    mode: vine.enum(['merge', 'replace']),
    expectedPresetVersion: vine.string().trim().minLength(1).maxLength(20),
    baselinePermissionIds: vine.array(vine.number().withoutDecimals().positive()),
  })
)
