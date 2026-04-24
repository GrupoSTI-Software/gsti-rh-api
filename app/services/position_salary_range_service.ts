import { DateTime } from 'luxon'
import PositionSalaryRange from '#models/position_salary_range'
import PositionSalaryRangeAudit from '#models/position_salary_range_audit'
import BusinessUnit from '#models/business_unit'
import Position from '#models/position'

export interface ServiceError {
  status: number
  key: string
  title: string
  message: string
}

export interface CreateRangeSuccess {
  status: 201
  range: PositionSalaryRange
}

export interface ListRangesSuccess {
  status: 200
  data: PositionSalaryRange[]
}

export interface GetCurrentSuccess {
  status: 200
  range: PositionSalaryRange
}

export interface CloseSuccess {
  status: 204
}

interface CreateRangeInput {
  businessUnitId: number
  positionId: number
  minSalaryDaily: number
  maxSalaryDaily: number
  validFrom: DateTime
  reason?: string
  createdBy: number
}

interface ListRangesFilter {
  businessUnitId: number
  positionId?: number
  includeHistory?: boolean
}

export default class PositionSalaryRangeService {
  async verifyReferences(businessUnitId: number, positionId: number): Promise<ServiceError | null> {
    const businessUnit = await BusinessUnit.query()
      .where('business_unit_id', businessUnitId)
      .whereNull('business_unit_deleted_at')
      .first()

    if (!businessUnit) {
      return {
        status: 422,
        key: 'referencia-invalida',
        title: 'Referencia inválida',
        message: 'La razón social indicada no existe o fue eliminada',
      }
    }

    const position = await Position.query()
      .where('position_id', positionId)
      .whereNull('position_deleted_at')
      .first()

    if (!position) {
      return {
        status: 422,
        key: 'referencia-invalida',
        title: 'Referencia inválida',
        message: 'El puesto indicado no existe o fue eliminado',
      }
    }

    return null
  }

  async findActiveRange(businessUnitId: number, positionId: number) {
    return PositionSalaryRange.query()
      .where('business_unit_id', businessUnitId)
      .where('position_id', positionId)
      .whereNull('valid_to')
      .whereNull('position_salary_range_deleted_at')
      .first()
  }

  async create(input: CreateRangeInput): Promise<ServiceError | CreateRangeSuccess> {
    if (input.minSalaryDaily > input.maxSalaryDaily) {
      return {
        status: 422,
        key: 'rango-invalido-min-mayor-max',
        title: 'Rango inválido',
        message: 'El salario mínimo no puede ser mayor al salario máximo',
      }
    }

    const refError = await this.verifyReferences(input.businessUnitId, input.positionId)
    if (refError) return refError

    const existing = await this.findActiveRange(input.businessUnitId, input.positionId)
    if (existing) {
      return {
        status: 409,
        key: 'rango-vigente-existente',
        title: 'Conflicto de vigencia',
        message: 'El puesto ya tiene un rango salarial vigente en esta razón social. Ciérrelo antes de crear uno nuevo.',
      }
    }

    const range = new PositionSalaryRange()
    range.businessUnitId = input.businessUnitId
    range.positionId = input.positionId
    range.minSalaryDaily = input.minSalaryDaily
    range.maxSalaryDaily = input.maxSalaryDaily
    range.validFrom = input.validFrom
    range.validTo = null
    range.createdBy = input.createdBy

    await range.save()

    await this.recordAudit({
      rangeId: range.positionSalaryRangeId,
      action: 'create',
      oldMin: null,
      oldMax: null,
      newMin: input.minSalaryDaily,
      newMax: input.maxSalaryDaily,
      actorId: input.createdBy,
      reason: input.reason ?? null,
    })

    return { status: 201, range }
  }

  async list(filter: ListRangesFilter): Promise<ListRangesSuccess> {
    const query = PositionSalaryRange.query()
      .where('business_unit_id', filter.businessUnitId)
      .whereNull('position_salary_range_deleted_at')

    if (filter.positionId) {
      query.where('position_id', filter.positionId)
    }

    if (!filter.includeHistory) {
      query.whereNull('valid_to')
    }

    const ranges = await query.orderBy('position_salary_range_id', 'desc')
    return { status: 200, data: ranges }
  }

  async getCurrent(businessUnitId: number, positionId: number): Promise<ServiceError | GetCurrentSuccess> {
    const refError = await this.verifyReferences(businessUnitId, positionId)
    if (refError) return refError

    const range = await this.findActiveRange(businessUnitId, positionId)

    if (!range) {
      return {
        status: 404,
        key: 'rango-no-encontrado',
        title: 'Rango no encontrado',
        message: 'No se encontró un rango salarial vigente para el puesto en la razón social indicada',
      }
    }

    return { status: 200, range }
  }

  async close(positionSalaryRangeId: number, actorId: number, reason?: string): Promise<ServiceError | CloseSuccess> {
    const range = await PositionSalaryRange.query()
      .where('position_salary_range_id', positionSalaryRangeId)
      .whereNull('position_salary_range_deleted_at')
      .first()

    if (!range) {
      return {
        status: 404,
        key: 'rango-no-encontrado',
        title: 'Rango no encontrado',
        message: 'No se encontró el rango salarial con el ID indicado',
      }
    }

    if (range.validTo !== null) {
      return {
        status: 409,
        key: 'rango-ya-cerrado',
        title: 'Rango ya cerrado',
        message: 'El rango salarial ya fue cerrado y no puede cerrarse de nuevo',
      }
    }

    const oldMin = range.minSalaryDaily
    const oldMax = range.maxSalaryDaily

    range.validTo = DateTime.now()
    await range.save()

    await this.recordAudit({
      rangeId: range.positionSalaryRangeId,
      action: 'close',
      oldMin,
      oldMax,
      newMin: null,
      newMax: null,
      actorId,
      reason: reason ?? null,
    })

    return { status: 204 }
  }

  private async recordAudit(params: {
    rangeId: number
    action: 'create' | 'update' | 'close'
    oldMin: number | null
    oldMax: number | null
    newMin: number | null
    newMax: number | null
    actorId: number
    reason: string | null
  }) {
    const audit = new PositionSalaryRangeAudit()
    audit.rangeId = params.rangeId
    audit.action = params.action
    audit.oldMinSalaryDaily = params.oldMin
    audit.oldMaxSalaryDaily = params.oldMax
    audit.newMinSalaryDaily = params.newMin
    audit.newMaxSalaryDaily = params.newMax
    audit.actorId = params.actorId
    audit.reason = params.reason
    await audit.save()
  }
}
