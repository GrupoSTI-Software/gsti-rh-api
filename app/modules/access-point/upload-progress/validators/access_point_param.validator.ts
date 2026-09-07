import vine from '@vinejs/vine'

/** `:accessPointId` entero positivo antes de tocar la base. */
export const accessPointParamValidator = vine.compile(
  vine.object({
    params: vine.object({
      accessPointId: vine.number().positive(),
    }),
  })
)
