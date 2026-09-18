import vine from '@vinejs/vine'
export const createAircraftProceedingFileValidator = vine.compile(
  vine.object({
    aircraftId: vine.number().min(1),
    proceedingFileId: vine.number().min(1),
  })
)
export const updateAircraftProceedingFileValidator = vine.compile(
  vine.object({
    aircraftId: vine.number().min(1),
    proceedingFileId: vine.number().min(1),
  })
)
