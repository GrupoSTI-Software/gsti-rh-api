import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import app from '@adonisjs/core/services/app'
import type { I18n } from '@adonisjs/i18n'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'

/**
 * Ids fijos del relleno histórico. Solo los usa el comando; el servicio
 * recibe los ids para que las pruebas no toquen el 999 real (R3).
 */
export const STRUCTURE_PLACEHOLDER_IDS = { departmentId: 999, positionId: 999 } as const

/** Par de registros de relleno que se retiran. */
export type PlaceholderIds = { departmentId: number; positionId: number }

/** Conteo de una referencia, por empresa. `alive` es null cuando no aplica. */
export type ReferenceCount = {
  reference: string
  businessUnitId: number | null
  total: number
  alive: number | null
}

/** Referencia que impide el borrado físico del cierre (R9). */
export type BlockingReference = {
  table: string
  column: string
  businessUnitId: number | null
  total: number
}

/** Opciones de un modo que puede escribir (R2, R6). */
export type RetirementOptions = {
  dryRun: boolean
  backupRef: string | null
  includeContracts: boolean
}

/** Claves de parada que no borran nada. */
export type RetirementFailureKey =
  | 'falta-la-referencia-del-respaldo'
  | 'el-contrato-aun-exige-departamento-y-puesto'
  | 'empresa-no-encontrada'
  | 'combinacion-de-opciones-no-valida'

/**
 * Parada controlada del retiro. El comando la imprime sin datos personales.
 */
export class StructurePlaceholderRetirementError extends Error {
  constructor(
    readonly key: RetirementFailureKey,
    readonly title: string,
    readonly detail: string
  ) {
    super(title)
  }
}

type InventoryResult = {
  placeholdersExist: boolean
  contractStructureNullable: boolean
  references: ReferenceCount[]
  blocking: BlockingReference[]
}

type CountRow = {
  business_unit_id: number | null
  total: number | string
  alive?: number | string | null
}

type ForeignKeyUse = {
  TABLE_NAME: string
  COLUMN_NAME: string
}

type EmployeeSnapshot = {
  employee_id: number
  department_id: number | null
  position_id: number | null
  position_level_config_id: number | null
}

type ContractSnapshot = {
  employee_contract_id: number
  department_id: number | null
  position_id: number | null
}

type NoticeSnapshot = {
  notice_id: number
  notice_department_id: number | null
  notice_position_id: number | null
  notice_scheduled_at: Date | string | null
  notice_schedule_error: string | null
}

const FAILURES: Record<RetirementFailureKey, { title: string; detail: string }> = {
  'falta-la-referencia-del-respaldo': {
    title: 'Falta la referencia del respaldo',
    detail:
      'Los modos que escriben exigen --backup-ref con el identificador del respaldo completo; usa --dry-run para ensayar.',
  },
  'el-contrato-aun-exige-departamento-y-puesto': {
    title: 'El contrato aún exige departamento y puesto',
    detail:
      'employee_contracts.department_id o position_id siguen siendo obligatorios. El retiro por empresa no escribe.',
  },
  'empresa-no-encontrada': {
    title: 'Empresa no encontrada',
    detail: 'No existe una empresa con ese identificador.',
  },
  'combinacion-de-opciones-no-valida': {
    title: 'Combinación de opciones no válida',
    detail: 'Revisa las banderas: --tenant y --finalize no se combinan, y --dry-run exige un modo.',
  },
}

/**
 * Retira los registros de relleno de la estructura, empresa por empresa (R1–R12).
 *
 * No usa modelos Lucid: el borrado físico y el alcance por empresa van en SQL
 * con identificadores por binding.
 */
export default class StructurePlaceholderRetirementService {
  private t: (key: string) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  /**
   * Inventario de solo lectura, agrupado por empresa (R3, R11).
   *
   * @param ids Ids del relleno, de fixture en las pruebas.
   */
  async inventory(ids: PlaceholderIds): Promise<InventoryResult> {
    const placeholdersExist = await this.placeholdersExist(ids)
    const contractStructureNullable = await this.contractStructureNullable()
    const references = await this.collectReferences(ids)
    const blocking = await this.collectBlocking(ids, { ignoreRoleDepartments: false })
    return { placeholdersExist, contractStructureNullable, references, blocking }
  }

