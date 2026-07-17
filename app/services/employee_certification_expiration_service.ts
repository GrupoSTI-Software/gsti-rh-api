import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { TenantContext } from '#utils/tenant_context'

export type EmployeeCertificationListRow = {
  employeeCertificationId: number
  employee: {
    employeeId: number
    fullName: string
    employeeCode: string | number
    positionName: string | null
  }
  certification: {
    certificationId: number
    name: string
    category: { id: number; name: string } | null
  }
  compliedAt: string
  expiresAt: string | null
  daysToExpire: number | null
}

export type EmployeeCertificationListMeta = {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
}

export type EmployeeCertificationExpirationRow = {
  employeeCertificationId: number
  employee: {
    employeeId: number
    fullName: string
    employeeCode: string | number
    positionName: string | null
  }
  certification: {
    certificationId: number
    name: string
    category: { id: number; name: string } | null
  }
  compliedAt: string
  expiresAt: string
  daysToExpire: number
}

/**
 * USRH1783821206584 — este servicio consulta con `db.from()` (knex crudo), por
 * lo que el mixin `withBusinessUnitScope()` de los modelos Lucid no aplica
 * aquí (no hay hooks de modelo en una query builder cruda). El reporte de
 * vencimientos cruza TODOS los empleados por diseño, así que hay que acotarlo
 * manualmente a la unidad activa — mismo criterio fail-closed que el mixin:
 * sin contexto activo → sin filtro (batch/tests sin middleware); contexto
 * bypassed → sin filtro (root); scope vacío + activo → sin resultados; scope
 * con ids → `whereIn`.
 */
function applyTenantFilterToEmployeeAlias(
  query: { whereIn: (col: string, ids: number[]) => any; whereRaw: (sql: string) => any },
  column: string = 'e.business_unit_id'
): void {
  if (!TenantContext.isActive()) return
  if (TenantContext.isBypassed()) return

  const scope = TenantContext.getScope()
  if (scope.length === 0) {
    query.whereRaw('1 = 0')
    return
  }

  query.whereIn(column, scope)
}

export default class EmployeeCertificationExpirationService {
  /**
   * Listado paginado de todos los cumplimientos activos,
   * ordenado por employee_certification_expires_at ASC (nulos al final),
   * luego por fecha de cumplimiento DESC.
   *
   * Filtros opcionales: employeeId, certificationId, categoryId.
   */
  async listPaginated(
    page: number = 1,
    limit: number = 25,
    filters: {
      employeeId?: number
      certificationId?: number
      categoryId?: number
    } = {}
  ): Promise<{ meta: EmployeeCertificationListMeta; data: EmployeeCertificationListRow[] }> {
    const safeLimit = Math.min(Math.max(limit, 1), 500)
    const safePage = Math.max(page, 1)
    const offset = (safePage - 1) * safeLimit

    const base = db
      .from('employee_certifications as ec')
      .whereNull('ec.employee_certification_deleted_at')
      .join('employees as e', 'e.employee_id', 'ec.employee_id')
      .whereNull('e.employee_deleted_at')
      .join('certifications as c', 'c.certification_id', 'ec.certification_id')
      .leftJoin(
        'certification_categories as cc',
        'cc.certification_category_id',
        'c.category_id'
      )
      .leftJoin('positions as p', function (q) {
        q.on('p.position_id', '=', 'e.position_id').andOnNull('p.position_deleted_at')
      })

    applyTenantFilterToEmployeeAlias(base)

    if (filters.employeeId) {
      base.where('ec.employee_id', filters.employeeId)
    }
    if (filters.certificationId) {
      base.where('ec.certification_id', filters.certificationId)
    }
    if (filters.categoryId) {
      base.where('c.category_id', filters.categoryId)
    }

    // Conteo total
    const countResult = await base.clone().count('ec.employee_certification_id as total').first()
    const total = Number((countResult as any)?.total ?? 0)
    const lastPage = Math.max(1, Math.ceil(total / safeLimit))

    // Datos paginados
    const rows = await base
      .clone()
      .select(
        'ec.employee_certification_id',
        'ec.employee_certification_complied_at as complied_at',
        'ec.employee_certification_expires_at as expires_at',
        'e.employee_id',
        'e.employee_first_name',
        'e.employee_last_name',
        'e.employee_second_last_name',
        'e.employee_code',
        'c.certification_id',
        'c.certification_name',
        'cc.certification_category_id as category_id',
        'cc.certification_category_name as category_name',
        'p.position_name'
      )
      .orderByRaw('ec.employee_certification_expires_at IS NULL ASC')
      .orderBy('ec.employee_certification_expires_at', 'asc')
      .orderBy('ec.employee_certification_complied_at', 'desc')
      .limit(safeLimit)
      .offset(offset)

    const today = DateTime.now().startOf('day')

    const data: EmployeeCertificationListRow[] = rows.map((r: any) => {
      const firstName = r.employee_first_name ?? ''
      const lastName = r.employee_last_name ?? ''
      const secondLastName = r.employee_second_last_name ? ` ${r.employee_second_last_name}` : ''
      const fullName = `${firstName} ${lastName}${secondLastName}`.trim()

      const expiresAt = r.expires_at
        ? DateTime.fromJSDate(new Date(r.expires_at)).startOf('day')
        : null

      const daysToExpire = expiresAt
        ? Math.floor(expiresAt.diff(today, 'days').days)
        : null

      return {
        employeeCertificationId: r.employee_certification_id,
        employee: {
          employeeId: r.employee_id,
          fullName,
          employeeCode: r.employee_code,
          positionName: r.position_name ?? null,
        },
        certification: {
          certificationId: r.certification_id,
          name: r.certification_name,
          category: r.category_id ? { id: r.category_id, name: r.category_name } : null,
        },
        compliedAt: r.complied_at
          ? DateTime.fromJSDate(new Date(r.complied_at)).toISODate()!
          : '',
        expiresAt: expiresAt ? expiresAt.toISODate()! : null,
        daysToExpire,
      }
    })

    return {
      meta: { total, perPage: safeLimit, currentPage: safePage, lastPage },
      data,
    }
  }


