import vine from '@vinejs/vine'

/**
 * Programación de la baja (USRH1786568279587, regla 2): colaborador, fecha
 * tentativa obligatoria en `YYYY-MM-DD` y nota opcional. La fecha es solo
 * referencia — no agenda nada ni cambia el estatus del colaborador.
 */
export const scheduleOffboardingValidator = vine.compile(
  vine.object({
    employeeId: vine.number().positive(),
    plannedDate: vine
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: vine.string().trim().maxLength(1000).optional(),
  })
)
