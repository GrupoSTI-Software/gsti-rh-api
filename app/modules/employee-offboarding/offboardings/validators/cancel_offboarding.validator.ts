import vine from '@vinejs/vine'

/**
 * Cancelación de la baja programada (VLRH-H1792172886315, regla 3): la nota de
 * motivo es obligatoria, se recorta y debe quedar entre 1 y 1000 caracteres,
 * el mismo tope que las demás notas del expediente. Única llave declarada:
 * estado, usuario, fecha y empresa los fija el servidor (CA8).
 */
export const cancelOffboardingValidator = vine.compile(
  vine.object({
    cancellationNote: vine.string().trim().minLength(1).maxLength(1000),
  })
)