  /**
   * Deja sin asignar lo de una empresa que apunta al relleno o a catálogos
   * dados de baja (R4, R5, R6, R7, R8). El ensayo no escribe (R1).
   *
   * @param ids Ids del relleno.
   * @param businessUnitId Empresa que se retira. No toca las demás.
   * @param options Ensayo, respaldo y si se vacían contratos históricos.
   */
  async retireForTenant(
    ids: PlaceholderIds,
    businessUnitId: number,
    options: RetirementOptions
  ): Promise<{ changed: ReferenceCount[]; snapshotPath: string | null }> {
    this.assertCanWrite(options)
    await this.assertTenantExists(businessUnitId)
    if (!options.dryRun) await this.assertContractsNullable()

    const plan = await this.planTenant(ids, businessUnitId, options.includeContracts)
    if (options.dryRun || plan.changed.every((row) => row.total === 0)) {
      return { changed: plan.changed, snapshotPath: null }
    }

    let snapshotPath: string | null = null
    try {
      await db.transaction(async (trx) => {
        snapshotPath = await this.writeSnapshot(trx, {
          mode: 'tenant',
          businessUnitId,
          backupRef: options.backupRef ?? '',
          placeholderIds: ids,
          includeContracts: options.includeContracts,
          rows: plan.rows,
        })
        await this.applyTenant(trx, ids, businessUnitId, options.includeContracts)
      })
    } catch (error) {
      if (snapshotPath) await unlink(snapshotPath).catch(() => undefined)
      throw error
    }

    return { changed: plan.changed, snapshotPath }
  }

  /**
   * Cierre global: quita permisos del relleno, verifica que nada lo referencie
   * y solo entonces lo borra (R9, R10).
   *
   * @param ids Ids del relleno.
   * @param options Ensayo o respaldo. `includeContracts` no aplica.
   */
  async finalize(
    ids: PlaceholderIds,
    options: RetirementOptions
  ): Promise<{
    alreadyRetired: boolean
    deleted: boolean
    blocking: BlockingReference[]
    snapshotPath: string | null
  }> {
    this.assertCanWrite(options)
    if (!(await this.placeholdersExist(ids))) {
      return { alreadyRetired: true, deleted: false, blocking: [], snapshotPath: null }
    }

    const blocking = await this.collectBlocking(ids, { ignoreRoleDepartments: true })
    if (options.dryRun || blocking.length > 0) {
      if (!options.dryRun && blocking.length > 0) {
        await this.proveFinalizeRollsBack(ids)
      }
      return { alreadyRetired: false, deleted: false, blocking, snapshotPath: options.dryRun ? null : null }
    }

    let snapshotPath: string | null = null
    try {
      await db.transaction(async (trx) => {
        const rows = await this.lockFinalizeRows(trx, ids)
        snapshotPath = await this.writeSnapshot(trx, {
          mode: 'finalize',
          businessUnitId: null,
          backupRef: options.backupRef ?? '',
          placeholderIds: ids,
          includeContracts: false,
          rows,
        })
        await trx.from('role_departments').where('department_id', ids.departmentId).delete()
        const stillBlocking = await this.collectBlocking(ids, { ignoreRoleDepartments: true }, trx)
        if (stillBlocking.length > 0) {
          blocking.push(...stillBlocking)
          throw new FinalizeBlocked()
        }
        await trx.from('positions').where('position_id', ids.positionId).delete()
        await trx.from('departments').where('department_id', ids.departmentId).delete()
      })
    } catch (error) {
      if (snapshotPath) await unlink(snapshotPath).catch(() => undefined)
      if (error instanceof FinalizeBlocked) {
        return { alreadyRetired: false, deleted: false, blocking, snapshotPath: null }
      }
      throw error
    }

    return { alreadyRetired: false, deleted: true, blocking: [], snapshotPath }
  }

  /** Exige el respaldo antes de escribir (R2). El ensayo no lo pide. */
  private assertCanWrite(options: RetirementOptions): void {
    if (!options.dryRun && !options.backupRef) {
      const failure = FAILURES['falta-la-referencia-del-respaldo']
      throw new StructurePlaceholderRetirementError(
        'falta-la-referencia-del-respaldo',
        failure.title,
        failure.detail
      )
    }
  }

  /** El retiro por empresa no escribe si el contrato sigue exigiendo estructura (R12). */
  private async assertContractsNullable(): Promise<void> {
    if (await this.contractStructureNullable()) return
    const failure = FAILURES['el-contrato-aun-exige-departamento-y-puesto']
    throw new StructurePlaceholderRetirementError(
      'el-contrato-aun-exige-departamento-y-puesto',
      failure.title,
      failure.detail
    )
  }

