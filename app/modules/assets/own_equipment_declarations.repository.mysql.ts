import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { SupplyTypeTeleworkCategory } from '#constants/supply_type_telework_category'
import { OPEN_ASSIGNMENT_STATUSES, type OwnEquipmentDeclarationStatus } from './assets.constants.js'
import type {
  OwnEquipmentDeclarationByEmployee,
  OwnEquipmentDeclarationDto,
  OwnEquipmentDeclarationInsert,
} from './dto/own_equipment_declarations.dto.js'
import type {
  OwnEquipmentDbExecutor,
  OwnEquipmentDeclarationsRepository,
} from './own_equipment_declarations.repository.js'

/**
 * Adaptador MySQL del puerto de la declaración de equipo propio
 * (VLRH-H1791306075599). Espejo del patrón de lectura de `AssetsRepositoryMysql`
 * (`findTeleworkCoverage`, `assets.repository.mysql.ts`): el alcance de empresas
 * viaja con `whereIn('<tabla>.business_unit_id', alcance)` DENTRO de cada
 * consulta y sin modelos ni `TenantContext`.
 */

/** Fecha de calendario de una columna DATE (la conexión está en UTC). */
const calendarDate = (column: string, alias: string) =>
  db.raw(`DATE_FORMAT(${column}, '%Y-%m-%d') as ${alias}`)

/**
 * Columnas del DTO sobre la tabla propia. El DECIMAL sale como texto y el
 * mapper lo pasa a número; el `DATE` sale ya `YYYY-MM-DD`; `created_at` sale
 * crudo para volverlo ISO en el mapper.
 */
const DECLARATION_DTO_COLUMNS = [
  'employee_own_equipment_declaration_id as declaration_id',
  'employee_id',
  'employee_own_equipment_declaration_category as category',
  'employee_own_equipment_declaration_description as description',
  'employee_own_equipment_declaration_conditions as conditions',
  calendarDate('employee_own_equipment_declaration_start_date', 'start_date'),
  'employee_own_equipment_declaration_monthly_fee as monthly_fee',
  'employee_own_equipment_declaration_status as status',
  'employee_own_equipment_declaration_created_at as created_at',
]

/** Fila cruda de la declaración, con los alias de `DECLARATION_DTO_COLUMNS`. */
interface DeclarationRow {
  declaration_id: number
  employee_id: number
  category: SupplyTypeTeleworkCategory
  description: string
  conditions: string | null
  start_date: string
  monthly_fee: string | number
  status: OwnEquipmentDeclarationStatus
  created_at: string | Date
}

/** Fila cruda → DTO: DECIMAL a número, `created_at` a ISO (§11). */
function toDto(row: DeclarationRow): OwnEquipmentDeclarationDto {
  return {
    declarationId: Number(row.declaration_id),
    employeeId: Number(row.employee_id),
    category: row.category,
    description: row.description,
    conditions: row.conditions,
    startDate: row.start_date,
    monthlyFee: Number(row.monthly_fee),
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
  }
}

