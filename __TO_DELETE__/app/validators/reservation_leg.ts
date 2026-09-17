import vine from '@vinejs/vine'

export const createReservationLegValidator = vine.compile(
  vine.object({
    reservationId: vine.number().min(1),
    // reservationLegDepartureDate: vine.date({
    //   formats: ['YYYY-MM-DD', 'x'],
    // }),
    // reservationLegDepartureTime: vine.date({
    //   formats: ['HH:mm:ss', 'x'],
    // }),
    // reservationLegArriveDate: vine.date({
    //   formats: ['YYYY-MM-DD', 'x'],
    // }),
    // reservationLegArriveTime: vine.date({
    //   formats: ['HH:mm:ss', 'x'],
    // }),
    reservationLegPax: vine.number().min(1),
    reservationLegTravelTime: vine.number().min(1),
    reservationLegDistanceMn: vine.number().min(1),
    airportDestinationId: vine.number().min(1),
    airportDepartureId: vine.number().min(1),
  })
)
