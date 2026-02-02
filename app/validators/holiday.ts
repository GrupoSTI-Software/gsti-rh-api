// validators/holiday.ts
import vine from '@vinejs/vine'

export const createOrUpdateHolidayValidator = vine.compile(
  vine.object({
    holidayName: vine.string().trim().minLength(0),
    holidayDate: vine.string(),
    holidayIcon: vine.any().optional(),
    holidayFrequency: vine.number().min(1).max(100),
    holidayIsOfficialRestDay: vine.boolean().optional(),
  })
)
