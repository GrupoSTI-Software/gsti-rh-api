import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import LegalDocument from '#models/legal_document'
import type { LegalDocumentType } from '#models/legal_document'
import type {
  CreatePublishedVersionData,
  LegalDocumentRepository,
} from './legal_document.repository.js'

export default class LegalDocumentRepositoryMysql implements LegalDocumentRepository {
  async findCurrentByType(type: LegalDocumentType): Promise<LegalDocument | null> {
    return LegalDocument.query()
      .where('legal_document_type', type)
      .where('legal_document_is_current', true)
      .first()
  }

  async findCurrentByTypeForUpdate(
    type: LegalDocumentType,
    trx: TransactionClientContract
  ): Promise<LegalDocument | null> {
    return LegalDocument.query({ client: trx })
      .where('legal_document_type', type)
      .where('legal_document_is_current', true)
      .forUpdate()
      .first()
  }

  async clearCurrentFlag(legalDocumentId: number, trx: TransactionClientContract): Promise<void> {
    const record = await LegalDocument.query({ client: trx })
      .where('legal_document_id', legalDocumentId)
      .firstOrFail()

    record.legalDocumentIsCurrent = false
    record.useTransaction(trx)
    await record.save()
  }

  async createPublishedVersion(
    data: CreatePublishedVersionData,
    trx: TransactionClientContract
  ): Promise<LegalDocument> {
    const record = new LegalDocument()
    record.legalDocumentType = data.type
    record.legalDocumentVersion = data.version
    record.legalDocumentContent = data.content
    record.legalDocumentIsCurrent = true
    record.legalDocumentStatus = 'published'
    record.legalDocumentPublishedAt = DateTime.now()
    record.legalDocumentPublishedByUserId = data.publishedByUserId
    record.useTransaction(trx)
    await record.save()

    return record
  }
}
