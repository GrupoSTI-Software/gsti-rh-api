import vine from '@vinejs/vine'

export const assistSourceParamsValidator = vine.compile(
  vine.object({
    params: vine.object({ assistId: vine.number().withoutDecimals().min(1) }),
  })
)
