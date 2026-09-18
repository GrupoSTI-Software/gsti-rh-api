import Airport from '#models/airport'
import vine from '@vinejs/vine'

// Validador para crear un aeropuerto
export const createAirportValidator = vine.compile(
  vine.object({
    airportName: vine.string().unique(async (_db: any, value: any) => {
      const existingAirport = await Airport.query()
        .where('airport_name', value)
        .whereNull('airport_deleted_at')
        .first()

      if (existingAirport) {
        return false
      }
      return true
    }),
    airportIcaoCode: vine.string().optional(),
    airportLatitudeDeg: vine.any().optional(),
    airportLongitudeDeg: vine.any().optional(),
    airportElevationFt: vine.any().optional(),
    airportDisplayLocationName: vine.any().optional(),
    airportIsoRegion: vine.any().optional(),
    airportIsoCountry: vine.any().optional(),
    airportActive: vine.any().optional(),
    airportIataCode: vine.any().optional(),
  })
)

// Validador para actualizar un aeropuerto
export const updateAirportValidator = vine.compile(
  vine.object({
    airportName: vine.string().optional(),
    airportIcaoCode: vine.string().optional(),
    airportLatitudeDeg: vine.any().optional(),
    airportLongitudeDeg: vine.any().optional(),
    airportElevationFt: vine.any().optional(),
    airportDisplayLocationName: vine.any().optional(),
    airportIsoRegion: vine.any().optional(),
    airportIsoCountry: vine.any().optional(),
    airportActive: vine.any().optional(),
    airportIataCode: vine.any().optional(),
  })
)
