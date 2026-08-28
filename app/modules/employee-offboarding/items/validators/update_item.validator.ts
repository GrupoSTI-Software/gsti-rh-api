import vine from '@vinejs/vine'

/**
 * Body de actualizar y de completar un pendiente (USRH1786568279590):
 * importe y nota, ambos opcionales — ausente = no tocar, `null` = limpiar.
 * Un importe negativo o no numérico es error de FORMA (400 `datos-invalidos`,
 * D-7); que el concepto lo admita es regla de negocio y la valida el
 * servicio (422 `importe-no-aplicable`). Máximo acorde al `decimal(12,2)`.
 */
export const updateOffboardingItemValidator = vine.compile(
  vine.object({
    employeeOffboardingItemAmount: vine
      .number()
      .min(0)
      .max(9999999999.99)
      .nullable()
      .optional(),
    employeeOffboardingItemNote: vine.string().trim().maxLength(1000).nullable().optional(),
  })
)
