// app/Validators/AircraftOperator.ts (o donde los manejes)
import vine from '@vinejs/vine'
import AircraftOperator from '#models/aircraft_operator'

/**
 * Validator para crear un nuevo AircraftOperator
 */
export const createAircraftOperatorValidator = vine.compile(
  vine.object({
    aircraftOperatorName: vine
      .string() // Asegúrate de que sea string
      .trim()
      .minLength(1) // Requerimos al menos 1 caracter
      .unique(async (_db, value) => {
        // Chequeo de unicidad a nivel BD (opcional)
        const existingOperator = await AircraftOperator.query()
          .where('aircraft_operator_name', value)
          .whereNull('aircraft_operator_deleted_at')
          .first()
        // Retorna TRUE si NO existe => validación pasa
        // Retorna FALSE si sí existe => marca error
        return !existingOperator
      }),
    aircraftOperatorFiscalName: vine.string().optional(), // Campo opcional
    aircraftOperatorImage: vine.string().optional(),
    aircraftOperatorSlug: vine.string().optional(),
    aircraftOperatorActive: vine.boolean().optional(),
  })
)

/**
 * Validator para actualizar un AircraftOperator
 */
export const updateAircraftOperatorValidator = vine.compile(
  vine.object({
    // Si quieres forzar algún campo, puedes marcarlo como requerido
    aircraftOperatorName: vine.string().optional(),
    aircraftOperatorFiscalName: vine.string().optional(),
    aircraftOperatorImage: vine.string().optional(),
    aircraftOperatorSlug: vine.string().optional(),
    aircraftOperatorActive: vine.boolean().optional(),
  })
)
