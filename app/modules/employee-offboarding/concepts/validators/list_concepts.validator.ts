import vine from '@vinejs/vine'

/**
 * Parámetros de consulta del listado (USRH1786568279584, regla 9): `active`
 * opcional — la configuración lee el catálogo completo y las salidas nuevas
 * toman solo los activos. Un valor no booleano responde 400 `datos-invalidos`.
 */
export const listOffboardingConceptsValidator = vine.compile(
  vine.object({
    active: vine.boolean().optional(),
  })
)
