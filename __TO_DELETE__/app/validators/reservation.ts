import vine from '@vinejs/vine'

export const createReservationValidator = vine.compile(
  vine.object({
    customerId: vine.number().min(1), // Ejemplo simple
    aircraftId: vine.number().min(1),
    pilotSicId: vine.number().min(1),
    pilotPicId: vine.number().min(1),
    flightAttendantId: vine.number().min(1),
    reservationSubtotal: vine.number().min(0),
    reservationTaxFactor: vine.number().min(0),
    reservationTax: vine.number().min(0),
  })
)