  /** La empresa tiene que existir antes de tocarla. */
  private async assertTenantExists(businessUnitId: number): Promise<void> {
    const row = await db.from('business_units').where('business_unit_id', businessUnitId).first()
    if (row) return
    const failure = FAILURES['empresa-no-encontrada']
    throw new StructurePlaceholderRetirementError('empresa-no-encontrada', failure.title, failure.detail)
  }

  /** Las dos columnas del contrato admiten vacío (precondición de USRH1789328927648). */
  private async contractStructureNullable(): Promise<boolean> {
    const [rows] = await db.rawQuery(
      `SELECT COLUMN_NAME AS column_name, IS_NULLABLE AS is_nullable
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'employee_contracts'
         AND COLUMN_NAME IN ('department_id', 'position_id')`
    )
    const list = rows as Array<{ column_name: string; is_nullable: string }>
    const department = list.find((row) => row.column_name === 'department_id')
    const position = list.find((row) => row.column_name === 'position_id')
    return department?.is_nullable === 'YES' && position?.is_nullable === 'YES'
  }

  /** Alguna de las dos filas sigue en la base, aunque esté dada de baja (R10). */
  private async placeholdersExist(ids: PlaceholderIds): Promise<boolean> {
    const [department] = await db.rawQuery(
      'SELECT COUNT(*) AS total FROM departments WHERE department_id = ?',
      [ids.departmentId]
    )
    const [position] = await db.rawQuery(
      'SELECT COUNT(*) AS total FROM positions WHERE position_id = ?',
      [ids.positionId]
    )
    const departmentRows = department as Array<{ total: number | string }>
    const positionRows = position as Array<{ total: number | string }>
    return Number(departmentRows[0]?.total ?? 0) + Number(positionRows[0]?.total ?? 0) > 0
  }

  /** Conteos del inventario. Solo identificadores y cantidades (R11). */
  private async collectReferences(ids: PlaceholderIds): Promise<ReferenceCount[]> {
    const references: ReferenceCount[] = []
    const push = async (
      reference: string,
      sql: string,
      bindings: Array<number | string>
    ): Promise<void> => {
      const grouped = await this.grouped(sql, bindings)
      for (const row of grouped) references.push({ reference, ...row })
    }

    await push(
      'employees.department',
      `SELECT business_unit_id, COUNT(*) AS total,
              SUM(employee_deleted_at IS NULL) AS alive
       FROM employees WHERE department_id = ? GROUP BY business_unit_id`,
      [ids.departmentId]
    )
    await push(
      'employees.position',
      `SELECT business_unit_id, COUNT(*) AS total,
              SUM(employee_deleted_at IS NULL) AS alive
       FROM employees WHERE position_id = ? GROUP BY business_unit_id`,
      [ids.positionId]
    )
    await push(
      'employee_contracts.department',
      `SELECT business_unit_id, COUNT(*) AS total,
              SUM(employee_contract_deleted_at IS NULL) AS alive
       FROM employee_contracts WHERE department_id = ? GROUP BY business_unit_id`,
      [ids.departmentId]
    )
    await push(
      'employee_contracts.position',
      `SELECT business_unit_id, COUNT(*) AS total,
              SUM(employee_contract_deleted_at IS NULL) AS alive
       FROM employee_contracts WHERE position_id = ? GROUP BY business_unit_id`,
      [ids.positionId]
    )
    await push(
      'department_position',
      `SELECT business_unit_id, COUNT(*) AS total,
              SUM(department_position_deleted_at IS NULL) AS alive
       FROM department_position
       WHERE department_id = ? OR position_id = ?
       GROUP BY business_unit_id`,
      [ids.departmentId, ids.positionId]
    )
    await push(
      'notices.position:unsent',
      `SELECT business_unit_id, COUNT(*) AS total, NULL AS alive
       FROM notices
       WHERE notice_sent_at IS NULL AND notice_position_id = ?
       GROUP BY business_unit_id`,
      [ids.positionId]
    )
    await push(
      'notices.position:sent',
      `SELECT business_unit_id, COUNT(*) AS total, NULL AS alive
       FROM notices
       WHERE notice_sent_at IS NOT NULL AND notice_position_id = ?
       GROUP BY business_unit_id`,
      [ids.positionId]
    )
    await push(
      'notices.department:unsent',
      `SELECT business_unit_id, COUNT(*) AS total, NULL AS alive
       FROM notices
       WHERE notice_sent_at IS NULL AND notice_department_id = ?
       GROUP BY business_unit_id`,
      [ids.departmentId]
    )
    await push(
      'notices.department:sent',
      `SELECT business_unit_id, COUNT(*) AS total, NULL AS alive
       FROM notices
       WHERE notice_sent_at IS NOT NULL AND notice_department_id = ?
       GROUP BY business_unit_id`,
      [ids.departmentId]
    )
    await push(
      'legacy:employees.department',
      `SELECT e.business_unit_id, COUNT(*) AS total,
              SUM(e.employee_deleted_at IS NULL) AS alive
       FROM employees e
       INNER JOIN departments d ON d.department_id = e.department_id
       WHERE d.department_deleted_at IS NOT NULL
       GROUP BY e.business_unit_id`,
      []
    )
    await push(
      'legacy:employees.position',
      `SELECT e.business_unit_id, COUNT(*) AS total,
              SUM(e.employee_deleted_at IS NULL) AS alive
       FROM employees e
       INNER JOIN positions p ON p.position_id = e.position_id
       WHERE p.position_deleted_at IS NOT NULL
       GROUP BY e.business_unit_id`,
      []
    )
    await push(
      'cross:employees.department',
      `SELECT e.business_unit_id, COUNT(*) AS total,
              SUM(e.employee_deleted_at IS NULL) AS alive
       FROM employees e
       INNER JOIN departments d ON d.department_id = e.department_id
       WHERE d.business_unit_id IS NOT NULL
         AND e.business_unit_id <> d.business_unit_id
       GROUP BY e.business_unit_id`,
      []
    )
    await push(
      'cross:employees.position',
      `SELECT e.business_unit_id, COUNT(*) AS total,
              SUM(e.employee_deleted_at IS NULL) AS alive
       FROM employees e
       INNER JOIN positions p ON p.position_id = e.position_id
       WHERE p.business_unit_id IS NOT NULL
         AND e.business_unit_id <> p.business_unit_id
       GROUP BY e.business_unit_id`,
      []
    )

    return references
  }

