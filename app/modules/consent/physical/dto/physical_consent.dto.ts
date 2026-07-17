import type { LegalDocumentType } from '#models/legal_document'
import type { UserConsentChannel } from '#models/user_consent'

/** Quién asentó el consentimiento físico (responsabilidad con nombre y apellido). */
export interface RegisteredByDto {
  userId: number
  name: string
}

/** Respuesta de `POST /api/employees/:employeeId/consents/physical`. */
export interface PhysicalConsentRecordDto {
  userConsentId: number
  employeeId: number
  userId: number | null
  channel: 'physical'
  legalDocumentId: number
  documentType: LegalDocumentType
  version: string
  signedAt: string | null
  acceptedAt: string | null
  registeredBy: RegisteredByDto
  evidence: {
    originalName: string | null
  }
}

/** Respuesta de `GET /api/employees/:employeeId/consents/status`. `null` si no hay asiento. */
export interface PhysicalConsentStatusDto {
  userConsentId: number
  version: string
  channel: UserConsentChannel
  signedAt: string | null
  acceptedAt: string | null
  registeredByName: string | null
  hasAttachment: boolean
}

/** Respuesta de los endpoints `evidence-download-url` (ficha y evidencia global). */
export interface PhysicalConsentDownloadUrlDto {
  downloadUrl: string
  expiresInSeconds: number
}
