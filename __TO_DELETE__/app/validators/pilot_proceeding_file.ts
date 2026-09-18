import vine from '@vinejs/vine'

export const createPilotProceedingFileValidator = vine.compile(
  vine.object({
    pilotId: vine.number().min(1),
    proceedingFileId: vine.number().min(1),
  })
)

export const updatePilotProceedingFileValidator = vine.compile(
  vine.object({
    pilotId: vine.number().min(1),
    proceedingFileId: vine.number().min(1),
  })
)
