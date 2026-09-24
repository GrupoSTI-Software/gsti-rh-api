/** De donde salio el correo con el que se alcanza a alguien. */
export type RecipientEmailKind = 'business' | 'personal' | 'account'

/** Correos capturados de una persona, en el orden en que se prefieren. */
export interface RecipientEmailCandidates {
  /** `employee_business_email` del expediente. */
  business?: string | null
  /** `person_email` de la persona. */
  personal?: string | null
  /** `user_email` de la cuenta con la que entra al sistema. */
  account?: string | null
}

/** Correo elegido y de donde salio. */
export interface PickedRecipientEmail {
  email: string
  emailKind: RecipientEmailKind
}

/**
 * Elige con que correo se alcanza a una persona.
 *
 * Primero el institucional, porque es el que la empresa controla y el que
 * corresponde a un asunto de trabajo. Si el expediente no lo tiene, el personal.
 * Y si tampoco, el de la cuenta con la que entra al sistema, que es el ultimo
 * lugar donde queda un correo suyo: perder un aviso porque nadie capturo el
 * institucional dejaria la solicitud sin dueno.
 *
 * @param candidatos - Correos capturados de la persona.
 * @returns El correo elegido, o `null` si no hay ninguno utilizable.
 */
export function pickRecipientEmail(
  candidatos: RecipientEmailCandidates
): PickedRecipientEmail | null {
  const orden: Array<[RecipientEmailKind, string | null | undefined]> = [
    ['business', candidatos.business],
    ['personal', candidatos.personal],
    ['account', candidatos.account],
  ]

  for (const [emailKind, valor] of orden) {
    const correo = `${valor ?? ''}`.trim()

    if (correo.length > 0) {
      return { email: correo, emailKind }
    }
  }

  return null
}
