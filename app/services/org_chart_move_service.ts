import Department from '#models/department'
import DepartmentPosition from '#models/department_position'
import Position from '#models/position'
import Role from '#models/role'
import RoleService from '#services/role_service'
import { wouldCreateHierarchyCycleFetchingParent } from '#utils/tree_validator'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import logger from '@adonisjs/core/services/logger'
import type { I18n } from '@adonisjs/i18n'

export const SPECIAL_DEPARTMENT_ID = 999

function isDeptActive(active: number | null | undefined) {
  return active === 1
}

function isPositionActive(active: number | null | undefined) {
  return active === 1
}

/** Respuesta estándar de error en movimientos de organigrama (title, detail, key). */
export type OrgChartMoveErrorPayload = {
  status: number
  title: string
  message: string
  detail?: string
  key?: string
}

/** El conteo solo existe cuando el movimiento se confirmó. */
export type OrgChartRelocatePositionResult =
  | { ok: true; position: Position; employeesRelocated: number }
  | { ok: false; payload: OrgChartMoveErrorPayload }

export default class OrgChartMoveService {
  private t: (key: string, params?: Record<string, string | number>) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  /**
   * Slugs que en la práctica tienen acceso implícito sin fila en role_system_permission.
   * `owner` (USRH1783712837561) se agrega junto a `super-administrador` para que el
   * dueño de una cuenta self-service no quede con menos acceso del que ya tenía la
   * cuenta recién registrada antes de esta HU.
   */
  private static readonly ORG_CHART_ADMIN_SLUGS = ['root', 'super-administrador', 'owner'] as const

  async assertCanUpdateOrganizationChart(roleId: number | null | undefined): Promise<boolean> {
    if (!roleId) {
      return false
    }

    const role = await Role.query().whereNull('role_deleted_at').where('role_id', roleId).first()
    if (!role) {
      return false
    }

    if (OrgChartMoveService.ORG_CHART_ADMIN_SLUGS.some((slug) => slug === role.roleSlug)) {
      return true
    }

    const roleService = new RoleService()
    return roleService.hasAccess(roleId, 'organization-chart', 'update')
  }

  private async fetchDepartmentParentDepartmentId(id: number): Promise<number | null> {
    const row = await Department.query()
      .whereNull('department_deleted_at')
      .where('department_id', id)
      .select('parent_department_id')
      .first()
    return row?.parentDepartmentId ?? null
  }

  private async fetchPositionParentPositionId(id: number): Promise<number | null> {
    const row = await Position.query()
      .whereNull('position_deleted_at')
      .where('position_id', id)
      .select('parent_position_id')
      .first()
    return row?.parentPositionId ?? null
  }

  private async collectPositionSubtree(
    positionId: number,
    businessUnitId: number,
    client: TransactionClientContract
  ): Promise<number[]> {
    const gathered: number[] = [positionId]
    let frontier = [positionId]

    while (frontier.length > 0) {
      const nextFrontier: number[] = []
      const children = await Position.query({ client })
        .whereNull('position_deleted_at')
        .where('business_unit_id', businessUnitId)
        .whereIn('parent_position_id', frontier)

      for (const child of children) {
        if (!gathered.includes(child.positionId)) {
          gathered.push(child.positionId)
          nextFrontier.push(child.positionId)
        }
      }
      frontier = nextFrontier
    }

    return gathered
  }

