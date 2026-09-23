import Aircraft from '#models/aircraft'
import vine from '@vinejs/vine'

export const createAircraftValidator = vine.compile(
  vine.object({
    aircraftRegistrationNumber: vine.string().unique(async (_db: any, value: any) => {
      const existingAircraft = await Aircraft.query()
        .where('aircraft_registration_number', value)
        .first()

      return !existingAircraft
    }),
    aircraftSerialNumber: vine.string(),
    aircraftActive: vine.number().optional(),
    airportId: vine.number().exists(async (_db: any, value: any) => {
      const airportExists = await _db.query().from('airports').where('airport_id', value).first()
      return !!airportExists
    }),
    aircraftOperatorId: vine.number().exists(async (_db: any, value: any) => {
      const operatorExists = await _db
        .query()
        .from('aircraft_operators')
        .where('aircraft_operator_id', value)
        .first()
      return !!operatorExists
    }),
    aircraftPropertiesId: vine.number().exists(async (_db: any, value: any) => {
      const propertiesExists = await _db
        .query()
        .from('aircraft_properties')
        .where('aircraft_properties_id', value)
        .first()
      return !!propertiesExists
    }),
  })
)

export const updateAircraftValidator = vine.compile(
  vine.object({
    aircraftRegistrationNumber: vine.string().optional(),
    aircraftSerialNumber: vine.string().optional(),
    airportId: vine.number().exists(async (_db: any, value: any) => {
      const airportExists = await _db.query().from('airports').where('airport_id', value).first()
      return !!airportExists
    }),
    aircraftOperatorId: vine.number().exists(async (_db: any, value: any) => {
      const operatorExists = await _db
        .query()
        .from('aircraft_operators')
        .where('aircraft_operator_id', value)
        .first()
      return !!operatorExists
    }),
    aircraftPropertiesId: vine.number().exists(async (_db: any, value: any) => {
      const propertiesExists = await _db
        .query()
        .from('aircraft_properties')
        .where('aircraft_properties_id', value)
        .first()
      return !!propertiesExists
    }),
  })
)