  /**
   * Referencias que el cierre no sabe limpiar (R9).
   * `role_departments` se excluye cuando el cierre ya las va a borrar.
   */
  private async collectBlocking(
    ids: PlaceholderIds,
    scope: { ignoreRoleDepartments: boolean },
    trx?: TransactionClientContract
  ): Promise<BlockingReference[]> {
    const runner = trx ?? db
    const [foreignKeys] = await runner.rawQuery(
      `SELECT TABLE_NAME, COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND REFERENCED_TABLE_NAME IN ('departments', 'positions')
         AND REFERENCED_COLUMN_NAME IN ('department_id', 'position_id')`
    )
    const uses = foreignKeys as ForeignKeyUse[]
    const blocking: BlockingReference[] = []

    for (const use of uses) {
      if (scope.ignoreRoleDepartments && use.TABLE_NAME === 'role_departments') continue
      const table = quoteIdent(use.TABLE_NAME)
      const column = quoteIdent(use.COLUMN_NAME)
      const id = this.referencedId(use, ids)
      const hasBusinessUnit = await this.hasColumn(use.TABLE_NAME, 'business_unit_id', runner)
      const sql = hasBusinessUnit
        ? `SELECT business_unit_id, COUNT(*) AS total, NULL AS alive
           FROM ${table} WHERE ${column} = ? GROUP BY business_unit_id`
        : `SELECT NULL AS business_unit_id, COUNT(*) AS total, NULL AS alive
           FROM ${table} WHERE ${column} = ?`
      const grouped = await this.grouped(sql, [id], runner)
      for (const row of grouped) {
        if (row.total === 0) continue
        blocking.push({
          table: use.TABLE_NAME,
          column: use.COLUMN_NAME,
          businessUnitId: row.businessUnitId,
          total: row.total,
        })
      }
    }

    const unsentPosition = await this.grouped(
      `SELECT business_unit_id, COUNT(*) AS total, NULL AS alive
       FROM notices
       WHERE notice_sent_at IS NULL AND notice_position_id = ?
       GROUP BY business_unit_id`,
      [ids.positionId],
      runner
    )
    for (const row of unsentPosition) {
      blocking.push({
        table: 'notices',
        column: 'notice_position_id',
        businessUnitId: row.businessUnitId,
        total: row.total,
      })
    }
    const unsentDepartment = await this.grouped(
      `SELECT business_unit_id, COUNT(*) AS total, NULL AS alive
       FROM notices
       WHERE notice_sent_at IS NULL AND notice_department_id = ?
       GROUP BY business_unit_id`,
      [ids.departmentId],
      runner
    )
    for (const row of unsentDepartment) {
      blocking.push({
        table: 'notices',
        column: 'notice_department_id',
        businessUnitId: row.businessUnitId,
        total: row.total,
      })
    }

    return blocking.filter((row) => row.total > 0)
  }

