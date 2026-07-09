import ConsentError from '#exceptions/consent_error'
import { CONSENT_ERROR_CODES } from '#constants/consent_error_codes'
import { AUDIENCE_REQUIRED_TYPES } from '#modules/consent/consent.constants'
import type { ConsentAudience } from '#modules/consent/consent.constants'
import type LegalDocument from '#models/legal_document'
import type { LegalDocumentType } from '#models/legal_document'
import type UserConsent from '#models/user_consent'
import LegalDocumentRepositoryMysql from '#modules/legal-documents/legal_document.repository.mysql'
import type { LegalDocumentRepository } from '#modules/legal-documents/legal_document.repository'
import AcceptanceRepositoryMysql from './acceptance.repository.mysql.js'
import type { AcceptanceRepository } from './acceptance.repository.js'
import type { ConsentStatusDto, PendingDocumentDto } from './dto/acceptance.dto.js'

/** Documentos que registra el POST retrocompatible (sin `type`): el "paquete web". */
const WEB_PACKAGE_TYPES: readonly LegalDocumentType[] = ['privacy_notice', 'terms_conditions']

export interface RecordAcceptanceInput {
  documentVersion: string
  type?: LegalDocumentType
  ip: string | null
  userAgent: string | null
}

/**
 * Servicio de consentimiento legal, granular por documento (USRH1783101935670).
 *
 * Reglas de negocio:
 *  - `getStatus` calcula `pendingDocuments[]` = (docs vigentes exigidos por la audiencia)
 *    menos (docs ya aceptados). `accepted` se preserva = `pendingDocuments.length === 0`.
 *  - Un tipo sin versión vigente (p.ej. biométrico recién declarado) nunca aparece como
 *    pendiente: no se puede exigir lo inexistente.
 *  - `recordAcceptance` valida la versión enviada contra la VIGENTE DERIVADA DEL DATO
 *    (`legal_documents.is_current`), no de una constante fija. Sin `type`, registra el
 *    paquete web (aviso + términos) en una operación atómica; con `type`, solo ese
 *    documento. El cliente nunca envía `legal_document_id` directo.
 *  - El registro es inmutable: no hay update ni delete (evidencia LFPDPPP). Doble envío
 *    de la misma aceptación es idempotente (no duplica, no re-fecha).
 *
 * Aislamiento: el userId siempre viene de auth.user.userId; nunca del body (anti-IDOR).
 * La audiencia siempre viene del token de sesión (ver `resolve_audience.ts`); nunca de
 * un parámetro que el cliente controle.
 */
export default class AcceptanceService {
  private readonly repository: AcceptanceRepository
  private readonly legalDocumentRepository: LegalDocumentRepository

  constructor(
    repository: AcceptanceRepository = new AcceptanceRepositoryMysql(),
    legalDocumentRepository: LegalDocumentRepository = new LegalDocumentRepositoryMysql()
  ) {
    this.repository = repository
    this.legalDocumentRepository = legalDocumentRepository
  }

  /** GET /api/consent/me — documentos pendientes/aceptados del usuario, por audiencia. */
  async getStatus(userId: number, audience: ConsentAudience): Promise<ConsentStatusDto> {
    const currentDocs = await this.findCurrentDocuments(AUDIENCE_REQUIRED_TYPES[audience])
    const acceptances = await this.repository.findAcceptancesByUser(userId)

    return this.buildDto(currentDocs, acceptances)
  }

  /**
   * POST /api/consent/me — registra la aceptación.
   *
   * `audience` es la de la sesión (misma fuente que `getStatus`): determina con qué
   * conjunto de documentos se recalcula la respuesta, no cuáles se pueden aceptar
   * (aceptar un documento puntual por `type` es válido desde cualquier canal).
   */
  async recordAcceptance(
    userId: number,
    audience: ConsentAudience,
    input: RecordAcceptanceInput
  ): Promise<ConsentStatusDto> {
    const typesToAccept = input.type ? [input.type] : WEB_PACKAGE_TYPES
    const docsToAccept = await this.findCurrentDocuments(typesToAccept)

    if (docsToAccept.length !== typesToAccept.length) {
      // Un tipo exigido no tiene versión vigente publicada — no se puede aceptar lo
      // inexistente (regla 6). Se reporta como tipo inválido, sin filtrar detalle interno.
      throw new ConsentError(
        'tipo-de-documento-invalido',
        'El documento solicitado no tiene una versión vigente publicada.',
        CONSENT_ERROR_CODES.INVALID_TYPE
      )
    }

    const mismatched = docsToAccept.find((doc) => doc.legalDocumentVersion !== input.documentVersion)
    if (mismatched) {
      throw new ConsentError(
        'version-de-consentimiento-invalida',
        `La versión "${input.documentVersion}" no coincide con la versión vigente ` +
          `"${mismatched.legalDocumentVersion}" de "${mismatched.legalDocumentType}".`,
        CONSENT_ERROR_CODES.INVALID_VERSION
      )
    }

    await this.repository.recordAcceptances(
      userId,
      docsToAccept.map((doc) => ({
        legalDocumentId: doc.legalDocumentId,
        documentVersion: doc.legalDocumentVersion,
      })),
      { ip: input.ip, userAgent: input.userAgent },
      new Date()
    )

    return this.getStatus(userId, audience)
  }

  private async findCurrentDocuments(
    types: readonly LegalDocumentType[]
  ): Promise<LegalDocument[]> {
    const docs = await Promise.all(
      types.map((type) => this.legalDocumentRepository.findCurrentByType(type))
    )
    return docs.filter((doc): doc is LegalDocument => doc !== null)
  }

  /**
   * `currentVersion`/`acceptedVersion` (DEPRECATED conservados) siempre anclan al
   * `privacy_notice`: ambas audiencias lo exigen, así que siempre está en `currentDocs`.
   */
  private buildDto(currentDocs: LegalDocument[], acceptances: UserConsent[]): ConsentStatusDto {
    const acceptedDocumentIds = new Set(acceptances.map((acceptance) => acceptance.legalDocumentId))

    const pendingDocuments: PendingDocumentDto[] = currentDocs
      .filter((doc) => !acceptedDocumentIds.has(doc.legalDocumentId))
      .map((doc) => ({
        legalDocumentId: doc.legalDocumentId,
        type: doc.legalDocumentType,
        version: doc.legalDocumentVersion,
      }))

    const privacyDoc = currentDocs.find((doc) => doc.legalDocumentType === 'privacy_notice') ?? null
    const acceptedPrivacy = privacyDoc
      ? acceptances.find((acceptance) => acceptance.legalDocumentId === privacyDoc.legalDocumentId)
      : undefined

    const mostRecent = acceptances.reduce<UserConsent | null>((latest, current) => {
      if (!latest) return current
      return current.userConsentAcceptedAt > latest.userConsentAcceptedAt ? current : latest
    }, null)

    return {
      accepted: pendingDocuments.length === 0,
      pendingDocuments,
      currentVersion: privacyDoc?.legalDocumentVersion ?? null,
      acceptedVersion: acceptedPrivacy?.userConsentDocumentVersion ?? null,
      acceptedAt: mostRecent ? mostRecent.userConsentAcceptedAt.toISO() : null,
    }
  }
}
