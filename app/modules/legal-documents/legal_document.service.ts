import db from '@adonisjs/lucid/services/db'
import LegalDocumentError from '#exceptions/legal_document_error'
import type LegalDocument from '#models/legal_document'
import type { LegalDocumentType, LegalDocumentContent } from '#models/legal_document'
import LegalDocumentRepositoryMysql from './legal_document.repository.mysql.js'
import type { LegalDocumentRepository } from './legal_document.repository.js'
import type { LegalDocumentDto } from './dto/legal_document.dto.js'

export type PublishVersionInput = {
  type: LegalDocumentType
  version: string
  content: LegalDocumentContent
  publishedByUserId?: number | null
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