  /** El id apuntado: puesto si la columna es de puestos; si no, departamento. */
  private referencedId(use: ForeignKeyUse, ids: PlaceholderIds): number {
    if (use.COLUMN_NAME.includes('position')) return ids.positionId
    return ids.departmentId
  }

  private async planTenant(
    ids: PlaceholderIds,
    businessUnitId: number,
    includeContracts: boolean
  ): Promise<{
    changed: ReferenceCount[]
    rows: SnapshotRows
  }> {
    const employees = await this.tenantEmployees(ids, businessUnitId)
    const contracts = await this.tenantContracts(ids, businessUnitId, includeContracts)
    const links = await db
      .from('department_position')
      .where('business_unit_id', businessUnitId)
      .where((query) => {
        query.where('department_id', ids.departmentId).orWhere('position_id', ids.positionId)
      })
    const notices = await this.tenantNotices(ids, businessUnitId)
    const changed: ReferenceCount[] = [
      { reference: 'employees', businessUnitId, total: employees.length, alive: null },
      { reference: 'employee_contracts', businessUnitId, total: contracts.length, alive: null },
      { reference: 'department_position', businessUnitId, total: links.length, alive: null },
      { reference: 'notices', businessUnitId, total: notices.length, alive: null },
    ]
    return {
      changed,
      rows: {
        employees,
        employee_contracts: contracts,
        department_position: links as Array<Record<string, unknown>>,
        notices,
        role_departments: [],
        departments: [],
        positions: [],
      },
    }
  }

  private async tenantEmployees(
    ids: PlaceholderIds,
    businessUnitId: number
  ): Promise<EmployeeSnapshot[]> {
    const levelIds = await this.levelIds(ids.positionId)
    const [rows] = await db.rawQuery(
      `SELECT DISTINCT e.employee_id, e.department_id, e.position_id, e.position_level_config_id
       FROM employees e
       LEFT JOIN departments d ON d.department_id = e.department_id
       LEFT JOIN positions p ON p.position_id = e.position_id
       WHERE e.business_unit_id = ?
         AND (
           e.department_id = ?
           OR e.position_id = ?
           ${levelIds.length > 0 ? `OR e.position_level_config_id IN (${levelIds.map(() => '?').join(',')})` : ''}
           OR (e.employee_deleted_at IS NULL AND d.department_deleted_at IS NOT NULL)
           OR (e.employee_deleted_at IS NULL AND p.position_deleted_at IS NOT NULL)
         )`,
      [businessUnitId, ids.departmentId, ids.positionId, ...levelIds]
    )
    return rows as EmployeeSnapshot[]
  }

  private async tenantContracts(
    ids: PlaceholderIds,
    businessUnitId: number,
    includeContracts: boolean
  ): Promise<ContractSnapshot[]> {
    const legacy = includeContracts
      ? `OR (
           c.employee_contract_deleted_at IS NULL
           AND (
             d.department_deleted_at IS NOT NULL
             OR p.position_deleted_at IS NOT NULL
           )
         )`
      : ''
    const [rows] = await db.rawQuery(
      `SELECT DISTINCT c.employee_contract_id, c.department_id, c.position_id
       FROM employee_contracts c
       LEFT JOIN departments d ON d.department_id = c.department_id
       LEFT JOIN positions p ON p.position_id = c.position_id
       WHERE c.business_unit_id = ?
         AND (
           c.department_id = ?
           OR c.position_id = ?
           ${legacy}
         )`,
      [businessUnitId, ids.departmentId, ids.positionId]
    )
    return rows as ContractSnapshot[]
  }