export default class OwnEquipmentDeclarationsRepositoryMysql
  implements OwnEquipmentDeclarationsRepository
{
  async findEmployeeForDeclaration(
    executor: OwnEquipmentDbExecutor,
    businessUnitIds: readonly number[],
    employeeId: number,
    options: { lock: boolean }
  ): Promise<{ employeeId: number; businessUnitId: number; teleworkPercentage: number } | null> {
    const query = executor
      .from('employees')
      .where('employee_id', employeeId)
      .whereIn('business_unit_id', [...businessUnitIds]) // el scope DENTRO de la consulta (§13)
      .whereNull('employee_deleted_at')
      .select('employee_id', 'business_unit_id', 'employee_telework_percentage')

    // `forUpdate` solo tiene sentido dentro de una transacción: fuera de ella
    // el candado se toma y suelta sin proteger nada. La conexión global
    // (`db`) no expone `isTransaction`, pero el builder sí expone su cliente.
    if (options.lock && query.client.isTransaction) query.forUpdate()

    const row: {
      employee_id: number
      business_unit_id: number
      employee_telework_percentage: string | number | null
    } | null = await query.first()

    return row
      ? {
          employeeId: Number(row.employee_id),
          businessUnitId: Number(row.business_unit_id),
          teleworkPercentage: Number(row.employee_telework_percentage ?? 0), // DECIMAL llega como texto
        }
      : null
  }

  async hasOpenCoverage(
    executor: OwnEquipmentDbExecutor,
    businessUnitIds: readonly number[],
    employeeId: number,
    category: SupplyTypeTeleworkCategory
  ): Promise<boolean> {
    const row: { employee_supply_id: number } | null = await executor
      .from('employee_supplies as es')
      .join('supplies as s', 's.supply_id', 'es.supply_id')
      .join('supply_types as st', 'st.supply_type_id', 's.supply_type_id')
      .whereIn('es.business_unit_id', [...businessUnitIds]) // el scope DENTRO de la consulta (§13)
      .whereIn('s.business_unit_id', [...businessUnitIds]) // defensa en profundidad
      .where('es.employee_id', employeeId)
      .whereIn('es.employee_supply_status', [...OPEN_ASSIGNMENT_STATUSES])
      .whereNull('es.employee_supply_deleted_at')
      .whereNull('s.supply_deleted_at')
      .where('st.supply_type_telework_category', category)
      .select('es.employee_supply_id')
      .first()

    return row !== null
  }

  async hasOpenDeclaration(
    executor: OwnEquipmentDbExecutor,
    businessUnitIds: readonly number[],
    employeeId: number,
    category: SupplyTypeTeleworkCategory
  ): Promise<boolean> {
    const row: { employee_own_equipment_declaration_id: number } | null = await executor
      .from('employee_own_equipment_declarations')
      .where('employee_id', employeeId)
      .whereIn('business_unit_id', [...businessUnitIds]) // el scope DENTRO de la consulta (§13)
      .where('employee_own_equipment_declaration_category', category)
      .where('employee_own_equipment_declaration_status', 'active')
      .whereNull('employee_own_equipment_declaration_deleted_at')
      .select('employee_own_equipment_declaration_id')
      .first()

    return row !== null
  }

  async insert(trx: TransactionClientContract, row: OwnEquipmentDeclarationInsert): Promise<number> {
    const [declarationId] = await trx.table('employee_own_equipment_declarations').insert({
      employee_id: row.employeeId,
      business_unit_id: row.businessUnitId,
      employee_own_equipment_declaration_category: row.category,
      employee_own_equipment_declaration_description: row.description,
      employee_own_equipment_declaration_conditions: row.conditions,
      employee_own_equipment_declaration_start_date: row.startDate,
      employee_own_equipment_declaration_monthly_fee: row.monthlyFee,
      employee_own_equipment_declaration_fee_source: row.feeSource,
      employee_own_equipment_declaration_status: 'active',
      employee_own_equipment_declaration_created_by_user_id: row.createdByUserId,
      employee_own_equipment_declaration_created_at: new Date(),
    })

    return Number(declarationId)
  }

  async findById(
    executor: OwnEquipmentDbExecutor,
    businessUnitIds: readonly number[],
    id: number
  ): Promise<OwnEquipmentDeclarationDto | null> {
    const row: DeclarationRow | null = await executor
      .from('employee_own_equipment_declarations')
      .where('employee_own_equipment_declaration_id', id)
      .whereIn('business_unit_id', [...businessUnitIds]) // el scope DENTRO de la consulta (§13)
      .whereNull('employee_own_equipment_declaration_deleted_at')
      .select(DECLARATION_DTO_COLUMNS)
      .first()

    return row ? toDto(row) : null
  }

  async findOpenByEmployees(
    businessUnitIds: readonly number[],
    employeeIds: readonly number[]
  ): Promise<OwnEquipmentDeclarationByEmployee[]> {
    // Cualquier lista vacía corta sin consultar (lo consumen la matriz y la adenda).
    if (businessUnitIds.length === 0 || employeeIds.length === 0) return []

    const rows: DeclarationRow[] = await db
      .from('employee_own_equipment_declarations')
      .whereIn('business_unit_id', [...businessUnitIds]) // el scope DENTRO de la consulta (§13)
      .whereIn('employee_id', [...employeeIds])
      .where('employee_own_equipment_declaration_status', 'active')
      .whereNull('employee_own_equipment_declaration_deleted_at')
      .orderBy('employee_own_equipment_declaration_id', 'asc')
      .select(DECLARATION_DTO_COLUMNS)

    return rows.map((row) => ({
      employeeId: Number(row.employee_id),
      declaration: toDto(row),
    }))
  }
}
