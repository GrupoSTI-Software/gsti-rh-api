import vine from '@vinejs/vine'

export const createReservationNoteValidator = vine.compile(
  vine.object({
    reservationId: vine.number().min(1),
    reservationNoteContent: vine.string().trim().minLength(1),
  })
)
