import ConsentError from '#exceptions/consent_error'
import { CURRENT_CONSENT_VERSION } from '#modules/consent/consent.constants'
import AcceptanceRepositoryMysql from './acceptance.repository.mysql.js'
import type { AcceptanceRepository } from './acceptance.repository.js'
import type { ConsentStatusDto } from './dto/acceptance.dto.js'

/**
 * Servicio de consentimiento legal.
 *
 * Reglas de negocio:
 *  - La versión vigente la define `CURRENT_CONSENT_VERSION` en consent.constants.ts.
 *  - `getStatus` devuelve si el usuario ya aceptó la versión vigente.
 *  - `recordAcceptance` valida que la versión enviada coincida con la vigente antes
 *    de insertar; si ya existe el registro, lo devuelve sin modificarlo (idempotente).
 *  - El registro es inmutable: no hay update ni delete (evidencia LFPDPPP).
 *
 * Aislamiento: el userId siempre viene de auth.user.userId; nunca del body (anti-IDOR).
 */
export default class AcceptanceService {
  private readonly repository: AcceptanceRepository

  constructor(repository: AcceptanceRepository = new AcceptanceRepositoryMysql()) {
    this.repository = repository
  }

  /** GET /api/consent/me — estado de aceptación del usuario autenticado. */
  async getStatus(userId: number): Promise<ConsentStatusDto> {
    const record = await this.repository.findByUserAndVersion(userId, CURRENT_CONSENT_VERSION)
    return this.buildDto(record)
  }

  /**
   * POST /api/consent/me — registra la aceptación.
   *
   * Valida que `documentVersion` coincida con la versión vigente.
   * Si ya existe el registro (doble envío), lo devuelve sin crear un duplicado.
   */
  async recordAcceptance(userId: number, documentVersion: string): Promise<ConsentStatusDto> {
    if (documentVersion !== CURRENT_CONSENT_VERSION) {
      throw new ConsentError(
        'version-de-consentimiento-invalida',
        `La versión "${documentVersion}" no coincide con la versión vigente "${CURRENT_CONSENT_VERSION}".`
      )
    }

    const record = await this.repository.recordAcceptance(userId, documentVersion, new Date())
    return this.buildDto(record)
  }

  private buildDto(record: Awaited<ReturnType<AcceptanceRepository['findByUserAndVersion']>>): ConsentStatusDto {
    if (!record) {
      return {
        accepted: false,
        currentVersion: CURRENT_CONSENT_VERSION,
        acceptedVersion: null,
        acceptedAt: null,
      }
    }
    return {
      accepted: record.userConsentDocumentVersion === CURRENT_CONSENT_VERSION,
      currentVersion: CURRENT_CONSENT_VERSION,
      acceptedVersion: record.userConsentDocumentVersion,
      acceptedAt: record.userConsentAcceptedAt.toISO(),
    }
  }
}
