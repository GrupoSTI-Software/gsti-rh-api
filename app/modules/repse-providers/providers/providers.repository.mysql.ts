import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import ProveedorRepse from '#models/proveedor_repse'
import type { ProveedorRepseValidacionEstatus } from '#models/proveedor_repse_validacion'
import type {
  ProveedorRepseCreateData,
  ProveedorRepseLastValidation,
  ProveedorRepsePaginatedResult,
  ProveedorRepseSearch,
  ProveedorRepseUpdateData,
  ProvidersRepository,
} from './providers.repository.js'

interface LastValidationRow {
  proveedorRepseId: number
  fecha: string
  estatus: ProveedorRepseValidacionEstatus
}

export default class ProvidersRepositoryMysql implements ProvidersRepository {
  async listPaginated(
    page: number,
    perPage: number,
    businessUnitIds: number[],
    search?: ProveedorRepseSearch
  ): Promise<ProveedorRepsePaginatedResult> {
    if (businessUnitIds.length === 0) {
      return {
        meta: { total: 0, perPage, currentPage: page, lastPage: 0, page, firstPage: 1 },
        data: [],
      }
    }

    const query = ProveedorRepse.query()
      .whereNull('proveedor_repse_deleted_at')
      .whereIn('business_unit_id', businessUnitIds)

    if (search) {
      // Agrupado para que el OR no escape del filtro de tenant ni del soft delete.
      query.where((group) => {
        group
          .whereRaw('LOWER(proveedor_repse_razon_social) LIKE ?', [search.likePattern])
          .orWhereRaw('LOWER(proveedor_repse_folio) LIKE ?', [search.likePattern])
        if (search.rfcHash !== null) {
          group.orWhere('proveedor_repse_rfc_hash', search.rfcHash)
        }
      })
    }

    const paginator = await query
      .orderBy('proveedor_repse_created_at', 'desc')
      .paginate(page, perPage)

    const serialized = paginator.serialize()
    return {
      meta: { ...serialized.meta, page: serialized.meta.currentPage },
      data: paginator.all(),
    }
  }

  async findByIdInScope(
    proveedorRepseId: number,
    businessUnitIds: number[]
  ): Promise<ProveedorRepse | null> {
    if (businessUnitIds.length === 0) {
      return null
    }
    return ProveedorRepse.query()
      .where('proveedor_repse_id', proveedorRepseId)
      .whereNull('proveedor_repse_deleted_at')
      .whereIn('business_unit_id', businessUnitIds)
      .first()
  }

  async findActiveByFolio(
    businessUnitId: number,
    folio: string,
    excludeId?: number
  ): Promise<ProveedorRepse | null> {
    const normalized = folio.trim().toLowerCase()
    let query = ProveedorRepse.query()
      .where('business_unit_id', businessUnitId)
      .whereNull('proveedor_repse_deleted_at')
      .whereRaw('LOWER(TRIM(proveedor_repse_folio)) = ?', [normalized])

    if (excludeId !== undefined) {
      query = query.whereNot('proveedor_repse_id', excludeId)
    }

    return query.first()
  }

  async create(data: ProveedorRepseCreateData): Promise<ProveedorRepse> {
    return db.transaction(async (trx) => {
      const row = new ProveedorRepse()
      row.businessUnitId = data.businessUnitId
      row.razonSocial = data.razonSocial
      row.rfc = data.rfc
      row.rfcHash = data.rfcHash
      row.folio = data.folio
      row.objetoRegistrado = data.objetoRegistrado
      row.folioVencimiento = data.folioVencimiento
      row.periodicidadMeses = data.periodicidadMeses
      row.nextReviewAt = null
      row.useTransaction(trx)
      await row.save()
      return row
    })
  }

  async update(proveedorRepseId: number, data: ProveedorRepseUpdateData): Promise<ProveedorRepse> {
    return db.transaction(async (trx) => {
      const row = await ProveedorRepse.query({ client: trx })
        .where('proveedor_repse_id', proveedorRepseId)
        .whereNull('proveedor_repse_deleted_at')
        .forUpdate()
        .firstOrFail()

      if (data.businessUnitId !== undefined) row.businessUnitId = data.businessUnitId
      if (data.razonSocial !== undefined) row.razonSocial = data.razonSocial
      if (data.rfc !== undefined) row.rfc = data.rfc
      if (data.rfcHash !== undefined) row.rfcHash = data.rfcHash
      if (data.folio !== undefined) row.folio = data.folio
      if (data.objetoRegistrado !== undefined) row.objetoRegistrado = data.objetoRegistrado
      if (data.folioVencimiento !== undefined) row.folioVencimiento = data.folioVencimiento
      if (data.periodicidadMeses !== undefined) row.periodicidadMeses = data.periodicidadMeses

      row.useTransaction(trx)
      await row.save()
      return row
    })
  }

  async softDelete(proveedorRepseId: number): Promise<void> {
    const row = await ProveedorRepse.query()
      .where('proveedor_repse_id', proveedorRepseId)
      .whereNull('proveedor_repse_deleted_at')
      .firstOrFail()
    await row.delete()
  }

  async findLastValidationsByProveedorIds(
    proveedorRepseIds: number[]
  ): Promise<Map<number, ProveedorRepseLastValidation>> {
    const result = new Map<number, ProveedorRepseLastValidation>()
    if (proveedorRepseIds.length === 0) {
      return result
    }

    // Subconsulta correlacionada: la más reciente por fecha y, en empate, por id
    // (mismo criterio que la bitácora). Usa `idx_prv_proveedor_fecha`. La fecha
    // se formatea en SQL para no pasar una columna DATE por la zona del proceso.
    const rows: LastValidationRow[] = await db
      .from('proveedor_repse_validaciones as v')
      .select(
        'v.proveedor_repse_id as proveedorRepseId',
        'v.proveedor_repse_validacion_estatus as estatus'
      )
      .select(db.raw("DATE_FORMAT(v.proveedor_repse_validacion_fecha, '%Y-%m-%d') as fecha"))
      .whereIn('v.proveedor_repse_id', proveedorRepseIds)
      .whereRaw(
        `v.proveedor_repse_validacion_id = (
          SELECT v2.proveedor_repse_validacion_id
          FROM proveedor_repse_validaciones v2
          WHERE v2.proveedor_repse_id = v.proveedor_repse_id
          ORDER BY v2.proveedor_repse_validacion_fecha DESC, v2.proveedor_repse_validacion_id DESC
          LIMIT 1
        )`
      )

    for (const row of rows) {
      result.set(Number(row.proveedorRepseId), { fecha: row.fecha, estatus: row.estatus })
    }
    return result
  }

  async updateNextReviewAt(proveedorRepseId: number, nextReviewAt: DateTime | null): Promise<void> {
    await ProveedorRepse.query()
      .where('proveedor_repse_id', proveedorRepseId)
      .update({ proveedor_repse_next_review_at: nextReviewAt ? nextReviewAt.toSQLDate() : null })
  }
}
