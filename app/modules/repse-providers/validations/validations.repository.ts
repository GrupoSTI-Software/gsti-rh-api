import type { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type ProveedorRepseValidacion from '#models/proveedor_repse_validacion'
import type { ProveedorRepseValidacionEstatus } from '#models/proveedor_repse_validacion'

export interface ProveedorRepseValidacionCreateData {
  proveedorRepseId: number
  businessUnitId: number
  estatus: ProveedorRepseValidacionEstatus
  fecha: DateTime
  autorUserId: number
  evidenciaNombreArchivo: string
  evidenciaStorageKey: string
  evidenciaMimeType: string
  evidenciaTamanoBytes: number
}

export interface ValidationsRepository {
  create(
    data: ProveedorRepseValidacionCreateData,
    trx?: TransactionClientContract
  ): Promise<ProveedorRepseValidacion>

  /** Bitácora completa de un proveedor, más reciente primero. */
  listByProveedor(proveedorRepseId: number): Promise<ProveedorRepseValidacion[]>

  /** Una validación puntual, acotada a su proveedor (evita fugas entre proveedores del mismo tenant). */
  findByIdForProveedor(
    proveedorRepseId: number,
    proveedorRepseValidacionId: number
  ): Promise<ProveedorRepseValidacion | null>

  /** Última validación registrada (por `fecha`, no por orden de alta) para el proveedor. */
  findLastByProveedor(proveedorRepseId: number): Promise<ProveedorRepseValidacion | null>
}
