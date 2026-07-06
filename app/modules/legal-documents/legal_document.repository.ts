import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type LegalDocument from '#models/legal_document'
import type { LegalDocumentType, LegalDocumentContent } from '#models/legal_document'

export interface CreatePublishedVersionData {
  type: LegalDocumentType
  version: string
  content: LegalDocumentContent
  publishedByUserId: number | null
}

export interface LegalDocumentRepository {
  /** Busca la versión vigente (`legal_document_is_current = true`) de un tipo. */
  findCurrentByType(type: LegalDocumentType): Promise<LegalDocument | null>

  /** Igual que `findCurrentByType`, pero bloqueando la fila (`FOR UPDATE`) dentro de una transacción. */
  findCurrentByTypeForUpdate(
    type: LegalDocumentType,
    trx: TransactionClientContract
  ): Promise<LegalDocument | null>

  /** Apaga `legal_document_is_current` de una fila puntual dentro de una transacción. */
  clearCurrentFlag(legalDocumentId: number, trx: TransactionClientContract): Promise<void>

  /** Crea una nueva versión ya publicada y vigente dentro de una transacción. */
  createPublishedVersion(
    data: CreatePublishedVersionData,
    trx: TransactionClientContract
  ): Promise<LegalDocument>
}
