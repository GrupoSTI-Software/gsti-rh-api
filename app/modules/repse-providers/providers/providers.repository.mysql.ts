import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import ProveedorRepse from '#models/proveedor_repse'
import type {
  ProveedorRepseCreateData,
  ProveedorRepsePaginatedResult,
  ProveedorRepseUpdateData,
  ProvidersRepository,
} from './providers.repository.js'

export default class ProvidersRepositoryMysql implements ProvidersRepository {
  async listPaginated(
    page: number,
    perPage: number,
    businessUnitIds: number[]
  ): Promise<ProveedorRepsePaginatedResult> {
    if (businessUnitIds.length === 0) {
      return {
        meta: { total: 0, perPage, currentPage: page, lastPage: 0, page, firstPage: 1 },
        data: [],
      }
    }

    const paginator = await ProveedorRepse.query()
      .whereNull('proveedor_repse_deleted_at')
      .whereIn('business_unit_id', businessUnitIds)
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

  async updateNextReviewAt(proveedorRepseId: number, nextReviewAt: DateTime | null): Promise<void> {
    await ProveedorRepse.query()
      .where('proveedor_repse_id', proveedorRepseId)
      .update({ proveedor_repse_next_review_at: nextReviewAt ? nextReviewAt.toSQLDate() : null })
  }
}
