import Pilot from '#models/pilot'
import vine from '@vinejs/vine'

export const createPilotValidator = vine.compile(
  vine.object({
    employeeId: vine
      .number()
      .min(1)
      .unique(async (_db, value) => {
        const existingEmployeeId = await Pilot.query()
          .where('employee_id', value)
          .whereNull('pilot_deleted_at')
          .first()
        return !existingEmployeeId
      }),
  })
)
export const updatePilotValidator = vine.compile(
  vine.object({
    pilotHireDate: vine.date({
      formats: ['YYYY-MM-DD', 'x'],
    }),
  })
)