  private async tenantNotices(ids: PlaceholderIds, businessUnitId: number): Promise<NoticeSnapshot[]> {
    const [rows] = await db.rawQuery(
      `SELECT notice_id, notice_department_id, notice_position_id,
              notice_scheduled_at, notice_schedule_error
       FROM notices
       WHERE business_unit_id = ?
         AND notice_sent_at IS NULL
         AND (notice_position_id = ? OR notice_department_id = ?)`,
      [businessUnitId, ids.positionId, ids.departmentId]
    )
    return rows as NoticeSnapshot[]
  }

  /** Aplica el retiro ya inventariado, dentro de la transacción de la empresa. */
  private async applyTenant(
    trx: TransactionClientContract,
    ids: PlaceholderIds,
    businessUnitId: number,
    includeContracts: boolean
  ): Promise<void> {
    const now = DateTime.utc().toFormat('yyyy-LL-dd HH:mm:ss')
    const levelIds = await this.levelIds(ids.positionId, trx)

    await trx
      .from('employees')
      .where('business_unit_id', businessUnitId)
      .where('department_id', ids.departmentId)
      .update({ department_id: null, employee_updated_at: now })

    await trx
      .from('employees')
      .where('business_unit_id', businessUnitId)
      .where('position_id', ids.positionId)
      .update({ position_id: null, position_level_config_id: null, employee_updated_at: now })

    if (levelIds.length > 0) {
      await trx
        .from('employees')
        .where('business_unit_id', businessUnitId)
        .whereIn('position_level_config_id', levelIds)
        .update({ position_level_config_id: null, employee_updated_at: now })
    }

    await trx.rawQuery(
      `UPDATE employees e
       INNER JOIN departments d ON d.department_id = e.department_id
       SET e.department_id = NULL, e.employee_updated_at = ?
       WHERE e.business_unit_id = ?
         AND e.employee_deleted_at IS NULL
         AND d.department_deleted_at IS NOT NULL`,
      [now, businessUnitId]
    )
    await trx.rawQuery(
      `UPDATE employees e
       INNER JOIN positions p ON p.position_id = e.position_id
       SET e.position_id = NULL, e.position_level_config_id = NULL, e.employee_updated_at = ?
       WHERE e.business_unit_id = ?
         AND e.employee_deleted_at IS NULL
         AND p.position_deleted_at IS NOT NULL`,
      [now, businessUnitId]
    )

    await trx
      .from('employee_contracts')
      .where('business_unit_id', businessUnitId)
      .where('department_id', ids.departmentId)
      .update({ department_id: null, employee_contract_updated_at: now })
    await trx
      .from('employee_contracts')
      .where('business_unit_id', businessUnitId)
      .where('position_id', ids.positionId)
      .update({ position_id: null, employee_contract_updated_at: now })

    if (includeContracts) {
      await trx.rawQuery(
        `UPDATE employee_contracts c
         INNER JOIN departments d ON d.department_id = c.department_id
         SET c.department_id = NULL, c.employee_contract_updated_at = ?
         WHERE c.business_unit_id = ?
           AND c.employee_contract_deleted_at IS NULL
           AND d.department_deleted_at IS NOT NULL`,
        [now, businessUnitId]
      )
      await trx.rawQuery(
        `UPDATE employee_contracts c
         INNER JOIN positions p ON p.position_id = c.position_id
         SET c.position_id = NULL, c.employee_contract_updated_at = ?
         WHERE c.business_unit_id = ?
           AND c.employee_contract_deleted_at IS NULL
           AND p.position_deleted_at IS NOT NULL`,
        [now, businessUnitId]
      )
    }

    await trx
      .from('department_position')
      .where('business_unit_id', businessUnitId)
      .where((query) => {
        query.where('department_id', ids.departmentId).orWhere('position_id', ids.positionId)
      })
      .delete()

    const reason = this.t('structure_placeholder_notice_demoted_reason')
    await trx
      .from('notices')
      .where('business_unit_id', businessUnitId)
      .whereNull('notice_sent_at')
      .where('notice_position_id', ids.positionId)
      .update({
        notice_scheduled_at: null,
        notice_position_id: null,
        notice_schedule_error: reason,
        notice_updated_at: now,
      })
    await trx
      .from('notices')
      .where('business_unit_id', businessUnitId)
      .whereNull('notice_sent_at')
      .where('notice_department_id', ids.departmentId)
      .update({ notice_department_id: null, notice_updated_at: now })
  }

