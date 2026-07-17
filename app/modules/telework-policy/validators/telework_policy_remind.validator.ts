import vine from '@vinejs/vine'

/**
 * "Recordar a pendientes" (regla de negocio 4): sin `employeeIds` es masivo
 * (todos los pendientes de la vigente); con `employeeIds` es selectivo — el
 * service intersecta con los pendientes reales, ids ajenos se ignoran en
 * silencio (anti-abuso, no se valida pertenencia aquí).
 */
export const teleworkPolicyRemindValidator = vine.compile(
  vine.object({
    employeeIds: vine
      .array(vine.number().withoutDecimals().positive())
      .minLength(1)
      .optional(),
  })
)

export type TeleworkPolicyRemindInput = Awaited<
  ReturnType<typeof teleworkPolicyRemindValidator.validate>
>
