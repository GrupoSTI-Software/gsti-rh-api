import vine from '@vinejs/vine'

/**
 * Validación de los campos no-archivo del multipart. El archivo (`archivo`)
 * se valida aparte en el service (`ValidationsService.assertFileValid`)
 * porque Vine no maneja bien reglas de tamaño/mime combinadas con el resto
 * del payload multipart en este proyecto (mismo criterio que
 * `documento_contrato.validator.ts`, donde el archivo no pasa por Vine).
 */
export const createProveedorRepseValidacionValidator = vine.compile(
  vine.object({
    estatus: vine.enum(['vigente', 'no_vigente'] as const),
    // Nota: Vine 2.1 usa dayjs internamente; el token 'ISO8601' no es un
    // formato de dayjs válido (dayjs solo entiende tokens tipo 'YYYY-MM-DD'),
    // así que declararlo en `formats` no habilita timestamps completos: solo
    // 'YYYY-MM-DD' funciona en la práctica. Se deja únicamente ese formato
    // para no sugerir un soporte que no existe.
    fecha: vine.date({ formats: ['YYYY-MM-DD'] }),
  })
)
