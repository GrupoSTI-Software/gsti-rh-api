import db from '@adonisjs/lucid/services/db'
import ProveedorRepseValidacion from '#models/proveedor_repse_validacion'
import type {
  ProveedorRepseValidacionCreateData,
  ValidacionAutorPersona,
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
    await row.load('autor')
    return row
  }

  async listByProveedor(proveedorRepseId: number): Promise<ProveedorRepseValidacion[]> {
    return ProveedorRepseValidacion.query()
      .where('proveedor_repse_id', proveedorRepseId)
      .preload('autor')
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
      .preload('autor')
      .first()
  }

  async findLastByProveedor(proveedorRepseId: number): Promise<ProveedorRepseValidacion | null> {
    return ProveedorRepseValidacion.query()
      .where('proveedor_repse_id', proveedorRepseId)
      .preload('autor')
      .orderBy('proveedor_repse_validacion_fecha', 'desc')
      .orderBy('proveedor_repse_validacion_id', 'desc')
      .first()
  }

  /**
   * Va por el query builder de la BD y no por el modelo `Person` a propósito:
   * el mixin de tenant de `Person` oculta las personas de plataforma
   * (`business_unit_id` NULL) y las de otra empresa, y la bitácora mostraba el
   * correo en lugar del nombre de quien validó. Solo se leen las tres partes
   * del nombre de cuentas que ya firmaron una validación de este tenant.
   */
  async findAutorPersonas(userIds: number[]): Promise<Map<number, ValidacionAutorPersona>> {
    const personas = new Map<number, ValidacionAutorPersona>()
    if (userIds.length === 0) return personas

    const rows: Array<ValidacionAutorPersona & { userId: number }> = await db
      .from('users')
      .join('people', 'people.person_id', 'users.person_id')
      .whereIn('users.user_id', userIds)
      .whereNull('people.person_deleted_at')
      .select(
        'users.user_id as userId',
        'people.person_firstname as personFirstname',
        'people.person_lastname as personLastname',
        'people.person_second_lastname as personSecondLastname'
      )

    for (const row of rows) {
      personas.set(Number(row.userId), {
        personFirstname: row.personFirstname,
        personLastname: row.personLastname,
        personSecondLastname: row.personSecondLastname,
      })
    }
    return personas
  }
}