  /**
   * Reparenta departamento (validaciones jerárquicas + persistencia). Usado por PUT y PATCH.
   */
  async relocateDepartment(
    departmentId: number,
    parentDepartmentId: number
  ): Promise<
    { ok: true; department: Department } | { ok: false; payload: OrgChartMoveErrorPayload }
  > {
    const hierarchyTitle = this.t('org_chart_hierarchy_invalid_title')

    if (departmentId === parentDepartmentId) {
      return {
        ok: false,
        payload: {
          status: 400,
          title: hierarchyTitle,
          message: hierarchyTitle,
          detail: this.t('org_chart_hierarchy_cycle_detail_departments'),
          key: 'jerarquia-ciclo',
        },
      }
    }

    if (
      departmentId === SPECIAL_DEPARTMENT_ID ||
      parentDepartmentId === SPECIAL_DEPARTMENT_ID
    ) {
      return {
        ok: false,
        payload: {
          status: 422,
          title: hierarchyTitle,
          message: this.t('org_chart_move_department_invalid_special'),
          detail: this.t('org_chart_move_department_invalid_special_detail'),
          key: 'departamento-sistema-invalido',
        },
      }
    }

    const movingDept = await Department.query()
      .whereNull('department_deleted_at')
      .where('department_id', departmentId)
      .first()

    if (!movingDept) {
      const entity = this.t('department')
      return {
        ok: false,
        payload: {
          status: 404,
          title: this.t('entity_was_not_found', { entity }),
          message: this.t('entity_was_not_found_with_entered_id', { entity }),
        },
      }
    }

    const parentDept = await Department.query()
      .whereNull('department_deleted_at')
      .where('department_id', parentDepartmentId)
      .first()

    if (!parentDept) {
      return {
        ok: false,
        payload: {
          status: 404,
          title: this.t('org_chart_parent_department_missing_title'),
          message: this.t('org_chart_parent_department_missing_title'),
          detail: this.t('org_chart_parent_department_missing_detail'),
          key: 'padre-no-encontrado',
        },
      }
    }

    if (!isDeptActive(parentDept.departmentActive)) {
      return {
        ok: false,
        payload: {
          status: 422,
          title: this.t('org_chart_parent_inactive_title'),
          message: this.t('org_chart_parent_department_inactive_message'),
          detail: this.t('org_chart_move_department_parent_inactive_detail'),
          key: 'padre-inactivo',
        },
      }
    }

    if (movingDept.businessUnitId !== parentDept.businessUnitId) {
      return {
        ok: false,
        payload: {
          status: 422,
          title: this.t('org_chart_scope_mismatch_title'),
          message: this.t('org_chart_move_department_business_unit'),
          detail: this.t('org_chart_move_department_business_unit_detail'),
          key: 'alcance-organizacional',
        },
      }
    }

    if (
      movingDept.companyId !== null &&
      parentDept.companyId !== null &&
      movingDept.companyId !== parentDept.companyId
    ) {
      return {
        ok: false,
        payload: {
          status: 422,
          title: this.t('org_chart_scope_mismatch_title'),
          message: this.t('org_chart_department_company_mismatch_message'),
          detail: this.t('org_chart_department_company_mismatch_detail'),
          key: 'alcance-organizacional',
        },
      }
    }

    const cycles = await wouldCreateHierarchyCycleFetchingParent({
      nodeId: departmentId,
      proposedParentId: parentDepartmentId,
      fetchParentOf: async (id) => this.fetchDepartmentParentDepartmentId(id),
    })
    if (cycles) {
      return {
        ok: false,
        payload: {
          status: 400,
          title: hierarchyTitle,
          message: hierarchyTitle,
          detail: this.t('org_chart_hierarchy_cycle_detail_departments'),
          key: 'jerarquia-ciclo',
        },
      }
    }

    await db.transaction(async (trx) => {
      movingDept.useTransaction(trx)
      movingDept.parentDepartmentId = parentDepartmentId
      await movingDept.save()
    })

    await movingDept.refresh()
    return { ok: true, department: movingDept }
  }