  /**
   * Abre y revierte la transacción del cierre cuando ya hay bloqueantes,
   * para no dejar los permisos de rol borrados (R9).
   */
  private async proveFinalizeRollsBack(ids: PlaceholderIds): Promise<void> {
    try {
      await db.transaction(async (trx) => {
        await trx.from('role_departments').where('department_id', ids.departmentId).delete()
        throw new FinalizeBlocked()
      })
    } catch (error) {
      if (error instanceof FinalizeBlocked) return
      throw error
    }
  }

  private async lockFinalizeRows(trx: TransactionClientContract, ids: PlaceholderIds): Promise<SnapshotRows> {
    const roleDepartments = await trx.from('role_departments').where('department_id', ids.departmentId).forUpdate()
    const departments = await trx.from('departments').where('department_id', ids.departmentId).forUpdate()
    const positions = await trx.from('positions').where('position_id', ids.positionId).forUpdate()
    return {
      employees: [],
      employee_contracts: [],
      department_position: [],
      notices: [],
      role_departments: roleDepartments as Array<Record<string, unknown>>,
      departments: departments as Array<Record<string, unknown>>,
      positions: positions as Array<Record<string, unknown>>,
    }
  }

  private async levelIds(positionId: number, trx?: TransactionClientContract): Promise<number[]> {
    const runner = trx ?? db
    const rows = await runner
      .from('position_position_levels')
      .where('position_id', positionId)
      .select('position_position_level_id')
    return rows.map((row: { position_position_level_id: number }) => row.position_position_level_id)
  }

  /** Guarda solo llaves y columnas de estructura, antes de la primera escritura (R2, R11). */
  private async writeSnapshot(
    _trx: TransactionClientContract,
    payload: {
      mode: 'tenant' | 'finalize'
      businessUnitId: number | null
      backupRef: string
      placeholderIds: PlaceholderIds
      includeContracts: boolean
      rows: SnapshotRows
    }
  ): Promise<string> {
    const stamp = DateTime.utc().toFormat('yyyyLLdd-HHmmss')
    const suffix = payload.mode === 'finalize' ? 'finalize' : `bu${payload.businessUnitId}`
    const path = app.tmpPath('structure-placeholder-retirement', `${stamp}-${suffix}.json`)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(
      path,
      JSON.stringify({
        command: 'structure:retire-placeholders',
        mode: payload.mode,
        businessUnitId: payload.businessUnitId,
        backupRef: payload.backupRef,
        placeholderIds: payload.placeholderIds,
        includeContracts: payload.includeContracts,
        createdAt: DateTime.utc().toISO(),
        rows: payload.rows,
      })
    )
    return path
  }

  private async grouped(
    sql: string,
    bindings: Array<number | string>,
    runner: TransactionClientContract | typeof db = db
  ): Promise<Array<{ businessUnitId: number | null; total: number; alive: number | null }>> {
    const [rows] = await runner.rawQuery(sql, bindings)
    return (rows as CountRow[])
      .map((row) => ({
        businessUnitId: row.business_unit_id === null ? null : Number(row.business_unit_id),
        total: Number(row.total ?? 0),
        alive: row.alive === undefined || row.alive === null ? null : Number(row.alive),
      }))
      .filter((row) => row.total > 0)
  }

  private async hasColumn(
    table: string,
    column: string,
    runner: TransactionClientContract | typeof db
  ): Promise<boolean> {
    quoteIdent(table)
    const [rows] = await runner.rawQuery(
      `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    )
    const list = rows as Array<{ total: number | string }>
    return Number(list[0]?.total ?? 0) > 0
  }
}

type SnapshotRows = {
  employees: EmployeeSnapshot[]
  employee_contracts: ContractSnapshot[]
  department_position: Array<Record<string, unknown>>
  notices: NoticeSnapshot[]
  role_departments: Array<Record<string, unknown>>
  departments: Array<Record<string, unknown>>
  positions: Array<Record<string, unknown>>
}

/** Señal interna para revertir el cierre sin tratarlo como error de base. */
class FinalizeBlocked extends Error {}

/** Nombres que vienen de information_schema: solo letras, números y guion bajo. */
function quoteIdent(name: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error('Identificador SQL no admitido')
  }
  return `\`${name}\``
}

export { FAILURES }
