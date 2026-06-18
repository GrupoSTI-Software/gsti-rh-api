import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'
import AsignacionContratoEspecializado from '#models/asignacion_contrato_especializado'
import ContratoServicioEspecializado from '#models/contrato_servicio_especializado'
import Employee from '#models/employee'
import { ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES } from '../constants/asignacion_contrato_especializado_error_codes.js'
import { AsignacionContratoEspecializadoError } from '../exceptions/asignacion_contrato_especializado_error.js'
import {
  assertAsignacionDentroDeVigencia,
  computeContratoVigenciaEfectiva,
  toIsoDateFromInput,
} from '../helpers/contrato_vigencia_efectiva.js'
import { rangesOverlap } from '../helpers/date_range_overlap.js'
import {
  findContratoInTenantOrFail,
  findEmployeeInTenantOrFail,
  getAllowedBusinessUnitIds,
} from '../helpers/repse_tenant_scope.js'
export type AsignacionAdvertencia = {
  key: string
  detail: string
}

export type AsignacionBulkItemInput = {
  employeeId: number
  fechaInicio: Date
  fechaFin?: Date | null
  porcentajeTiempo?: number
}

export type AsignacionUpdateInput = {
  fechaInicio?: Date
  fechaFin?: Date | null
  porcentajeTiempo?: number
}

export type AsignacionEmpleadoSerialized = {
  id: number
  nombre: string
  nss: string | null
}

export type AsignacionListItemSerialized = {
  id: number
  contratoServicioEspecializadoId: number
  empleado: AsignacionEmpleadoSerialized
  fechaInicio: string
  fechaFin: string | null
  porcentajeTiempo: string
}

export type AsignacionSerialized = AsignacionListItemSerialized & {
  advertencias: AsignacionAdvertencia[]
}

export type ListAsignacionesFilters = {
  page: number
  perPage: number
  employeeId?: number
  vigentesEn?: string
}

function formatPorcentaje(value: number): string {
  return value.toFixed(2)
}

function serializeEmpleado(employee: Employee): AsignacionEmpleadoSerialized {
  const nombre = `${employee.employeeFirstName ?? ''} ${employee.employeeLastName ?? ''}`.trim()
  const nss = employee.person?.personImssNss ?? null
  return {
    id: employee.employeeId,
    nombre,
    nss,
  }
}

export function serializeAsignacionForList(
  row: AsignacionContratoEspecializado
): AsignacionListItemSerialized {
  const employee = row.employee
  return {
    id: row.asignacionContratoEspecializadoId,
    contratoServicioEspecializadoId: row.contratoServicioEspecializadoId,
    empleado: employee ? serializeEmpleado(employee) : { id: row.employeeId, nombre: '', nss: null },
    fechaInicio: row.fechaInicio.toISODate()!,
    fechaFin: row.fechaFin?.toISODate() ?? null,
    porcentajeTiempo: formatPorcentaje(Number(row.porcentajeTiempo)),
  }
}

export function serializeAsignacion(
  row: AsignacionContratoEspecializado,
  advertencias: AsignacionAdvertencia[] = []
): AsignacionSerialized {
  return {
    ...serializeAsignacionForList(row),
    advertencias,
  }
}

/**
 * Servicio de dominio de asignaciones de trabajadores a contratos REPSE.
 */
