import type { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type RepseExpedienteDocumento from '#models/repse_expediente_documento'
import type {
  RepseExpedienteAccion,
  RepseExpedienteDocumentoTipo,
} from './expediente.constants.js'

export interface RepseExpedienteDocumentoCreateData {
  proveedorRepseId: number
  businessUnitId: number
  tipo: RepseExpedienteDocumentoTipo
  anio: number
  mes: number | null
  cuatrimestre: number | null
  fechaDocumento: DateTime | null
  conservarHasta: DateTime
  nombreArchivo: string
  storageKey: string
  mimeType: string
  tamanoBytes: number
  subidoPorUserId: number
}

export interface RepseExpedienteListFilters {
  proveedorRepseId: number
  tipo?: RepseExpedienteDocumentoTipo
  anio?: number
  mes?: number
  cuatrimestre?: number
  page: number
  limit: number
}

export interface RepseExpedientePaginatedResult {
  rows: RepseExpedienteDocumento[]
  total: number
  page: number
  limit: number
  lastPage: number
}

export interface RepseExpedienteAccesoCreateData {
  repseExpedienteDocumentoId: number
  businessUnitId: number
  accion: RepseExpedienteAccion
  userId: number
}

export interface ExpedienteRepository {
  create(
    data: RepseExpedienteDocumentoCreateData,
    trx?: TransactionClientContract
  ): Promise<RepseExpedienteDocumento>

  listByProveedor(filters: RepseExpedienteListFilters): Promise<RepseExpedientePaginatedResult>

  findByIdForProveedor(
    proveedorRepseId: number,
    repseExpedienteDocumentoId: number
  ): Promise<RepseExpedienteDocumento | null>

  softDelete(
    documento: RepseExpedienteDocumento,
    trx?: TransactionClientContract
  ): Promise<void>

  logAccess(
    data: RepseExpedienteAccesoCreateData,
    trx?: TransactionClientContract
  ): Promise<void>
}
