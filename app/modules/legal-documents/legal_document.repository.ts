import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type LegalDocument from '#models/legal_document'
import type {
  LegalDocumentType,
  LegalDocumentContent,
  LegalDocumentStatus,
} from '#models/legal_document'

export interface CreatePublishedVersionData {
  type: LegalDocumentType
  version: string
  content: LegalDocumentContent
  publishedByUserId: number | null
}

export interface CreateDraftData {
  type: LegalDocumentType
  version: string
  content: LegalDocumentContent
}

export interface UpdateDraftData {
  version?: string
  content: LegalDocumentContent
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

  /** Busca una versión puntual por id (histórico/detalle/gestión). */
  findById(legalDocumentId: number): Promise<LegalDocument | null>

  /** Igual que `findById`, pero bloqueando la fila (`FOR UPDATE`) dentro de una transacción. */
  findByIdForUpdate(
    legalDocumentId: number,
    trx: TransactionClientContract
  ): Promise<LegalDocument | null>

  /** Histórico de versiones de un tipo, opcionalmente filtrado por estado. Más reciente primero. */
  listByType(type: LegalDocumentType, status?: LegalDocumentStatus): Promise<LegalDocument[]>

  /** Crea una versión en borrador (`status='draft'`, `is_current=false`). */
  createDraft(data: CreateDraftData): Promise<LegalDocument>

  /** Actualiza el contenido/versión de un borrador existente. No valida estado (lo hace el service). */
  updateDraft(legalDocumentId: number, data: UpdateDraftData): Promise<LegalDocument>

  /** Marca un borrador como publicado y vigente dentro de una transacción. */
  markAsPublished(
    legalDocumentId: number,
    publishedByUserId: number | null,
    trx: TransactionClientContract
  ): Promise<LegalDocument>
}
