import AircraftProperty from '#models/aircraft_property'
import AircraftClass from '#models/aircraft_class'
import vine from '@vinejs/vine'

// Validador para crear una propiedad de aeronave
export const createAircraftPropertyValidator = vine.compile(
  vine.object({
    aircraftPropertiesName: vine.string().unique(async (_db: any, value: any) => {
      const existingProperty = await AircraftProperty.query()
        .where('aircraft_properties_name', value)
        .first()

      if (existingProperty) {
        return false
      }
      return true
    }),
    aircraftClassId: vine.number().exists(async (_db: any, value: any) => {
      const existingClass = await AircraftClass.query().where('aircraft_class_id', value).first()

      if (!existingClass) {
        return false
      }
      return true
    }),
    aircraftPropertiesPax: vine.number().min(0),
    aircraftPropertiesSpeed: vine.number().min(0),
    aircraftPropertiesMaxKg: vine.number().min(0),
    aircraftPropertiesAutonomy: vine.number().min(0),
    aircraftPropertiesAutonomyHours: vine.number().min(0),
    aircraftPropertiesLandingCostNational: vine.number().min(0),
    aircraftPropertiesOvernightStayInternational: vine.number().min(0),
    aircraftPropertiesBanner: vine.any().optional(),
    aircraftPropertiesHourlyRate: vine.number().optional(),
    aircraftPropertiesLandingCostBase: vine.number().optional(),
    aircraftPropertiesLandingCostInternational: vine.number().optional(),
    aircraftPropertiesOvernightStayLocal: vine.number().optional(),
    aircraftPropertiesFuelSurcharge: vine.number().optional(),
    aircraftPropertiesDescription: vine.string().optional(),
  })
)

export const updateAircraftPropertyValidator = vine.compile(
  vine.object({
    aircraftPropertiesName: vine.string().optional(),
    aircraftClassId: vine.number().exists(async (_db: any, value: any) => {
      const existingClass = await AircraftClass.query().where('aircraft_class_id', value).first()

      if (!existingClass) {
        return false
      }
      return true
    }),
    aircraftPropertiesPax: vine.number().optional(),
    aircraftPropertiesSpeed: vine.number().optional(),
    aircraftPropertiesMaxKg: vine.number().optional(),
    aircraftPropertiesAutonomy: vine.number().optional(),
    aircraftPropertiesAutonomyHours: vine.number().optional(),
    aircraftPropertiesLandingCostNational: vine.number().optional(),
    aircraftPropertiesOvernightStayInternational: vine.number().optional(),
    aircraftPropertyBanner: vine.any().optional(),
    aircraftPropertiesBanner: vine.any().optional(),
    aircraftPropertiesHourlyRate: vine.number().optional(),
    aircraftPropertiesLandingCostBase: vine.number().optional(),
    aircraftPropertiesLandingCostInternational: vine.number().optional(),
    aircraftPropertiesOvernightStayLocal: vine.number().optional(),
    aircraftPropertiesFuelSurcharge: vine.number().optional(),
    aircraftPropertiesDescription: vine.string().optional(),
  })
)
