import vine from '@vinejs/vine'

export const createZoneValidator = vine.compile(
  vine.object({
    zoneName: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(200),
    zoneThumbnail: vine.string().trim().maxLength(255).optional(),
    zoneAddress: vine.string().trim().minLength(1),
    zonePolygon: vine.string().trim().minLength(1),
  })
)

export const updateZoneValidator = vine.compile(
  vine.object({
    zoneName: vine.string().trim().minLength(1).maxLength(200),
    zoneThumbnail: vine.string().trim().maxLength(255).optional(),
    zoneAddress: vine.string().trim().minLength(1),
    zonePolygon: vine.string().trim().minLength(1),
  })
)