export default class AsignacionContratoEspecializadoService {
  /**
   * Alta en bloque atómica de asignaciones para un contrato vigente.
   */
  async createBulk(
    contratoId: number,
    items: AsignacionBulkItemInput[]
  ): Promise<AsignacionSerialized[]> {
    const contrato = await findContratoInTenantOrFail(contratoId, {
      withDocumentoVigenteFecha: true,
    })

    if (contrato.estatusEfectivo !== 'vigente') {
      throw new AsignacionContratoEspecializadoError(
        'Solo se pueden asignar trabajadores a contratos vigentes.',
        ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES.CONTRATO_NO_VIGENTE,
        422,
        'contrato-no-vigente',
        'Solo se pueden asignar trabajadores a contratos vigentes'
      )
    }

    const vigencia = await computeContratoVigenciaEfectiva(contrato)
    const prepared = await this.prepareItemsForValidation(items, vigencia, true)

    const created = await db.transaction(async (trx) => {
      const rows: AsignacionContratoEspecializado[] = []

      for (const item of prepared) {
        await this.assertNoSolapeMismoContrato(
          trx,
          contrato.contratoServicioEspecializadoId,
          item.employeeId,
          item.fechaInicioIso,
          item.fechaFinIso,
          item.itemIndex
        )

        const asignacion = new AsignacionContratoEspecializado()
        asignacion.contratoServicioEspecializadoId = contrato.contratoServicioEspecializadoId
        asignacion.employeeId = item.employeeId
        asignacion.businessUnitId = contrato.businessUnitId
        asignacion.fechaInicio = DateTime.fromISO(item.fechaInicioIso)
        asignacion.fechaFin = item.fechaFinIso ? DateTime.fromISO(item.fechaFinIso) : null
        asignacion.porcentajeTiempo = item.porcentajeTiempo
        asignacion.useTransaction(trx)
        await asignacion.save()
        rows.push(asignacion)
      }

      return rows
    })

    logger.info(
      { contratoId: contrato.contratoServicioEspecializadoId, count: created.length },
      'Asignaciones REPSE creadas en bloque'
    )

    const advertenciasMap = new Map<number, AsignacionAdvertencia[]>()
    for (const item of prepared) {
      const warning = await this.computePorcentajeAdvertencia(
        item.employeeId,
        item.fechaInicioIso,
        item.fechaFinIso,
        item.porcentajeTiempo,
        contrato.contratoServicioEspecializadoId,
        created.map((r) => r.asignacionContratoEspecializadoId)
      )
      if (warning) {
        advertenciasMap.set(item.employeeId, [warning])
      }
    }

    await this.preloadEmployees(created)

    return created.map((row) =>
      serializeAsignacion(row, advertenciasMap.get(row.employeeId) ?? [])
    )
  }

  /**
   * Listado paginado de asignaciones de un contrato.
   */
  async listPaginated(contratoId: number, filters: ListAsignacionesFilters) {
    await findContratoInTenantOrFail(contratoId)
    const allowed = await getAllowedBusinessUnitIds()
    const safePage = Math.max(filters.page, 1)
    const safePerPage = Math.min(Math.max(filters.perPage, 1), 500)

    let query = AsignacionContratoEspecializado.query()
      .where('contrato_servicio_especializado_id', contratoId)
    query = AsignacionContratoEspecializado.forAllowedBusinessUnits(query, allowed)

    if (filters.employeeId !== undefined) {
      query.where('employee_id', filters.employeeId)
    }
    if (filters.vigentesEn !== undefined) {
      query = AsignacionContratoEspecializado.vigentesEn(query, filters.vigentesEn)
    }

    const paginated = await query
      .preload('employee', (employeeQuery) => {
        employeeQuery.preload('person')
      })
      .orderBy('asignacion_contrato_especializado_fecha_inicio', 'desc')
      .orderBy('asignacion_contrato_especializado_id', 'desc')
      .paginate(safePage, safePerPage)

    return {
      meta: paginated.getMeta(),
      data: paginated.all().map((row) => serializeAsignacionForList(row)),
    }
  }

  /**
   * Actualiza fechas o porcentaje de una asignación existente.
   */
  async update(
    contratoId: number,
    asignacionId: number,
    patch: AsignacionUpdateInput
  ): Promise<AsignacionSerialized> {
    const contrato = await findContratoInTenantOrFail(contratoId, {
      withDocumentoVigenteFecha: true,
    })
    const allowed = await getAllowedBusinessUnitIds()
    const row = await this.findAsignacionInContratoOrFail(
      contratoId,
      asignacionId,
      allowed
    )

    const fechaInicioIso = patch.fechaInicio
      ? toIsoDateFromInput(patch.fechaInicio)
      : row.fechaInicio.toISODate()!
    const fechaFinIso =
      patch.fechaFin !== undefined
        ? patch.fechaFin === null
          ? null
          : toIsoDateFromInput(patch.fechaFin)
        : (row.fechaFin?.toISODate() ?? null)
    const porcentajeTiempo =
      patch.porcentajeTiempo !== undefined ? patch.porcentajeTiempo : Number(row.porcentajeTiempo)

    this.assertFechasCoherentes(fechaInicioIso, fechaFinIso)

    const vigencia = await computeContratoVigenciaEfectiva(contrato)
    this.assertDentroDeVigencia(
      fechaInicioIso,
      fechaFinIso,
      vigencia,
      row.employeeId,
      undefined
    )

    await db.transaction(async (trx) => {
      await this.assertNoSolapeMismoContrato(
        trx,
        contratoId,
        row.employeeId,
        fechaInicioIso,
        fechaFinIso,
        undefined,
        asignacionId
      )

      row.fechaInicio = DateTime.fromISO(fechaInicioIso)
      row.fechaFin = fechaFinIso ? DateTime.fromISO(fechaFinIso) : null
      row.porcentajeTiempo = porcentajeTiempo
      row.useTransaction(trx)
      await row.save()
    })

    const warning = await this.computePorcentajeAdvertencia(
      row.employeeId,
      fechaInicioIso,
      fechaFinIso,
      porcentajeTiempo,
      contratoId,
      [asignacionId]
    )

    await row.load('employee', (employeeQuery) => {
      employeeQuery.preload('person')
    })

    return serializeAsignacion(row, warning ? [warning] : [])
  }

