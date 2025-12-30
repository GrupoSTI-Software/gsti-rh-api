import vine from '@vinejs/vine'

export const uploadPhotoValidator = vine.compile(
  vine.object({
    employeeSupplyId: vine.number().positive(),
  })
)
