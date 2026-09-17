import vine from '@vinejs/vine'

export const createCustomerProceedingFileValidator = vine.compile(
  vine.object({
    customerId: vine.number().min(1),
    proceedingFileId: vine.number().min(1),
  })
)

export const updateCustomerProceedingFileValidator = vine.compile(
  vine.object({
    customerId: vine.number().min(1),
    proceedingFileId: vine.number().min(1),
  })
)