  /**
   * Soft delete de una asignación (solo errores de captura).
   */
  async destroy(contratoId: number, asignacionId: number): Promise<void> {
    await findContratoInTenantOrFail(contratoId)
    const allowed = await getAllowedBusinessUnitIds()
    const row = await this.findAsignacionInContratoOrFail(
      contratoId,
      asignacionId,
      allowed
    )
    await row.delete()
    logger.info(
      { contratoId, asignacionId: row.asignacionContratoEspecializadoId },
      'Asignación REPSE eliminada lógicamente'
    )
  }

  private async findAsignacionInContratoOrFail(
    contratoId: number,
    asignacionId: number,
    allowed: number[]
  ): Promise<AsignacionContratoEspecializado> {
    let query = AsignacionContratoEspecializado.query()
      .where('asignacion_contrato_especializado_id', asignacionId)
      .where('contrato_servicio_especializado_id', contratoId)
    query = AsignacionContratoEspecializado.forAllowedBusinessUnits(query, allowed)

    const row = await query.first()
    if (!row) {
      throw new AsignacionContratoEspecializadoError(
        'La asignación no existe o no pertenece al contrato indicado.',
        ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES.NOT_FOUND,
        404,
        undefined,
        'La asignación no existe o no pertenece al contrato indicado.'
      )
    }
    return row
  }

  private async prepareItemsForValidation(
    items: AsignacionBulkItemInput[],
    vigencia: Awaited<ReturnType<typeof computeContratoVigenciaEfectiva>>,
    validateEmployees: boolean
  ) {
    const prepared: Array<{
      itemIndex: number
      employeeId: number
      fechaInicioIso: string
      fechaFinIso: string | null
      porcentajeTiempo: number
    }> = []

    for (const [index, item] of items.entries()) {
      const itemIndex = index + 1
      const fechaInicioIso = toIsoDateFromInput(item.fechaInicio)
      const fechaFinIso =
        item.fechaFin === undefined || item.fechaFin === null
          ? null
          : toIsoDateFromInput(item.fechaFin)
      const porcentajeTiempo = item.porcentajeTiempo ?? 100

      this.assertFechasCoherentes(fechaInicioIso, fechaFinIso, itemIndex, item.employeeId)
      this.assertDentroDeVigencia(
        fechaInicioIso,
        fechaFinIso,
        vigencia,
        item.employeeId,
        itemIndex
      )

      if (validateEmployees) {
        await findEmployeeInTenantOrFail(item.employeeId, { itemIndex })
      }

      prepared.push({
        itemIndex,
        employeeId: item.employeeId,
        fechaInicioIso,
        fechaFinIso,
        porcentajeTiempo,
      })
    }

    return prepared
  }

  private assertFechasCoherentes(
    fechaInicioIso: string,
    fechaFinIso: string | null,
    itemIndex?: number,
    employeeId?: number
  ) {
    if (fechaFinIso !== null && fechaFinIso < fechaInicioIso) {
      const suffix =
        itemIndex !== undefined
          ? ` del item ${itemIndex}${employeeId !== undefined ? ` (empleado ${employeeId})` : ''}`
          : ''
      throw new AsignacionContratoEspecializadoError(
        `La fecha fin es anterior a la fecha inicio${suffix}.`,
        ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_FECHAS,
        422,
        'fecha-fin-anterior-a-fecha-inicio',
        `La fecha fin${suffix} es anterior a la fecha inicio`
      )
    }
  }

