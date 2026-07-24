import RepseExpedienteAcceso from '#models/repse_expediente_acceso'
import RepseExpedienteDocumento from '#models/repse_expediente_documento'
import type {
  ExpedienteRepository,
  RepseExpedienteAccesoCreateData,
  RepseExpedienteDocumentoCreateData,
  RepseExpedienteListFilters,
  RepseExpedientePaginatedResult,
} from './expediente.repository.js'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export default class ExpedienteRepositoryMysql implements ExpedienteRepository {
  async create(
    data: RepseExpedienteDocumentoCreateData,
    trx?: TransactionClientContract
  ): Promise<RepseExpedienteDocumento> {
    const row = new RepseExpedienteDocumento()
    row.proveedorRepseId = data.proveedorRepseId
    row.businessUnitId = data.businessUnitId
    row.tipo = data.tipo
    row.anio = data.anio
    row.mes = data.mes
    row.cuatrimestre = data.cuatrimestre
    row.fechaDocumento = data.fechaDocumento
    row.conservarHasta = data.conservarHasta
    row.nombreArchivo = data.nombreArchivo
    row.storageKey = data.storageKey
    row.mimeType = data.mimeType
    row.tamanoBytes = data.tamanoBytes
    row.subidoPorUserId = data.subidoPorUserId
    if (trx) {
      row.useTransaction(trx)
    }
    await row.save()
    return row
  }

  async listByProveedor(filters: RepseExpedienteListFilters): Promise<RepseExpedientePaginatedResult> {
    const query = RepseExpedienteDocumento.query()
      .where('proveedor_repse_id', filters.proveedorRepseId)
      .whereNull('repse_expediente_documento_deleted_at')

    if (filters.tipo) {
      query.where('repse_expediente_documento_tipo', filters.tipo)
    }
    if (filters.anio) {
      query.where('repse_expediente_documento_anio', filters.anio)
    }
    if (filters.mes) {
      query.where('repse_expediente_documento_mes', filters.mes)
    }
    if (filters.cuatrimestre) {
      query.where('repse_expediente_documento_cuatrimestre', filters.cuatrimestre)
    }

    const paginated = await query
      .orderBy('repse_expediente_documento_anio', 'desc')
      .orderBy('repse_expediente_documento_mes', 'desc')
      .orderBy('repse_expediente_documento_cuatrimestre', 'desc')
      .orderBy('repse_expediente_documento_id', 'desc')
      .paginate(filters.page, filters.limit)

    const serialized = paginated.serialize()

    return {
      rows: paginated.all(),
      total: serialized.meta.total,
      page: serialized.meta.currentPage,
      limit: serialized.meta.perPage,
      lastPage: serialized.meta.lastPage,
    }
  }

  async findByIdForProveedor(
    proveedorRepseId: number,
    repseExpedienteDocumentoId: number
  ): Promise<RepseExpedienteDocumento | null> {
    return RepseExpedienteDocumento.query()
      .where('repse_expediente_documento_id', repseExpedienteDocumentoId)
      .where('proveedor_repse_id', proveedorRepseId)
      .whereNull('repse_expediente_documento_deleted_at')
      .first()
  }

  async softDelete(
    documento: RepseExpedienteDocumento,
    trx?: TransactionClientContract
  ): Promise<void> {
    if (trx) {
      documento.useTransaction(trx)
    }
    await documento.delete()
  }

  async logAccess(
    data: RepseExpedienteAccesoCreateData,
    trx?: TransactionClientContract
  ): Promise<void> {
    const row = new RepseExpedienteAcceso()
    row.repseExpedienteDocumentoId = data.repseExpedienteDocumentoId
    row.businessUnitId = data.businessUnitId
    row.accion = data.accion
    row.userId = data.userId
    if (trx) {
      row.useTransaction(trx)
    }
    await row.save()
  }
}
