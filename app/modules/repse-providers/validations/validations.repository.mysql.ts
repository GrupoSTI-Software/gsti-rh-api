import ProveedorRepseValidacion from '#models/proveedor_repse_validacion'
import type {
  ProveedorRepseValidacionCreateData,
  ValidationsRepository,
} from './validations.repository.js'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export default class ValidationsRepositoryMysql implements ValidationsRepository {
  async create(
    data: ProveedorRepseValidacionCreateData,
    trx?: TransactionClientContract
  ): Promise<ProveedorRepseValidacion> {
    const row = new ProveedorRepseValidacion()
    row.proveedorRepseId = data.proveedorRepseId
    row.businessUnitId = data.businessUnitId
    row.estatus = data.estatus
    row.fecha = data.fecha
    row.autorUserId = data.autorUserId
    row.evidenciaNombreArchivo = data.evidenciaNombreArchivo
    row.evidenciaStorageKey = data.evidenciaStorageKey
    row.evidenciaMimeType = data.evidenciaMimeType
    row.evidenciaTamanoBytes = data.evidenciaTamanoBytes
    if (trx) {
      row.useTransaction(trx)
    }
    await row.save()
    await row.load('autor', (q) => q.preload('person'))
    return row
  }

  async listByProveedor(proveedorRepseId: number): Promise<ProveedorRepseValidacion[]> {
    return ProveedorRepseValidacion.query()
      .where('proveedor_repse_id', proveedorRepseId)
      .preload('autor', (q) => q.preload('person'))
      .orderBy('proveedor_repse_validacion_fecha', 'desc')
      .orderBy('proveedor_repse_validacion_id', 'desc')
  }

  async findByIdForProveedor(
    proveedorRepseId: number,
    proveedorRepseValidacionId: number
  ): Promise<ProveedorRepseValidacion | null> {
    return ProveedorRepseValidacion.query()
      .where('proveedor_repse_validacion_id', proveedorRepseValidacionId)
      .where('proveedor_repse_id', proveedorRepseId)
      .preload('autor', (q) => q.preload('person'))
      .first()
  }

  async findLastByProveedor(proveedorRepseId: number): Promise<ProveedorRepseValidacion | null> {
    return ProveedorRepseValidacion.query()
      .where('proveedor_repse_id', proveedorRepseId)
      .preload('autor', (q) => q.preload('person'))
      .orderBy('proveedor_repse_validacion_fecha', 'desc')
      .orderBy('proveedor_repse_validacion_id', 'desc')
      .first()
  }
}
