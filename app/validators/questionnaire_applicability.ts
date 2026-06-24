import vine from '@vinejs/vine'

export const questionnaireApplicabilityFilterValidator = vine.compile(
  vine.object({
    businessUnitId: vine.number().positive().optional(),
    companyId: vine.number().positive().optional(),
  })
)