  private assertDentroDeVigencia(
    fechaInicioIso: string,
    fechaFinIso: string | null,
    vigencia: Awaited<ReturnType<typeof computeContratoVigenciaEfectiva>>,
    employeeId: number,
    itemIndex?: number
  ) {
    if (!assertAsignacionDentroDeVigencia(fechaInicioIso, fechaFinIso, vigencia)) {
      const rangoFin = vigencia.fechaFin ?? 'sin fin'
      const detail =
        itemIndex !== undefined
          ? `Las fechas del item ${itemIndex} (empleado ${employeeId}) salen de la vigencia del contrato (${vigencia.fechaInicio} a ${rangoFin})`
          : `Las fechas de la asignación (empleado ${employeeId}) salen de la vigencia del contrato (${vigencia.fechaInicio} a ${rangoFin})`
      throw new AsignacionContratoEspecializadoError(
        detail,
        ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES.FUERA_DE_VIGENCIA,
        422,
        'asignacion-fuera-de-vigencia',
        detail
      )
    }
  }

  private async assertNoSolapeMismoContrato(
    trx: TransactionClientContract,
    contratoId: number,
    employeeId: number,
    fechaInicioIso: string,
    fechaFinIso: string | null,
    itemIndex?: number,
    excludeAsignacionId?: number
  ) {
    let query = AsignacionContratoEspecializado.query({ client: trx })
      .where('contrato_servicio_especializado_id', contratoId)
      .where('employee_id', employeeId)
      .whereNull('asignacion_contrato_especializado_deleted_at')
      .forUpdate()

    if (excludeAsignacionId !== undefined) {
      query.whereNot('asignacion_contrato_especializado_id', excludeAsignacionId)
    }

    const existentes = await query

    for (const existente of existentes) {
      const existenteInicio = existente.fechaInicio.toISODate()!
      const existenteFin = existente.fechaFin?.toISODate() ?? null
      if (rangesOverlap(fechaInicioIso, fechaFinIso, existenteInicio, existenteFin)) {
        const itemLabel = itemIndex !== undefined ? ` (item ${itemIndex})` : ''
        throw new AsignacionContratoEspecializadoError(
          `El empleado ${employeeId}${itemLabel} ya está asignado a este contrato en el periodo indicado.`,
          ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES.ASIGNACION_DUPLICADA,
          409,
          'asignacion-duplicada',
          `El empleado ${employeeId}${itemLabel} ya está asignado a este contrato en el periodo indicado`
        )
      }
    }
  }

  private async computePorcentajeAdvertencia(
    employeeId: number,
    fechaInicioIso: string,
    fechaFinIso: string | null,
    porcentajeNuevo: number,
    _contratoActualId: number,
    excludeIds: number[] = []
  ): Promise<AsignacionAdvertencia | null> {
    const allowed = await getAllowedBusinessUnitIds()
    let query = AsignacionContratoEspecializado.query()
      .where('employee_id', employeeId)
      .whereNull('asignacion_contrato_especializado_deleted_at')
    query = AsignacionContratoEspecializado.forAllowedBusinessUnits(query, allowed)

    if (excludeIds.length > 0) {
      query.whereNotIn('asignacion_contrato_especializado_id', excludeIds)
    }

    const asignaciones = await query
    const contratoIds = [
      ...new Set(asignaciones.map((row) => row.contratoServicioEspecializadoId)),
    ]

    const contratoMap = new Map<number, ContratoServicioEspecializado>()
    if (contratoIds.length > 0) {
      let contratosQuery = ContratoServicioEspecializado.query().whereIn(
        'contrato_servicio_especializado_id',
        contratoIds
      )
      contratosQuery =
        ContratoServicioEspecializado.withDocumentoVigenteFechaVencimiento(contratosQuery)
      const contratos = await contratosQuery
      for (const contrato of contratos) {
        contratoMap.set(contrato.contratoServicioEspecializadoId, contrato)
      }
    }

    let total = porcentajeNuevo

    for (const asignacion of asignaciones) {
      const contrato = contratoMap.get(asignacion.contratoServicioEspecializadoId)
      if (!contrato || contrato.estatusEfectivo !== 'vigente') continue

      const aInicio = asignacion.fechaInicio.toISODate()!
      const aFin = asignacion.fechaFin?.toISODate() ?? null
      if (rangesOverlap(fechaInicioIso, fechaFinIso, aInicio, aFin)) {
        total += Number(asignacion.porcentajeTiempo)
      }
    }

    if (total > 100) {
      const totalFormatted = total.toFixed(2)
      return {
        key: 'porcentaje-dedicacion-excedido',
        detail: `El empleado suma ${totalFormatted}% de dedicación en contratos vigentes solapados`,
      }
    }

    return null
  }

  private async preloadEmployees(rows: AsignacionContratoEspecializado[]) {
    await Promise.all(
      rows.map((row) =>
        row.load('employee', (employeeQuery) => {
          employeeQuery.preload('person')
        })
      )
    )
  }
}