  /**
   * Devuelve las certificaciones de empleados que vencen en los próximos 30 días
   * (incluyendo las que vencen hoy). Toma solo el cumplimiento más reciente
   * no borrado por par (employee_id, certification_id).
   *
   * Ordenado por daysToExpire ascendente (más urgentes primero).
   */
  async getExpiredAndExpiring(): Promise<EmployeeCertificationExpirationRow[]> {
    const today = DateTime.now().startOf('day')
    const dateEnd = today.plus({ days: 30 }).toFormat('yyyy-MM-dd')

    /*
     * Subconsulta: por cada par (employee_id, certification_id),
     * obtener el employee_certification_id más reciente no borrado.
     */
    const latestIds = db
      .from('employee_certifications as ec_inner')
      .whereNull('ec_inner.employee_certification_deleted_at')
      .whereNotNull('ec_inner.employee_certification_expires_at')
      .groupBy('ec_inner.employee_id', 'ec_inner.certification_id')
      .select(db.raw('MAX(ec_inner.employee_certification_id)'))

    const expiringQuery = db
      .from('employee_certifications as ec')
      .whereIn('ec.employee_certification_id', latestIds)
      .where('ec.employee_certification_expires_at', '<=', dateEnd)
      .whereNull('ec.employee_certification_deleted_at')
      .join('employees as e', 'e.employee_id', 'ec.employee_id')
      .whereNull('e.employee_deleted_at')
      .join('certifications as c', 'c.certification_id', 'ec.certification_id')
      .leftJoin(
        'certification_categories as cc',
        'cc.certification_category_id',
        'c.category_id'
      )
      .leftJoin('positions as p', 'p.position_id', 'e.position_id')
      .whereNull('p.position_deleted_at')

    applyTenantFilterToEmployeeAlias(expiringQuery)

    const rows = await expiringQuery
      .select(
        'ec.employee_certification_id',
        'ec.employee_certification_complied_at as complied_at',
        'ec.employee_certification_expires_at as expires_at',
        'e.employee_id',
        'e.employee_first_name',
        'e.employee_last_name',
        'e.employee_second_last_name',
        'e.employee_code',
        'c.certification_id',
        'c.certification_name',
        'cc.certification_category_id as category_id',
        'cc.certification_category_name as category_name',
        'p.position_name',
        db.raw(
          'DATEDIFF(ec.employee_certification_expires_at, CURDATE()) as days_to_expire'
        )
      )
      .orderBy('days_to_expire', 'asc')
      .orderBy('e.employee_last_name', 'asc')

    return rows.map((r: any): EmployeeCertificationExpirationRow => {
      const firstName = r.employee_first_name ?? ''
      const lastName = r.employee_last_name ?? ''
      const secondLastName = r.employee_second_last_name ? ` ${r.employee_second_last_name}` : ''
      const fullName = `${firstName} ${lastName}${secondLastName}`.trim()

      return {
        employeeCertificationId: r.employee_certification_id,
        employee: {
          employeeId: r.employee_id,
          fullName,
          employeeCode: r.employee_code,
          positionName: r.position_name ?? null,
        },
        certification: {
          certificationId: r.certification_id,
          name: r.certification_name,
          category:
            r.category_id
              ? { id: r.category_id, name: r.category_name }
              : null,
        },
        compliedAt: r.complied_at
          ? DateTime.fromJSDate(new Date(r.complied_at)).toISODate()!
          : '',
        expiresAt: DateTime.fromJSDate(new Date(r.expires_at)).toISODate()!,
        daysToExpire: Number(r.days_to_expire),
      }
    })
  }
}
