import type { DateTime } from 'luxon'
import type UserConsent from '#models/user_consent'

/** Datos para el INSERT único e inmutable del asiento físico (write-once). */
export interface InsertPhysicalConsentInput {
  employeeId: number
  /** Doble ancla (regla 8): presente solo si `employee.person.user` existe. */
  userId: number | null
  legalDocumentId: number
  documentVersion: string
  registeredByUserId: number
  signedAt: DateTime
  acceptedAt: DateTime
  evidenceFile: string
  evidenceOriginalName: string
  ip: string | null
  userAgent: string | null
}

/**
 * Puerto de acceso a datos del slice `consent/physical` (USRH1784146205513).
 *
 * Propio del sub-módulo: NO extiende `AcceptanceRepository` (escritura del canal
 * digital, cimiento USRH1783101935670) — el registro físico tiene su propia forma de
 * entrada (empleado, no usuario) aunque ambos escriban en la misma tabla `user_consents`.
 */
export interface PhysicalConsentRepository {
  /**
   * Busca un asiento existente del documento para el empleado, por CUALQUIERA de las
   * dos anclas (`employeeId` siempre; `userId` además si no es null) — regla 9 (sin
   * duplicados por ningún canal).
   */
  findForEmployeeAndDocument(
    employeeId: number,
    userId: number | null,
    legalDocumentId: number
  ): Promise<UserConsent | null>

  /** INSERT único e inmutable del asiento físico. */
  insertPhysicalConsent(input: InsertPhysicalConsentInput): Promise<UserConsent>

  /** Asiento físico puntual, validando que ancle al `employeeId` indicado. */
  findPhysicalConsentForEmployee(
    userConsentId: number,
    employeeId: number
  ): Promise<UserConsent | null>

  /**
   * Asiento físico por id, sin acotar por empleado — usado por la vista GLOBAL de
   * evidencia (`GET /api/consent/evidence/:userConsentId/download-url`), que no
   * conoce de antemano el `employeeId`; el gate de esa ruta es por rol (plataforma),
   * no por tenant (S8.2). Precarga `employee` para resolver `businessUnitId` de la
   * bitácora PII sin una segunda consulta.
   */
  findPhysicalConsentById(userConsentId: number): Promise<UserConsent | null>
}
