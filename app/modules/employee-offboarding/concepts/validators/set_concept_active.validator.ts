import vine from '@vinejs/vine'

/**
 * Encendido/apagado de un concepto (USRH1786568279584, reglas 1 y 2). La
 * operación toca una sola columna; cualquier otro campo del body se ignora.
 */
export const setOffboardingConceptActiveValidator = vine.compile(
  vine.object({
    offboardingConceptActive: vine.boolean(),
  })
)
