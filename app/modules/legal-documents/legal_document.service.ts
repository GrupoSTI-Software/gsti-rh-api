import db from '@adonisjs/lucid/services/db'
import LegalDocumentError from '#exceptions/legal_document_error'
import { sanitizeLegalDocumentContent } from '#helpers/sanitize_legal_document_content'
import type LegalDocument from '#models/legal_document'
import type { LegalDocumentType, LegalDocumentContent, LegalDocumentStatus } from '#models/legal_document'
import LegalDocumentRepositoryMysql from './legal_document.repository.mysql.js'
import type { LegalDocumentRepository } from './legal_document.repository.js'
import type {
  LegalDocumentAdminDto,
  LegalDocumentDto,
  LegalDocumentPublishedByDto,
} from './dto/legal_document.dto.js'

export type PublishVersionInput = {
  type: LegalDocumentType
  version: string
  content: LegalDocumentContent
  publishedByUserId?: number | null
}

export type CreateDraftInput = {
  type: LegalDocumentType
  version: string
  content: Partial<LegalDocumentContent>
}

export type UpdateDraftInput = {
  version?: string
  content: Partial<LegalDocumentContent>
}

export default class LegalDocumentService {
  private readonly repository: LegalDocumentRepository

  constructor(repository: LegalDocumentRepository = new LegalDocumentRepositoryMysql()) {
    this.repository = repository
  }

  /**
   * Documento vigente de un tipo. Lanza `LegalDocumentError` cuando el tipo
   * aún no tiene ninguna versión publicada (caso `biometric_consent` recién
   * declarado, sin seed) — el controller lo traduce a 404 contractual.
   */
  async getCurrent(type: LegalDocumentType, locale: string = 'es'): Promise<LegalDocumentDto> {
    const current = await this.repository.findCurrentByType(type)
    if (!current) {
      throw new LegalDocumentError('documento-legal-sin-version-vigente')
    }
    return this.buildDto(current, locale)
  }

  /**
   * Publica una nueva versión vigente de un tipo de documento legal.
   *
   * Invariante "una sola vigente por tipo" (regla de negocio 3): dentro de la
   * misma transacción se apaga la versión vigente anterior (si existe) y se
   * enciende la nueva como `published` + `is_current = true`. No depende de un
   * índice único parcial (MySQL no lo soporta).
   *
   * Esta hermana A no expone esta operación por HTTP: la usa el seed para
   * dejar aviso y términos en su "1.0", y queda lista para que la consuma la
   * gestión (ESB-08-09-03-01).
   */
  async publishVersion(input: PublishVersionInput): Promise<LegalDocument> {
    return db.transaction(async (trx) => {
      const vigenteActual = await this.repository.findCurrentByTypeForUpdate(input.type, trx)
      if (vigenteActual) {
        await this.repository.clearCurrentFlag(vigenteActual.legalDocumentId, trx)
      }

      return this.repository.createPublishedVersion(
        {
          type: input.type,
          version: input.version,
          content: input.content,
          publishedByUserId: input.publishedByUserId ?? null,
        },
        trx
      )
    })
  }

  /** Histórico de versiones de un tipo (gestión, reservada a `root`). Más reciente primero. */
  async listByType(
    type: LegalDocumentType,
    status?: LegalDocumentStatus
  ): Promise<LegalDocumentAdminDto[]> {
    const records = await this.repository.listByType(type, status)
    return records.map((record) => this.buildAdminDto(record))
  }

  /** Detalle administrativo de una versión puntual. 404 si no existe. */
  async getById(legalDocumentId: number): Promise<LegalDocumentAdminDto> {
    const record = await this.repository.findById(legalDocumentId)
    if (!record) {
      throw new LegalDocumentError('documento-legal-inexistente')
    }
    return this.buildAdminDto(record)
  }

  /**
   * Crea una versión en borrador (regla de negocio 8: puede guardarse con un
   * idioma incompleto). Sanea cada idioma de forma independiente antes de
   * persistir. Choca `unique(type, version)` → `version-duplicada` (409).
   */
  async createDraft(input: CreateDraftInput): Promise<LegalDocumentAdminDto> {
    await this.assertVersionIsFree(input.type, input.version)

    const record = await this.repository.createDraft({
      type: input.type,
      version: input.version,
      content: sanitizeLegalDocumentContent(input.content),
    })
    return this.buildAdminDto(record)
  }

