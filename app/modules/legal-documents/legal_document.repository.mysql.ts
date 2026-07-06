import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import LegalDocument from '#models/legal_document'
import type { LegalDocumentType, LegalDocumentStatus } from '#models/legal_document'
import type {
  CreateDraftData,
  CreatePublishedVersionData,
  LegalDocumentRepository,
  UpdateDraftData,
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

  async findById(legalDocumentId: number): Promise<LegalDocument | null> {
    return LegalDocument.query().where('legal_document_id', legalDocumentId).first()
  }

  async findByIdForUpdate(
    legalDocumentId: number,
    trx: TransactionClientContract
  ): Promise<LegalDocument | null> {
    return LegalDocument.query({ client: trx })
      .where('legal_document_id', legalDocumentId)
      .forUpdate()
      .first()
  }

  async listByType(
    type: LegalDocumentType,
    status?: LegalDocumentStatus
  ): Promise<LegalDocument[]> {
    const query = LegalDocument.query().where('legal_document_type', type)
    if (status) {
      query.where('legal_document_status', status)
    }
    return query.orderBy('legal_document_created_at', 'desc')
  }

  async createDraft(data: CreateDraftData): Promise<LegalDocument> {
    const record = new LegalDocument()
    record.legalDocumentType = data.type
    record.legalDocumentVersion = data.version
    record.legalDocumentContent = data.content
    record.legalDocumentIsCurrent = false
    record.legalDocumentStatus = 'draft'
    record.legalDocumentPublishedAt = null
    record.legalDocumentPublishedByUserId = null
    await record.save()

    return record
  }

  async updateDraft(legalDocumentId: number, data: UpdateDraftData): Promise<LegalDocument> {
    const record = await LegalDocument.query()
      .where('legal_document_id', legalDocumentId)
      .firstOrFail()

    if (data.version !== undefined) {
      record.legalDocumentVersion = data.version
    }
    record.legalDocumentContent = data.content
    await record.save()

    return record
  }

  async markAsPublished(
    legalDocumentId: number,
    publishedByUserId: number | null,
    trx: TransactionClientContract
  ): Promise<LegalDocument> {
    const record = await LegalDocument.query({ client: trx })
      .where('legal_document_id', legalDocumentId)
      .firstOrFail()

    record.legalDocumentStatus = 'published'
    record.legalDocumentIsCurrent = true
    record.legalDocumentPublishedAt = DateTime.now()
    record.legalDocumentPublishedByUserId = publishedByUserId
    record.useTransaction(trx)
    await record.save()

    return record
  }
}
