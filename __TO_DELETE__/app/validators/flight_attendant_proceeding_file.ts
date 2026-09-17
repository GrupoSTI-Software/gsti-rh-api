import vine from '@vinejs/vine'

export const createFlightAttendantProceedingFileValidator = vine.compile(
  vine.object({
    flightAttendantId: vine.number().min(1),
    proceedingFileId: vine.number().min(1),
  })
)

export const updateFlightAttendantProceedingFileValidator = vine.compile(
  vine.object({
    flightAttendantId: vine.number().min(1),
    proceedingFileId: vine.number().min(1),
  })
)