  /**
   * Edita el contenido/versión de un borrador existente.
   *
   * Regla de negocio 3: el contenido de una versión publicada es inmutable
   * — corregir significa publicar una versión nueva, no editar la anterior.
   */
  async updateDraft(
    legalDocumentId: number,
    input: UpdateDraftInput
  ): Promise<LegalDocumentAdminDto> {
    const existing = await this.repository.findById(legalDocumentId)
    if (!existing) {
      throw new LegalDocumentError('documento-legal-inexistente')
    }
    if (existing.legalDocumentStatus !== 'draft') {
      throw new LegalDocumentError('version-publicada-inmutable')
    }
    if (input.version !== undefined && input.version !== existing.legalDocumentVersion) {
      await this.assertVersionIsFree(existing.legalDocumentType, input.version)
    }

    const mergedContent = {
      ...(existing.legalDocumentContent ?? {}),
      ...input.content,
    }

    const record = await this.repository.updateDraft(legalDocumentId, {
      version: input.version,
      content: sanitizeLegalDocumentContent(mergedContent),
    })
    return this.buildAdminDto(record)
  }

  /**
   * Publica un borrador existente por id (distinto de `publishVersion`, que
   * crea-y-publica desde input crudo). Reusa `clearCurrentFlag` del cimiento.
   *
   * Invariante "una sola vigente por tipo" (regla 4): dentro de la misma
   * transacción se apaga la vigente anterior (si existe) y se enciende el
   * borrador como `published` + `is_current = true`. Para un tipo sin ninguna
   * versión previa (el biométrico al inicio), publica su primera versión
   * (regla 2) sin apagar nada.
   */
  async publishDraft(
    legalDocumentId: number,
    publishedByUserId: number | null
  ): Promise<LegalDocumentAdminDto> {
    const record = await db.transaction(async (trx) => {
      const draft = await this.repository.findByIdForUpdate(legalDocumentId, trx)
      if (!draft) {
        throw new LegalDocumentError('documento-legal-inexistente')
      }
      if (draft.legalDocumentStatus !== 'draft') {
        throw new LegalDocumentError('version-publicada-inmutable')
      }

      const content = sanitizeLegalDocumentContent(draft.legalDocumentContent)
      if (!content.es || !content.en) {
        throw new LegalDocumentError('contenido-idioma-incompleto')
      }

      const vigenteActual = await this.repository.findCurrentByTypeForUpdate(
        draft.legalDocumentType,
        trx
      )
      if (vigenteActual) {
        await this.repository.clearCurrentFlag(vigenteActual.legalDocumentId, trx)
      }

      return this.repository.markAsPublished(legalDocumentId, publishedByUserId, trx)
    })

    return this.buildAdminDto(record)
  }

  /** `unique(type, version)`: verificación proactiva antes de escribir (409 legible, sin depender del error crudo del driver). */
  private async assertVersionIsFree(type: LegalDocumentType, version: string): Promise<void> {
    const existingVersions = await this.repository.listByType(type)
    const collides = existingVersions.some((v) => v.legalDocumentVersion === version)
    if (collides) {
      throw new LegalDocumentError('version-duplicada')
    }
  }

  private buildAdminDto(record: LegalDocument): LegalDocumentAdminDto {
    return {
      id: record.legalDocumentId,
      type: record.legalDocumentType,
      version: record.legalDocumentVersion,
      content: record.legalDocumentContent || { es: '', en: '' },
      status: record.legalDocumentStatus,
      isCurrent: record.legalDocumentIsCurrent,
      publishedAt: record.legalDocumentPublishedAt ? record.legalDocumentPublishedAt.toISO() : null,
      publishedBy: this.buildPublishedByDto(record),
    }
  }

  /**
   * Resuelve quién publicó a un nombre visible en UI (regla de negocio 6,
   * trazabilidad). Requiere que el repositorio haya precargado
   * `publishedByUser.person`; si no está precargada o el usuario fue
   * eliminado, cae de forma segura a `null` en vez de lanzar.
   */
  private buildPublishedByDto(record: LegalDocument): LegalDocumentPublishedByDto | null {
    const user = record.publishedByUser
    if (!user) {
      return null
    }

    const person = user.person
    const fullName = person
      ? [person.personFirstname, person.personLastname, person.personSecondLastname]
          .filter(Boolean)
          .join(' ')
          .trim()
      : ''

    return {
      userId: user.userId,
      name: fullName || user.userEmail,
      email: user.userEmail,
    }
  }

  private buildDto(record: LegalDocument, locale: string): LegalDocumentDto {
    const contentMap = record.legalDocumentContent || {}
    // Fallback al español si no existe el locale solicitado, o al primer idioma disponible
    const content = contentMap[locale] || contentMap['es'] || Object.values(contentMap)[0] || ''

    return {
      type: record.legalDocumentType,
      version: record.legalDocumentVersion,
      content,
      publishedAt: record.legalDocumentPublishedAt ? record.legalDocumentPublishedAt.toISO() : null,
    }
  }
}
