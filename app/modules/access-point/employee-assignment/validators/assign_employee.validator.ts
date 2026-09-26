import vine from '@vinejs/vine'

/**
 * Valida los parámetros de ruta de la asignación.
 *
 * Ambos identificadores llegan por la ruta, así que solo se comprueba que sean
 * enteros positivos antes de tocar la base de datos.
 */
export const assignEmployeeToAccessPointValidator = vine.compile(
  vine.object({
    params: vine.object({
      accessPointId: vine.number().positive(),
      employeeId: vine.number().positive(),
    }),
  })
)