  /**
   * Reparenta un puesto y pivotes de departamento para el subárbol.
   */
  async relocatePosition(
    positionId: number,
    parentPositionId: number | null,
    departmentId: number | null
  ): Promise<OrgChartRelocatePositionResult> {
    const hierarchyTitle = this.t('org_chart_hierarchy_invalid_title')

    if (parentPositionId !== null && parentPositionId === positionId) {
      return {
        ok: false,
        payload: {
          status: 400,
          title: hierarchyTitle,
          message: hierarchyTitle,
          detail: this.t('org_chart_hierarchy_cycle_detail_positions'),
          key: 'jerarquia-ciclo',
        },
      }
    }

    if (departmentId === null || departmentId === undefined) {
      return {
        ok: false,
        payload: {
          status: 422,
          title: hierarchyTitle,
          message: this.t('org_chart_move_position_department_required'),
          detail: this.t('org_chart_move_position_department_required_detail'),
          key: 'departamento-requerido-organigrama',
        },
      }
    }

    if (departmentId === SPECIAL_DEPARTMENT_ID) {
      return {
        ok: false,
        payload: {
          status: 422,
          title: hierarchyTitle,
          message: this.t('org_chart_move_department_invalid_special'),
          detail: this.t('org_chart_move_position_invalid_department_special_detail'),
          key: 'departamento-sistema-invalido',
        },
      }
    }

    const moving = await Position.query()
      .whereNull('position_deleted_at')
      .where('position_id', positionId)
      .first()

    if (!moving) {
      const entity = this.t('position')
      return {
        ok: false,
        payload: {
          status: 404,
          title: this.t('entity_was_not_found', { entity }),
          message: this.t('entity_was_not_found_with_entered_id', { entity }),
        },
      }
    }

    const targetDept = await Department.query()
      .whereNull('department_deleted_at')
      .where('department_id', departmentId)
      .first()

    if (!targetDept) {
      const entity = this.t('department')
      return {
        ok: false,
        payload: {
          status: 404,
          title: this.t('entity_was_not_found', { entity }),
          message: this.t('entity_was_not_found_with_entered_id', { entity }),
        },
      }
    }

    if (!isDeptActive(targetDept.departmentActive)) {
      return {
        ok: false,
        payload: {
          status: 422,
          title: this.t('org_chart_parent_inactive_title'),
          message: this.t('org_chart_move_department_parent_inactive'),
          detail: this.t('org_chart_move_position_department_inactive_detail'),
          key: 'padre-inactivo',
        },
      }
    }

    if (moving.businessUnitId !== targetDept.businessUnitId) {
      return {
        ok: false,
        payload: {
          status: 422,
          title: this.t('org_chart_scope_mismatch_title'),
          message: this.t('org_chart_move_department_business_unit'),
          detail: this.t('org_chart_move_position_business_unit_detail'),
          key: 'alcance-organizacional',
        },
      }
    }

    if (
      moving.companyId !== null &&
      targetDept.companyId !== null &&
      moving.companyId !== targetDept.companyId
    ) {
      return {
        ok: false,
        payload: {
          status: 422,
          title: this.t('org_chart_scope_mismatch_title'),
          message: this.t('org_chart_position_company_mismatch_message'),
          detail: this.t('org_chart_position_company_mismatch_detail'),
          key: 'alcance-organizacional',
        },
      }
    }

    let resolvedDepartmentId = departmentId
    let resolvedParentPositionId = parentPositionId

    if (parentPositionId !== null) {
      const parentPos = await Position.query()
        .whereNull('position_deleted_at')
        .where('position_id', parentPositionId)
        .first()

      if (!parentPos) {
        return {
          ok: false,
          payload: {
            status: 404,
            title: this.t('org_chart_parent_position_missing_title'),
            message: this.t('org_chart_parent_position_missing_title'),
            detail: this.t('org_chart_parent_position_missing_detail'),
            key: 'padre-no-encontrado',
          },
        }
      }

      if (!isPositionActive(parentPos.positionActive)) {
        return {
          ok: false,
          payload: {
            status: 422,
            title: this.t('org_chart_parent_inactive_title'),
            message: this.t('org_chart_move_position_parent_inactive'),
            detail: this.t('org_chart_move_position_parent_inactive_detail'),
            key: 'padre-inactivo',
          },
        }
      }

      const parentDeptLink = await DepartmentPosition.query()
        .whereNull('department_position_deleted_at')
        .where('position_id', parentPositionId)
        .first()

      if (!parentDeptLink) {
        return {
          ok: false,
          payload: {
            status: 404,
            title: this.t('org_chart_parent_position_missing_title'),
            message: this.t('org_chart_move_position_parent_not_in_department'),
            detail: this.t('org_chart_move_position_parent_not_in_department_detail'),
            key: 'padre-no-encontrado',
          },
        }
      }

      const parentDept = await Department.query()
        .whereNull('department_deleted_at')
        .where('department_id', parentDeptLink.departmentId)
        .first()

      if (!parentDept || !isDeptActive(parentDept.departmentActive)) {
        return {
          ok: false,
          payload: {
            status: 422,
            title: this.t('org_chart_parent_inactive_title'),
            message: this.t('org_chart_move_department_parent_inactive'),
            detail: this.t('org_chart_move_position_parent_dept_detail'),
            key: 'padre-inactivo',
          },
        }
      }

      // Coherencia: el departamento efectivo es el donde está enlazado el puesto padre
      resolvedDepartmentId = parentDeptLink.departmentId
      resolvedParentPositionId = parentPositionId

      if (moving.businessUnitId !== parentDept.businessUnitId) {
        return {
          ok: false,
          payload: {
            status: 422,
            title: this.t('org_chart_scope_mismatch_title'),
            message: this.t('org_chart_move_department_business_unit'),
            detail: this.t('org_chart_move_position_parent_bu_detail'),
            key: 'alcance-organizacional',
          },
        }
      }

      if (
        moving.companyId !== null &&
        parentDept.companyId !== null &&
        moving.companyId !== parentDept.companyId
      ) {
        return {
          ok: false,
          payload: {
            status: 422,
            title: this.t('org_chart_scope_mismatch_title'),
            message: this.t('org_chart_position_company_mismatch_message'),
            detail: this.t('org_chart_position_parent_company_mismatch_detail'),
            key: 'alcance-organizacional',
          },
        }
      }

      if (departmentId !== resolvedDepartmentId) {
        return {
          ok: false,
          payload: {
            status: 422,
            title: this.t('org_chart_position_department_consistency_title'),
            message: this.t('org_chart_position_department_consistency_message'),
            detail: this.t('org_chart_position_department_consistency_detail'),
            key: 'consistencia-puesto-departamento',
          },
        }
      }
    }

    const existingPivotForRoot = await DepartmentPosition.query()
      .whereNull('department_position_deleted_at')
      .where('position_id', positionId)
      .first()

    if (!existingPivotForRoot) {
      return {
        ok: false,
        payload: {
          status: 422,
          title: hierarchyTitle,
          message: this.t('org_chart_move_position_no_department_link'),
          detail: this.t('org_chart_move_position_no_department_link_detail'),
          key: 'vinculo-departamento-faltante',
        },
      }
    }

    const cycle =
      resolvedParentPositionId === null
        ? false
        : await wouldCreateHierarchyCycleFetchingParent({
            nodeId: positionId,
            proposedParentId: resolvedParentPositionId,
            fetchParentOf: async (id) => this.fetchPositionParentPositionId(id),
          })
    if (cycle) {
      return {
        ok: false,
        payload: {
          status: 400,
          title: hierarchyTitle,
          message: hierarchyTitle,
          detail: this.t('org_chart_hierarchy_cycle_detail_positions'),
          key: 'jerarquia-ciclo',
        },
      }
    }

    const { employeesRelocated, linkedIds } = await db.transaction(async (trx) => {
      const subtreeIds = await this.collectPositionSubtree(positionId, moving.businessUnitId, trx)

      await trx
        .from('positions')
        .whereIn('position_id', subtreeIds)
        .orderBy('position_id', 'asc')
        .forUpdate()
        .select('position_id')

      moving.useTransaction(trx)
      moving.parentPositionId = resolvedParentPositionId

      if (resolvedParentPositionId !== null) {
        const parentRow = await Position.query({ client: trx })
          .whereNull('position_deleted_at')
          .where('position_id', resolvedParentPositionId)
          .first()
        moving.parentPositionSyncId = parentRow?.positionSyncId ?? 0
      } else {
        moving.parentPositionSyncId = 0
      }

      await moving.save()

      const linkedRows: { position_id: number }[] = await trx
        .from('department_position')
        .whereIn('position_id', subtreeIds)
        .where('business_unit_id', moving.businessUnitId)
        .whereNull('department_position_deleted_at')
        .distinct('position_id')
      const movedPositionIds = linkedRows.map((row) => Number(row.position_id))

      await DepartmentPosition.query({ client: trx })
        .whereNull('department_position_deleted_at')
        .whereIn('position_id', subtreeIds)
        .where('business_unit_id', moving.businessUnitId)
        .update({ departmentId: resolvedDepartmentId })

      const relocated = await this.relocateOccupants(trx, {
        linkedIds: movedPositionIds,
        businessUnitId: moving.businessUnitId,
        departmentId: resolvedDepartmentId,
      })
      return { employeesRelocated: relocated, linkedIds: movedPositionIds }
    })

    await moving.refresh()
    logger.info(
      {
        positionId,
        businessUnitId: moving.businessUnitId,
        departmentId: resolvedDepartmentId,
        movedPositionIds: linkedIds,
        employeesRelocated,
      },
      'organigrama: puesto movido con arrastre de empleados'
    )
    return { ok: true, position: moving, employeesRelocated }
  }

  /**
   * Pasa al departamento destino a los ocupantes vigentes de la empresa.
   * El conteo sale de las filas seleccionadas, no de las filas que reporte el UPDATE.
   */
  protected async relocateOccupants(
    trx: TransactionClientContract,
    params: { linkedIds: number[]; businessUnitId: number; departmentId: number }
  ): Promise<number> {
    if (params.linkedIds.length === 0) return 0

    const rows: { employee_id: number }[] = await trx
      .from('employees')
      .whereIn('position_id', params.linkedIds)
      .where('business_unit_id', params.businessUnitId)
      .whereNull('employee_deleted_at')
      .where((query) => {
        query.whereNot('department_id', params.departmentId).orWhereNull('department_id')
      })
      .orderBy('employee_id', 'asc')
      .forUpdate()
      .select('employee_id')

    const ids = rows.map((row) => Number(row.employee_id))
    if (ids.length > 0) {
      await trx.from('employees').whereIn('employee_id', ids).update({
        department_id: params.departmentId,
        employee_updated_at: new Date(),
      })
    }
    return ids.length
  }
}
