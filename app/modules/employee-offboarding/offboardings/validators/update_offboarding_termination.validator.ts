import vine from '@vinejs/vine'
import { offboardingTerminationFields } from './schedule_offboarding.validator.js'

/**
 * Edición de los datos de la baja de un expediente en curso
 * (VLRH-H1792177926178): los mismos campos obligatorios que al programar
 * (fecha, modalidad y tipo) y la nota opcional y anulable: ausente conserva,
 * `null` o vacía borra, texto reemplaza. Día real y catálogo los valida el
 * servicio con `assertValidTermination`.
 */
export const updateOffboardingTerminationValidator = vine.compile(
  vine.object({
    ...offboardingTerminationFields,
    notes: vine.string().trim().maxLength(1000).nullable().optional(),
  })
)
