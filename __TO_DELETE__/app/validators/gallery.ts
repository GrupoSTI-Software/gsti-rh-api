import vine from '@vinejs/vine'

export const createGalleryValidator = vine.compile(
  vine.object({
    galeryPath: vine.string().optional(),
    galeryCategory: vine.string().optional(),
    galeryIdTable: vine.number(),
    galeryNameTable: vine.string().optional(),
  })
)

export const updateGalleryValidator = vine.compile(
  vine.object({
    galeryPath: vine.string().optional(),
    galeryCategory: vine.string().optional(),
    galeryIdTable: vine.number().optional(),
    galeryNameTable: vine.string().optional(),
  })
)
