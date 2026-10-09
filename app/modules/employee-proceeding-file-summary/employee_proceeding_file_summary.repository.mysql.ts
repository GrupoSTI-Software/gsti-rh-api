import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { EMPLOYEE_PROCEEDING_FILE_AREA } from './employee_proceeding_file_summary.constants.js'
import type {
  EmployeeProceedingFileCountParams,
  EmployeeProceedingFileCountRecord,
  EmployeeProceedingFileSummaryRepository,
  EmployeeProceedingFileSummaryScope,
  EmployeeProceedingFolderRecord,
} from './employee_proceeding_file_summary.repository.js'

interface FolderRow {
  proceeding_file_type_id: number
  parent_id: number | null
  is_exclusive: number | boolean
  assigned_to_employee: number | string
}

interface FileCountRow {
  proceeding_file_type_id: number
  documents: number | string
  expiring_or_expired: number | string | null
}

/** Placeholders `?, ?, ?` para un `IN (...)` en SQL crudo. */
function placeholders(values: readonly unknown[]): string {
  return values.map(() => '?').join(', ')
}

/**
 * Límite superior exclusivo de la ventana: el día siguiente al horizonte. La
 * columna es TIMESTAMP, así que un vencimiento con hora del último día queda
 * dentro.
 */
function dayAfter(horizon: string): string {
  return DateTime.fromISO(horizon).plus({ days: 1 }).toISODate()!
}

/**
 * Implementación MySQL. Como `db.from()` y `db.rawQuery()` no pasan por el
 * mixin `withBusinessUnitScope`, el corte por empresa es explícito
 * (`businessUnitIds`) y falla cerrado: sin unidades, sin resultados.
 */
export default class EmployeeProceedingFileSummaryRepositoryMysql
  implements EmployeeProceedingFileSummaryRepository
{
  /**
   * Mismo criterio que `EmployeeService.show` en `GET /employees/:id/proceeding-files`:
   * el empleado dado de baja conserva su expediente.
   */
  async employeeExists(scope: EmployeeProceedingFileSummaryScope): Promise<boolean> {
    if (scope.businessUnitIds.length === 0) return false

    const row = await db
      .from('employees')
      .where('employee_id', scope.employeeId)
      .whereIn('business_unit_id', [...scope.businessUnitIds])
      .select('employee_id')
      .first()

    return row !== null
  }

  /**
   * Mismo árbol que `ProceedingFileTypeService.indexByArea('employee')`: raíces
   * del área cuyo `proceeding_file_type_business_units` contiene el slug de
   * una unidad activa del scope, más todos sus descendientes vivos (los hijos
   * no se filtran por área ni por unidad, igual que el preload de `children`).
   * `UNION` (no `UNION ALL`) corta la recursión si un `parent_id` formara ciclo.
   */
  async findFolders(
    scope: EmployeeProceedingFileSummaryScope
  ): Promise<EmployeeProceedingFolderRecord[]> {
    if (scope.businessUnitIds.length === 0) return []

    const businessUnitIds = [...scope.businessUnitIds]
    const sql = `
WITH RECURSIVE folder_tree AS (
  SELECT pft.proceeding_file_type_id, pft.parent_id, pft.proceeding_file_type_is_exclusive
  FROM proceeding_file_types pft
  WHERE pft.proceeding_file_type_deleted_at IS NULL
    AND pft.parent_id IS NULL
    AND pft.proceeding_file_type_area_to_use = ?
    AND pft.proceeding_file_type_business_units IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM business_units bu
      WHERE bu.business_unit_id IN (${placeholders(businessUnitIds)})
        AND bu.business_unit_active = 1
        AND FIND_IN_SET(bu.business_unit_slug, pft.proceeding_file_type_business_units)
    )
  UNION
  SELECT child.proceeding_file_type_id, child.parent_id, child.proceeding_file_type_is_exclusive
  FROM proceeding_file_types child
  INNER JOIN folder_tree parent ON child.parent_id = parent.proceeding_file_type_id
  WHERE child.proceeding_file_type_deleted_at IS NULL
)
SELECT
  ft.proceeding_file_type_id,
  ft.parent_id,
  ft.proceeding_file_type_is_exclusive AS is_exclusive,
  EXISTS (
    SELECT 1 FROM employee_proceeding_files_types epft
    WHERE epft.proceeding_file_type_id = ft.proceeding_file_type_id
      AND epft.employee_id = ?
      AND epft.employee_proceeding_file_type_deleted_at IS NULL
      AND epft.business_unit_id IN (${placeholders(businessUnitIds)})
  ) AS assigned_to_employee
FROM folder_tree ft`

    const result = await db.rawQuery(sql, [
      EMPLOYEE_PROCEEDING_FILE_AREA,
      ...businessUnitIds,
      scope.employeeId,
      ...businessUnitIds,
    ])
    const rows: FolderRow[] = result[0]

    return rows.map((row) => ({
      proceedingFileTypeId: Number(row.proceeding_file_type_id),
      parentId: row.parent_id === null ? null : Number(row.parent_id),
      isExclusive: Boolean(Number(row.is_exclusive)),
      assignedToEmployee: Number(row.assigned_to_employee) === 1,
    }))
  }

  /**
   * Un `GROUP BY` por carpeta. `documents` cuenta lo mismo que lista
   * `GET /employees/:id/proceeding-files` (sin filtrar por `proceeding_file_active`);
   * `expiring_or_expired` sigue el criterio de vencimientos del expediente
   * (`EmployeeProceedingFileService.getExpiredAndExpiring`): solo archivos activos.
   */
  async countFilesByFolder(
    params: EmployeeProceedingFileCountParams
  ): Promise<EmployeeProceedingFileCountRecord[]> {
    if (params.businessUnitIds.length === 0) return []

    const rows: FileCountRow[] = await db
      .from('employee_proceeding_files as epf')
      .join('proceeding_files as pf', 'pf.proceeding_file_id', 'epf.proceeding_file_id')
      .where('epf.employee_id', params.employeeId)
      .whereIn('epf.business_unit_id', [...params.businessUnitIds])
      .whereNull('epf.employee_proceeding_file_deleted_at')
      .whereNull('pf.proceeding_file_deleted_at')
      .groupBy('pf.proceeding_file_type_id')
      .select('pf.proceeding_file_type_id')
      .select(db.raw('COUNT(*) AS documents'))
      .select(
        db.raw(
          `SUM(CASE WHEN pf.proceeding_file_active = 1
                     AND pf.proceeding_file_expiration_at IS NOT NULL
                     AND pf.proceeding_file_expiration_at < ?
                THEN 1 ELSE 0 END) AS expiring_or_expired`,
          [dayAfter(params.horizon)]
        )
      )

    return rows.map((row) => ({
      proceedingFileTypeId: Number(row.proceeding_file_type_id),
      documents: Number(row.documents),
      expiringOrExpired: Number(row.expiring_or_expired ?? 0),
    }))
  }

  /** Mismo criterio que `EmployeeService.getContracts`. */
  async countContracts(scope: EmployeeProceedingFileSummaryScope): Promise<number> {
    if (scope.businessUnitIds.length === 0) return 0

    const row: { total: number | string } | null = await db
      .from('employee_contracts')
      .where('employee_id', scope.employeeId)
      .whereIn('business_unit_id', [...scope.businessUnitIds])
      .whereNull('employee_contract_deleted_at')
      .count('* as total')
      .first()

    return Number(row?.total ?? 0)
  }
}
