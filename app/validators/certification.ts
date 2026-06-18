import vine from '@vinejs/vine'

/** Rechaza comillas simples/dobles, punto y coma y comentarios SQL típicos. */
export const CERTIFICATION_SQL_META_PATTERN = /('|"|;)|(\-\-)|(\/\*)|(\*\/)/

export const certificationListValidator = vine.compile(
  vine.object({
    page: vine.number().positive().optional(),
    limit: vine.number().positive().max(500).optional(),
  })
)

export const certificationNameField = vine.string().trim().minLength(3).maxLength(200)

export const createCertificationValidator = vine.compile(
  vine.object({
    name: certificationNameField,
    categoryId: vine.number().positive(),
    isExternal: vine.boolean(),
    externalUrl: vine.string().trim().maxLength(2048).optional().nullable(),
    renewalPeriodDays: vine.number().positive().optional().nullable(),
    businessUnitIds: vine.array(vine.number().positive()).optional(),
  })
)

export const updateCertificationValidator = vine.compile(
  vine.object({
    name: certificationNameField,
    categoryId: vine.number().positive(),
    isExternal: vine.boolean(),
    externalUrl: vine.string().trim().maxLength(2048).optional().nullable(),
    renewalPeriodDays: vine.number().positive().optional().nullable(),
    businessUnitIds: vine.array(vine.number().positive()).optional(),
  })
)
