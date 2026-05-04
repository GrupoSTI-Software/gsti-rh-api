import Department from '#models/department'
import DepartmentPosition from '#models/department_position'
import Position from '#models/position'
import Role from '#models/role'
import RoleService from '#services/role_service'
import db from '@adonisjs/lucid/services/db'
import type { I18n } from '@adonisjs/i18n'

const SPECIAL_DEPARTMENT_ID = 999

function isDeptActive(active: number | null | undefined) {
  return active === 1
}

function isPositionActive(active: number | null | undefined) {
  return active === 1
}

type MoveErrorPayload = {
  status: 403 | 404 | 422
  message: string
  detail?: string
}

export default class OrgChartMoveService {
  private t: (key: string, params?: Record<string, string | number>) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  /** Slugs que en la práctica tienen acceso implícito sin fila en role_system_permission. */
  private static readonly ORG_CHART_ADMIN_SLUGS = ['root', 'super-administrador'] as const

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

  private async wouldCreateDeptCycleViaAncestor(
    movingDeptId: number,
    newParentDeptId: number
  ): Promise<boolean> {
    let current: number | null = newParentDeptId
    while (current !== null) {
      if (current === movingDeptId) {
        return true
      }
      const row = await Department.query()
        .whereNull('department_deleted_at')
        .where('department_id', current)
        .select('parent_department_id')
        .first()
      current = row?.parentDepartmentId ?? null
    }
    return false
  }

  private async wouldCreatePositionCycleViaAncestor(
    movingPositionId: number,
    newParentPositionId: number | null
  ): Promise<boolean> {
    let current: number | null = newParentPositionId
    while (current !== null) {
      if (current === movingPositionId) {
        return true
      }
      const row = await Position.query()
        .whereNull('position_deleted_at')
        .where('position_id', current)
        .select('parent_position_id')
        .first()
      current = row?.parentPositionId ?? null
    }
    return false
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
  ): Promise<{ ok: true; department: Department } | { ok: false; payload: MoveErrorPayload }> {
    if (departmentId === parentDepartmentId) {
      return {
        ok: false,
        payload: {
          status: 422,
          message: this.t('org_chart_move_department_self_parent'),
          detail: this.t('org_chart_move_department_self_parent_detail'),
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
          message: this.t('org_chart_move_department_invalid_special'),
          detail: this.t('org_chart_move_department_invalid_special_detail'),
        },
      }
    }

    const movingDept = await Department.query()
      .whereNull('department_deleted_at')
      .where('department_id', departmentId)
      .first()

    if (!movingDept) {
      return {
        ok: false,
        payload: {
          status: 404,
          message: this.t('entity_was_not_found_with_entered_id', { entity: this.t('department') }),
        },
      }
    }

    if (movingDept.parentDepartmentId === null) {
      return {
        ok: false,
        payload: {
          status: 422,
          message: this.t('org_chart_move_department_root_locked'),
          detail: this.t('org_chart_move_department_root_locked_detail'),
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
          message: this.t('org_chart_move_parent_department_not_found'),
        },
      }
    }

    if (!isDeptActive(parentDept.departmentActive)) {
      return {
        ok: false,
        payload: {
          status: 422,
          message: this.t('org_chart_move_department_parent_inactive'),
          detail: this.t('org_chart_move_department_parent_inactive_detail'),
        },
      }
    }

    if (movingDept.businessUnitId !== parentDept.businessUnitId) {
      return {
        ok: false,
        payload: {
          status: 422,
          message: this.t('org_chart_move_department_business_unit'),
          detail: this.t('org_chart_move_department_business_unit_detail'),
        },
      }
    }

    const cycles = await this.wouldCreateDeptCycleViaAncestor(
      departmentId,
      parentDepartmentId
    )
    if (cycles) {
      return {
        ok: false,
        payload: {
          status: 422,
          message: this.t('org_chart_move_department_cycle_message'),
          detail: this.t('org_chart_move_department_cycle_detail'),
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
  ): Promise<{ ok: true; position: Position } | { ok: false; payload: MoveErrorPayload }> {
    if (parentPositionId !== null && parentPositionId === positionId) {
      return {
        ok: false,
        payload: {
          status: 422,
          message: this.t('org_chart_move_position_self_parent'),
          detail: this.t('org_chart_move_position_self_parent_detail'),
        },
      }
    }

    if (departmentId === null || departmentId === undefined) {
      return {
        ok: false,
        payload: {
          status: 422,
          message: this.t('org_chart_move_position_department_required'),
          detail: this.t('org_chart_move_position_department_required_detail'),
        },
      }
    }

    if (departmentId === SPECIAL_DEPARTMENT_ID) {
      return {
        ok: false,
        payload: {
          status: 422,
          message: this.t('org_chart_move_department_invalid_special'),
          detail: this.t('org_chart_move_position_invalid_department_special_detail'),
        },
      }
    }

    const moving = await Position.query()
      .whereNull('position_deleted_at')
      .where('position_id', positionId)
      .first()

    if (!moving) {
      return {
        ok: false,
        payload: {
          status: 404,
          message: this.t('entity_was_not_found_with_entered_id', { entity: this.t('position') }),
        },
      }
    }

    const targetDept = await Department.query()
      .whereNull('department_deleted_at')
      .where('department_id', departmentId)
      .first()

    if (!targetDept) {
      return {
        ok: false,
        payload: {
          status: 404,
          message: this.t('entity_was_not_found_with_entered_id', { entity: this.t('department') }),
        },
      }
    }

    if (!isDeptActive(targetDept.departmentActive)) {
      return {
        ok: false,
        payload: {
          status: 422,
          message: this.t('org_chart_move_department_parent_inactive'),
          detail: this.t('org_chart_move_position_department_inactive_detail'),
        },
      }
    }

    if (moving.businessUnitId !== targetDept.businessUnitId) {
      return {
        ok: false,
        payload: {
          status: 422,
          message: this.t('org_chart_move_department_business_unit'),
          detail: this.t('org_chart_move_position_business_unit_detail'),
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
            message: this.t('org_chart_move_parent_position_not_found'),
          },
        }
      }

      if (!isPositionActive(parentPos.positionActive)) {
        return {
          ok: false,
          payload: {
            status: 422,
            message: this.t('org_chart_move_position_parent_inactive'),
            detail: this.t('org_chart_move_position_parent_inactive_detail'),
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
            message: this.t('org_chart_move_position_parent_not_in_department'),
            detail: this.t('org_chart_move_position_parent_not_in_department_detail'),
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
            message: this.t('org_chart_move_department_parent_inactive'),
            detail: this.t('org_chart_move_position_parent_dept_detail'),
          },
        }
      }

      // Coherencia: el destino efectivo es el departamento donde está enlazado el puesto padre
      resolvedDepartmentId = parentDeptLink.departmentId
      resolvedParentPositionId = parentPositionId

      if (moving.businessUnitId !== parentDept.businessUnitId) {
        return {
          ok: false,
          payload: {
            status: 422,
            message: this.t('org_chart_move_department_business_unit'),
            detail: this.t('org_chart_move_position_parent_bu_detail'),
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
          message: this.t('org_chart_move_position_no_department_link'),
          detail: this.t('org_chart_move_position_no_department_link_detail'),
        },
      }
    }

    const cycle = await this.wouldCreatePositionCycleViaAncestor(
      positionId,
      resolvedParentPositionId ?? null
    )
    if (cycle) {
      return {
        ok: false,
        payload: {
          status: 422,
          message: this.t('org_chart_move_position_cycle_message'),
          detail: this.t('org_chart_move_position_cycle_detail'),
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
