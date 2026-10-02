import type { HttpContext } from '@adonisjs/core/http'
import type User from '#models/user'
import type { UserEmailTypeValue } from '#constants/user_email_type'
import { USERS_PERMISSION_DECLARATIONS } from '#constants/users_permission_declarations'
import { ensureSecondaryPermission } from '#helpers/permission_gate_secondary'
import { findLiveUserByPersonId } from '#helpers/person_user_email_mirror'

export type CredentialChangeOrigin = 'person-file' | 'user-screen' | 'employee-file'

export interface CredentialChangeGateInput {
  readonly personId?: number
  readonly currentUser?: User
  readonly incomingEmail: unknown
  readonly persistedEmailType: UserEmailTypeValue | null
  readonly origin?: CredentialChangeOrigin
}

/** Devuelve `false` solo si ya respondió 401 o 403. `true` permite proceder. */
export async function ensureCredentialChangeAllowed(
  ctx: HttpContext,
  input: CredentialChangeGateInput
): Promise<boolean> {
  if (!ctx.auth?.user) {
    ctx.response.status(401)
    return false
  }

  const incoming = normalizeEmail(input.incomingEmail)
  if (incoming === null) return true

  const persistedUser =
    input.currentUser ??
    (input.personId === undefined ? null : await findLiveUserByPersonId(input.personId))
  if (!persistedUser) return true

  const origin = input.origin ?? (input.currentUser ? 'user-screen' : undefined)
  const persistedEmailType = input.persistedEmailType ?? persistedUser.userEmailType
  if (origin === 'person-file' && persistedEmailType !== 'personal') return true
  if (origin === 'employee-file' && persistedEmailType !== 'institutional') return true

  // Misma comparación que el `already-in-sync` del espejo (solo trim, sensible a
  // mayúsculas): todo lo que el espejo llegue a escribir debe pasar por permiso.
  if (persistedUser.userEmail === incoming) return true

  return ensureSecondaryPermission(ctx, USERS_PERMISSION_DECLARATIONS.credentialChange)
}

/** Corre antes de `validateUsing`: el cuerpo aún no está tipado y puede no ser texto. */
function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
