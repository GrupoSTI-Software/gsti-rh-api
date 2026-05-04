import Position from '#models/position'
import vine from '@vinejs/vine'

const optionalPositiveInteger = vine.number().min(1).optional().nullable()

export const createPositionValidator = vine.compile(
  vine.object({
    positionCode: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(50)
      .unique(async (_db, value) => {
        const existingCode = await Position.query()
          .where('position_code', value)
          .whereNull('position_deleted_at')
          .first()
        return !existingCode
      }),
    positionName: vine.string().trim().minLength(1).maxLength(100),
    positionAlias: vine.string().trim().minLength(0).maxLength(250).optional(),
    aliases: vine.string().maxLength(2000).optional().nullable(),
    positionIsDefault: vine.boolean().optional(),
    positionActive: vine.boolean().optional(),
    parentPositionId: vine.number().min(0).optional(),
    positionMinStaff: optionalPositiveInteger,
    positionIdealStaff: optionalPositiveInteger,
    positionMaxStaff: optionalPositiveInteger,
    positionMinActiveStaffPerShift: optionalPositiveInteger,
  })
)

export const updatePositionValidator = vine.compile(
  vine.object({
    positionCode: vine.string().trim().minLength(1).maxLength(50),
    positionName: vine.string().trim().minLength(1).maxLength(100),
    positionAlias: vine.string().trim().minLength(0).maxLength(250).optional(),
    aliases: vine.string().maxLength(2000).optional().nullable(),
    positionIsDefault: vine.boolean().optional(),
    positionActive: vine.boolean().optional(),
    parentPositionId: vine.number().min(0).optional(),
    positionMinStaff: optionalPositiveInteger,
    positionIdealStaff: optionalPositiveInteger,
    positionMaxStaff: optionalPositiveInteger,
    positionMinActiveStaffPerShift: optionalPositiveInteger,
    departmentId: vine.number().positive().optional().nullable(),
  })
)

export const movePositionValidator = vine.compile(
  vine.object({
    parentPositionId: vine.number().positive().nullable(),
    departmentId: vine.number().positive().nullable(),
  })
)
