import vine from '@vinejs/vine'

export const addPositionCertificationRequirementsValidator = vine.compile(
  vine.object({
    certificationIds: vine.array(vine.number().withoutDecimals().positive()).minLength(1),
  })
)
