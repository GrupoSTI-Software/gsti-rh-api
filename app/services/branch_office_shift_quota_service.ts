import db from '@adonisjs/lucid/services/db'
import BranchOffice from '#models/branch_office'
import BranchOfficeShiftQuota from '#models/branch_office_shift_quota'
import Shift from '#models/shift'
import { BRANCH_OFFICE_SHIFT_QUOTA_ERROR_CODES } from '../constants/branch_office_shift_quota_error_codes.js'
import { BranchOfficeShiftQuotaError } from '../exceptions/branch_office_shift_quota_error.js'
import type { BranchOfficeShiftQuotaInput } from '../validators/branch_office_shift_quota.js'

export type SerializedBranchOfficeShiftQuota = {
  branchOfficeShiftQuotaId: number
  shift: {
    shiftId: number
    shiftName: string
  }
  required: number
  minimum: number
}

function serializeQuota(row: BranchOfficeShiftQuota): SerializedBranchOfficeShiftQuota {
  return {
    branchOfficeShiftQuotaId: row.branchOfficeShiftQuotaId,
    shift: {
      shiftId: row.shift.shiftId,
      shiftName: row.shift.shiftName,
    },
    required: row.branchOfficeShiftQuotaRequired,
    minimum: row.branchOfficeShiftQuotaMinimum,
  }
}

export default class BranchOfficeShiftQuotaService {
  /**
   * Lista las cuotas configuradas para una sucursal dentro del scope.
   */
  static async list(
    branchOfficeId: number,
    businessUnitScope: number[]
  ): Promise<SerializedBranchOfficeShiftQuota[]> {
    await this.resolveBranchOffice(branchOfficeId, businessUnitScope)

    const rows = await BranchOfficeShiftQuota.query()
      .where('branchOfficeId', branchOfficeId)
      .whereHas('shift', (shiftQuery) => {
        shiftQuery.whereNull('shift_deleted_at').where('shift_temp', 0)
      })
      .preload('shift')
      .orderBy('branch_office_shift_quota_id', 'asc')

    return rows
      .map(serializeQuota)
      .sort((a, b) => a.shift.shiftName.localeCompare(b.shift.shiftName, 'es'))
  }

  /**
   * Reemplaza atómicamente todas las cuotas de la sucursal.
   */
  static async replaceAll(
    branchOfficeId: number,
    quotas: BranchOfficeShiftQuotaInput[],
    businessUnitScope: number[]
  ): Promise<SerializedBranchOfficeShiftQuota[]> {
    const branch = await this.resolveBranchOffice(branchOfficeId, businessUnitScope)
    const businessUnitSlug = branch.businessUnit.businessUnitSlug

    for (const [index, item] of quotas.entries()) {
      const itemIndex = index + 1
      this.assertQuotaThresholds(item, itemIndex)
      await this.assertShiftAvailableForBranch(item.shiftId, itemIndex, businessUnitSlug)
    }

    await db.transaction(async (trx) => {
      await BranchOfficeShiftQuota.query({ client: trx })
        .where('branchOfficeId', branchOfficeId)
        .delete()

      for (const item of quotas) {
        await BranchOfficeShiftQuota.create(
          {
            branchOfficeId,
            shiftId: item.shiftId,
            branchOfficeShiftQuotaRequired: item.required,
            branchOfficeShiftQuotaMinimum: item.minimum,
          },
          { client: trx }
        )
      }
    })

    return this.list(branchOfficeId, businessUnitScope)
  }

  private static assertQuotaThresholds(item: BranchOfficeShiftQuotaInput, itemIndex: number) {
    if (
      item.required < 1 ||
      item.minimum < 1 ||
      item.minimum > item.required
    ) {
      throw new BranchOfficeShiftQuotaError(
        'El mínimo no puede superar la plantilla requerida y ambos deben ser al menos 1',
        BRANCH_OFFICE_SHIFT_QUOTA_ERROR_CODES.INVALID_QUOTA,
        422,
        'cuota-invalida',
        `El item ${itemIndex} (turno ${item.shiftId}): el mínimo no puede superar la plantilla requerida y ambos deben ser al menos 1`,
        { itemIndex, shiftId: item.shiftId }
      )
    }
  }

  private static async assertShiftAvailableForBranch(
    shiftId: number,
    itemIndex: number,
    businessUnitSlug: string
  ) {
    const shift = await Shift.query()
      .where('shiftId', shiftId)
      .whereNull('shift_deleted_at')
      .where('shift_temp', 0)
      .andWhereRaw('FIND_IN_SET(?, shift_business_units)', [businessUnitSlug.trim()])
      .first()

    if (!shift) {
      throw new BranchOfficeShiftQuotaError(
        'No se encontró el turno indicado para esta unidad de negocio',
        BRANCH_OFFICE_SHIFT_QUOTA_ERROR_CODES.SHIFT_NOT_FOUND,
        404,
        'turno-no-encontrado',
        `No se encontró el turno del item ${itemIndex} (id ${shiftId}) para esta unidad`,
        { itemIndex, shiftId }
      )
    }
  }

  private static async resolveBranchOffice(
    branchOfficeId: number,
    businessUnitScope: number[]
  ): Promise<BranchOffice> {
    try {
      const query = BranchOffice.query()
        .where('branchOfficeId', branchOfficeId)
        .whereNull('branch_office_deleted_at')
        .preload('businessUnit')

      if (businessUnitScope.length === 0) {
        query.whereRaw('1 = 0')
      } else {
        query.whereIn('businessUnitId', businessUnitScope)
      }

      return await query.firstOrFail()
    } catch (error) {
      const err = error as { code?: string }
      if (err?.code === 'E_ROW_NOT_FOUND') {
        throw new BranchOfficeShiftQuotaError(
          'Sucursal no encontrada o no disponible para esta instancia del sistema',
          BRANCH_OFFICE_SHIFT_QUOTA_ERROR_CODES.BRANCH_NOT_FOUND,
          404,
          'sucursal-no-encontrada',
          'Sucursal no encontrada o no disponible para esta instancia del sistema'
        )
      }
      throw error
    }
  }
}
