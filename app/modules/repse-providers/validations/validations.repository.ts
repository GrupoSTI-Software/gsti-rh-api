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

/** Partes del nombre de la persona detrás de la cuenta autora de una validación. */
export interface ValidacionAutorPersona {
  personFirstname: string | null
  personLastname: string | null
  personSecondLastname: string | null
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

  /**
   * Persona de cada cuenta autora, por `user_id`. Las cuentas sin persona (o con
   * la persona dada de baja) no aparecen en el mapa.
   */
  findAutorPersonas(userIds: number[]): Promise<Map<number, ValidacionAutorPersona>>
}
