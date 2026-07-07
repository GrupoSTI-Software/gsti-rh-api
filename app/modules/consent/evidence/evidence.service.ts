import RoleService from '#services/role_service'
import { maskSensitiveValue } from '#helpers/sensitive_mask'
import type UserConsent from '#models/user_consent'
import EvidenceRepositoryMysql from './evidence.repository.mysql.js'
import type {
  EvidenceFilters,
  EvidencePagination,
  EvidenceRepository,
} from './evidence.repository.js'
import type { EvidencePageDto, EvidenceRowDto } from './dto/evidence.dto.js'

/** Slug del `system_module` sembrado para esta historia (acceso y revelado). */
const CONSENT_EVIDENCE_MODULE_SLUG = 'consent-evidence'

/**
 * Servicio de consulta/export de evidencia de aceptaciones (USRH1783368377327).
 *
 * Reglas de negocio:
 *  - Refleja la evidencia tal como el cimiento (USRH1783101935670) la registró; nunca la
 *    altera ni la recalcula (regla 6). Solo lectura: no expone ningún método de escritura.
 *  - `userConsentIp`/`userConsentUserAgent` se enmascaran por default
 *    (`maskSensitiveValue`, categoría `contacto`, ver `sensitive_fields.ts`); solo se
 *    devuelven en claro si `revealAllowed` es `true` (regla 4).
 *  - `revealAllowed` lo decide el caller (controller) con
 *    `RoleService.hasExplicitAccess(roleId, 'consent-evidence', 'reveal')` — un check
 *    SIN el atajo de `root` de `hasAccess`, para que el revelado sea un permiso real y
 *    revocable incluso para root (a diferencia de la reserva de acceso al módulo, que sí
 *    usa el atajo estándar).
 */
export default class EvidenceService {
  private readonly repository: EvidenceRepository
  private readonly roleService: RoleService

  constructor(
    repository: EvidenceRepository = new EvidenceRepositoryMysql(),
    roleService: RoleService = new RoleService()
  ) {
    this.repository = repository
    this.roleService = roleService
  }

  /** `true` si `roleId` tiene el permiso dedicado de revelado (check explícito, no root-bypass). */
  async canReveal(roleId: number): Promise<boolean> {
    return this.roleService.hasExplicitAccess(roleId, CONSENT_EVIDENCE_MODULE_SLUG, 'reveal')
  }

  /** `GET /api/consent/evidence` — página de evidencia según `filters`. */
  async getEvidence(
    filters: EvidenceFilters,
    pagination: EvidencePagination,
    revealAllowed: boolean
  ): Promise<EvidencePageDto> {
    const { rows, meta } = await this.repository.findEvidence(filters, pagination)
    return {
      data: rows.map((row) => this.toDto(row, revealAllowed)),
      meta,
    }
  }

  /** `GET /api/consent/evidence/export` — filas sin paginar, para armar el `.xlsx`. */
  async getExportRows(filters: EvidenceFilters, revealAllowed: boolean): Promise<EvidenceRowDto[]> {
    const rows = await this.repository.findAllForExport(filters)
    return rows.map((row) => this.toDto(row, revealAllowed))
  }

  /**
   * Convierte la fila Lucid en DTO. Asume `user`, `user.person`, `user.businessUnits`
   * y `legalDocument` ya precargados por el repositorio — acceder a una relación no
   * precargada lanza en tiempo de ejecución (guard de Lucid), así que un fallo aquí
   * indica un `preload` faltante, no un dato ausente legítimo.
   */
  private toDto(row: UserConsent, revealAllowed: boolean): EvidenceRowDto {
    const businessUnits = row.user.businessUnits ?? []

    return {
      userId: row.userId,
      userName: this.buildUserName(row),
      businessUnitIds: businessUnits.map((bu) => bu.businessUnitId),
      businessUnitNames: businessUnits.map((bu) => bu.businessUnitName),
      legalDocumentId: row.legalDocumentId,
      documentType: row.legalDocument.legalDocumentType,
      version: row.legalDocument.legalDocumentVersion ?? row.userConsentDocumentVersion,
      acceptedAt: row.userConsentAcceptedAt ? row.userConsentAcceptedAt.toISO() : null,
      ip: this.reveal(row.userConsentIp, revealAllowed),
      userAgent: this.reveal(row.userConsentUserAgent, revealAllowed),
    }
  }

  private buildUserName(row: UserConsent): string {
    const person = row.user.person
    if (!person) return ''
    return [person.personFirstname, person.personLastname, person.personSecondLastname]
      .filter(Boolean)
      .join(' ')
  }

  /** Enmascara salvo que el caller tenga el permiso de revelado (regla 4 — sin fuga). */
  private reveal(value: string | null, revealAllowed: boolean): string | null {
    if (revealAllowed) return value
    return maskSensitiveValue(value, 'contacto')
  }
}
