import vine from '@vinejs/vine'

/** Elección única de arranque (regla de negocio 3): plantilla base o de cero. */
export const TELEWORK_POLICY_INITIALIZE_MODES = ['template', 'blank'] as const

export const teleworkPolicyInitializeValidator = vine.compile(
  vine.object({
    mode: vine.enum(TELEWORK_POLICY_INITIALIZE_MODES),
  })
)

export type TeleworkPolicyInitializeInput = Awaited<
  ReturnType<typeof teleworkPolicyInitializeValidator.validate>
>
