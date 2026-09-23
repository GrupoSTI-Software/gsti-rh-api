import AircraftClass from '#models/aircraft_class'
import vine from '@vinejs/vine'

// Validador para crear una clase de aeronave
export const createAircraftClassValidator = vine.compile(
  vine.object({
    aircraftClassName: vine.string().unique(async (_db: any, value: any) => {
      const existingClass = await AircraftClass.query()
        .where('aircraft_class_name', value)
        .whereNull('aircraftClassDeletedAt')
        .first()

      if (existingClass) {
        return false
      }
      return true
    }),
    aircraftClassBanner: vine.any().optional(),
    aircraftClassLongDescription: vine.string().optional(),
    aircraftClassShortDescription: vine.string().optional(),
    aircraftClassSlug: vine.string().optional(),
    aircraftClassStatus: vine.enum([0, 1]).optional(),
  })
)

// Validador para actualizar una clase de aeronave
export const updateAircraftClassValidator = vine.compile(
  vine.object({
    aircraftClassName: vine.string().optional(),
    aircraftClassBanner: vine.any().optional(),
    aircraftClassLongDescription: vine.string().optional(),
    aircraftClassShortDescription: vine.string().optional(),
    aircraftClassSlug: vine.string().optional(),
    aircraftClassStatus: vine.enum([0, 1]).optional(),
  })
)
