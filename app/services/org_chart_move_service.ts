import Department from '#models/department'
import DepartmentPosition from '#models/department_position'
import Position from '#models/position'
import Role from '#models/role'
import RoleService from '#services/role_service'
import { wouldCreateHierarchyCycleFetchingParent } from '#utils/tree_validator'
import db from '@adonisjs/lucid/services/db'
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

  private async collectPositionSubtree(positionId: number): Promise<number[]> {
    const gathered: number[] = [positionId]
    let frontier = [positionId]

    while (frontier.length > 0) {
      const nextFrontier: number[] = []
      const children = await Position.query()
        .whereNull('position_deleted_at')
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
  ): Promise<{ ok: true; position: Position } | { ok: false; payload: OrgChartMoveErrorPayload }> {
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

    const subtreeIds = await this.collectPositionSubtree(positionId)

    await db.transaction(async (trx) => {
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

      await DepartmentPosition.query({ client: trx })
        .whereNull('department_position_deleted_at')
        .whereIn('position_id', subtreeIds)
        .update({ departmentId: resolvedDepartmentId })
    })

    await moving.refresh()
    return { ok: true, position: moving }
  }
}
