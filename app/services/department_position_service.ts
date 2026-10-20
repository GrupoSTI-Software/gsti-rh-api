import Department from '#models/department'
import DepartmentPosition from '#models/department_position'
import Position from '#models/position'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { I18n } from '@adonisjs/i18n'

/**
 * Resultado de comprobar que un puesto quede en un solo departamento vigente
 * de su empresa. `linkedDepartmentName` es null cuando el departamento ligado
 * es de otra empresa: el tipo impide nombrarlo.
 */
export type DepartmentPositionLinkCheck =
  | { ok: true; positionBusinessUnitId: number; positionName: string }
  | { ok: false; reason: 'position-not-found' | 'department-not-found' | 'business-unit-mismatch' }
  | {
      ok: false
      reason: 'position-linked-to-other-department'
      positionName: string
      linkedDepartmentName: string | null
    }

/** Transacción y empresa del puesto, para escribir el vínculo sin salir de la transacción. */
export interface DepartmentPositionLinkWrite {
  trx: TransactionClientContract
  businessUnitId: number
}

export default class DepartmentPositionService {
  private t: (key: string,params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  async syncCreate(
    departmentId: number,
    positionId: number,
    link?: DepartmentPositionLinkWrite
  ) {
    const newDepartmentPosition = new DepartmentPosition()
    newDepartmentPosition.departmentId = departmentId
    newDepartmentPosition.positionId = positionId
    newDepartmentPosition.departmentPositionLastSynchronizationAt = new Date()
    if (link) {
      newDepartmentPosition.useTransaction(link.trx)
      newDepartmentPosition.businessUnitId = link.businessUnitId
    }
    await newDepartmentPosition.save()
    return newDepartmentPosition
  }

  async create(departmentPosition: DepartmentPosition, link?: DepartmentPositionLinkWrite) {
    const newDepartmentPosition = new DepartmentPosition()
    newDepartmentPosition.departmentId = departmentPosition.departmentId
    newDepartmentPosition.positionId = departmentPosition.positionId
    if (link) {
      newDepartmentPosition.useTransaction(link.trx)
      newDepartmentPosition.businessUnitId = link.businessUnitId
    }
    await newDepartmentPosition.save()
    return newDepartmentPosition
  }

  async update(
    currentDepartmentPosition: DepartmentPosition,
    departmentPosition: DepartmentPosition,
    link?: DepartmentPositionLinkWrite
  ) {
    if (link) {
      currentDepartmentPosition.useTransaction(link.trx)
      currentDepartmentPosition.businessUnitId = link.businessUnitId
    }
    currentDepartmentPosition.departmentId = departmentPosition.departmentId
    currentDepartmentPosition.positionId = departmentPosition.positionId
    await currentDepartmentPosition.save()
    return currentDepartmentPosition
  }

  async delete(currentDepartmentPosition: DepartmentPosition) {
    await currentDepartmentPosition.delete()
    return currentDepartmentPosition
  }

  async show(departmentPositionId: number) {
    const departmentPosition = await DepartmentPosition.query()
      .whereNull('department_position_deleted_at')
      .where('department_position_id', departmentPositionId)
      .first()
    return departmentPosition ? departmentPosition : null
  }

  /**
   * Garantiza, con la fila del puesto bloqueada, que el puesto quede en un
   * solo departamento vigente de su misma empresa. Cuenta vínculos de
   * cualquier empresa; los retirados no cuentan.
   */
  async verifySingleDepartmentLink(
    params: {
      positionId: number
      departmentId: number
      excludeDepartmentPositionId?: number
      previousPositionId?: number
    },
    trx: TransactionClientContract
  ): Promise<DepartmentPositionLinkCheck> {
    const ids = [params.positionId]
    if (
      params.previousPositionId !== undefined &&
      params.previousPositionId !== params.positionId
    ) {
      ids.push(params.previousPositionId)
    }
    ids.sort((left, right) => left - right)

    const lockedPositions: Array<{
      position_id: number
      business_unit_id: number
      position_name: string
    }> = await trx
      .from('positions')
      .whereIn('position_id', ids)
      .whereNull('position_deleted_at')
      .orderBy('position_id')
      .forUpdate()
      .select('position_id', 'business_unit_id', 'position_name')

    const position = lockedPositions.find((row) => Number(row.position_id) === params.positionId)
    if (!position) {
      return { ok: false, reason: 'position-not-found' }
    }

    const department: { business_unit_id: number } | null = await trx
      .from('departments')
      .where('department_id', params.departmentId)
      .whereNull('department_deleted_at')
      .select('business_unit_id')
      .first()

    if (!department) {
      return { ok: false, reason: 'department-not-found' }
    }

    const positionBusinessUnitId = Number(position.business_unit_id)
    if (Number(department.business_unit_id) !== positionBusinessUnitId) {
      return { ok: false, reason: 'business-unit-mismatch' }
    }

    let otherLink = trx
      .from('department_position as dp')
      .join('departments as d', 'd.department_id', 'dp.department_id')
      .where('dp.position_id', params.positionId)
      .whereNull('dp.department_position_deleted_at')
      .whereNot('dp.department_id', params.departmentId)
      .select('d.department_name', 'd.business_unit_id')

    if (params.excludeDepartmentPositionId !== undefined) {
      otherLink = otherLink.whereNot('dp.department_position_id', params.excludeDepartmentPositionId)
    }

    const linked: { department_name: string; business_unit_id: number } | null =
      await otherLink.first()

    if (linked) {
      const sameCompany = Number(linked.business_unit_id) === positionBusinessUnitId
      return {
        ok: false,
        reason: 'position-linked-to-other-department',
        positionName: position.position_name,
        linkedDepartmentName: sameCompany ? linked.department_name : null,
      }
    }

    return {
      ok: true,
      positionBusinessUnitId,
      positionName: position.position_name,
    }
  }

  async verifyInfoExist(departmentPosition: DepartmentPosition) {
    const existDepartment = await Department.query()
      .whereNull('department_deleted_at')
      .where('department_id', departmentPosition.departmentId)
      .first()

    if (!existDepartment && departmentPosition.departmentId) {
      const entity = this.t('department')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...departmentPosition },
      }
    }

    const existPosition = await Position.query()
      .whereNull('position_deleted_at')
      .where('position_id', departmentPosition.positionId)
      .first()

    if (!existPosition && departmentPosition.positionId) {
      const entity = this.t('position')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...departmentPosition },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...departmentPosition },
    }
  }

  async verifyInfo(departmentPosition: DepartmentPosition) {
    const action = departmentPosition.departmentPositionId > 0 ? 'updated' : 'created'
    const existDepartmentPosition = await DepartmentPosition.query()
      .whereNull('department_position_deleted_at')
      .if(departmentPosition.departmentPositionId > 0, (query) => {
        query.whereNot('department_position_id', departmentPosition.departmentPositionId)
      })
      .where('department_id', departmentPosition.departmentId)
      .where('position_id', departmentPosition.positionId)
      .first()
    if (existDepartmentPosition) {
      const entity = `${this.t('relation')} ${this.t('department')} - ${this.t('position')}`
      return {
        status: 400,
        type: 'warning',
        title: this.t('the_value_of_entity_already_exists_for_another_register', { entity  }),
        message: `${this.t('entity_resource_cannot_be', { entity })} ${this.t(action)} ${this.t('because_the_relation_is_already_assigned_to_another_register')}`,
        data: { ...departmentPosition },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...departmentPosition },
    }
  }
}
