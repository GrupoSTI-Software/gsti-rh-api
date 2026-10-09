import type { DateTime } from 'luxon'

/** Checada con ubicación simulada reclamada para el correo. */
export interface AssistLocationFlagPendingRow {
  assistId: number
  employeeId: number
  punchTimeUtc: DateTime
}

/**
 * Puerto de las checadas con ubicación simulada pendientes de avisar a RH
 * (VLRH-H1791056340278).
 *
 * "Pendiente" = marca `simulated`, sin `notified_at`, activa, no borrada y
 * llegada al sistema desde `since`. El reclamo marca `notified_at` antes de
 * enviar para que dos corridas simultáneas nunca tomen la misma checada; si el
 * envío falla, se libera.
 */
export interface AssistLocationFlagDigestRepository {
  /** Empresas con al menos una checada pendiente, en orden de id. */
  findBusinessUnitsWithPending(since: DateTime): Promise<number[]>

  /**
   * Marca como avisadas con `claimedAt` hasta `limit` pendientes de la empresa
   * y las devuelve. Si otra corrida tomó alguna en medio, no reclama ninguna y
   * devuelve vacío.
   */
  claimPending(
    businessUnitId: number,
    since: DateTime,
    limit: number,
    claimedAt: DateTime
  ): Promise<AssistLocationFlagPendingRow[]>

  /** Vuelve a pendientes las checadas que ESTA corrida reclamó con `claimedAt`. */
  releaseClaim(
    businessUnitId: number,
    assistIds: readonly number[],
    claimedAt: DateTime
  ): Promise<void>
}
