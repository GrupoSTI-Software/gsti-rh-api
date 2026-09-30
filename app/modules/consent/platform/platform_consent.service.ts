import type { DateTime } from 'luxon'
import type { PlatformDocumentAcceptanceStatus } from '#modules/consent/platform/platform_consent.constants'

/**
 * Resuelve el estado de aceptación de un documento a partir de hechos agregados
 * (§4 reglas 2 y 4: orden idéntico al predicado SQL del listado).
 */
export function resolveDocumentStatus(
  hasCurrent: boolean,
  lastAcceptedAt: DateTime | null,
  acceptedCurrent: boolean
): PlatformDocumentAcceptanceStatus {
  if (!hasCurrent) {
    return 'sin-version-publicada'
  }
  if (acceptedCurrent) {
    return 'al-dia'
  }
  if (lastAcceptedAt !== null) {
    return 'pendiente'
  }
  return 'nunca'
}
