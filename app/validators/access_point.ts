import vine from '@vinejs/vine'

export const createAccessPointValidator = vine.compile(
  vine.object({
    accessPointName: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(200),
    businessUnitId: vine.number().positive(),
    accessPointActive: vine.number().in([0, 1]).optional(),
    accessPointSerialNumber: vine.string().trim().maxLength(100).optional(),
    accessPointDeviceName: vine.string().trim().maxLength(200).optional(),
    accessPointIp: vine.string().trim().maxLength(45).optional(),
    accessPointMac: vine.string().trim().maxLength(50).optional(),
    accessPointFirmware: vine.string().trim().maxLength(100).optional(),
    accessPointPlatform: vine.string().trim().maxLength(100).optional(),
    accessPointStatus: vine.number().in([0, 1]).optional(),
    accessPointLastConnection: vine.date().optional(),
  })
)

export const updateAccessPointValidator = vine.compile(
  vine.object({
    accessPointName: vine.string().trim().minLength(1).maxLength(200),
    businessUnitId: vine.number().positive(),
    accessPointActive: vine.number().in([0, 1]).optional(),
    accessPointSerialNumber: vine.string().trim().maxLength(100).optional(),
    accessPointDeviceName: vine.string().trim().maxLength(200).optional(),
    accessPointIp: vine.string().trim().maxLength(45).optional(),
    accessPointMac: vine.string().trim().maxLength(50).optional(),
    accessPointFirmware: vine.string().trim().maxLength(100).optional(),
    accessPointPlatform: vine.string().trim().maxLength(100).optional(),
    accessPointStatus: vine.number().in([0, 1]).optional(),
    // accessPointLastConnection: vine.date().optional(),
  })
)
