import FlightAttendant from '#models/flight_attendant'
import vine from '@vinejs/vine'

export const createFlightAttendantValidator = vine.compile(
  vine.object({
    employeeId: vine
      .number()
      .min(1)
      .unique(async (_db, value) => {
        const existingPersonId = await FlightAttendant.query()
          .where('employee_id', value)
          .whereNull('flight_attendant_deleted_at')
          .first()
        return !existingPersonId
      }),
    flightAttendantHireDate: vine.date({
      formats: ['YYYY-MM-DD', 'x'],
    }),
  })
)
export const updateFlightAttendantValidator = vine.compile(
  vine.object({
    flightAttendantHireDate: vine.date({
      formats: ['YYYY-MM-DD', 'x'],
    }),
  })
)
