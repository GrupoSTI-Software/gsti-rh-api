import db from '@adonisjs/lucid/services/db'
import { isUploadFailureSentinel } from '#constants/upload_sentinels'
import {
  OPEN_ASSIGNMENT_STATUSES,
  type AssetCharacteristicType,
  type AssetStatus,
  type OpenAssignmentStatus,
} from './assets.constants.js'
import type {
  AssetCharacteristicValueWrite,
  AssetListFilter,
  AssetOwnership,
  AssetsRepository,
  AssetStoredFile,
} from './assets.repository.js'
import type {
  AssetAssignmentDto,
  AssetCharacteristicValueDto,
  AssetListItemDto,
  AssetListResponseDto,
  AssetsSummaryDto,
  AssetTypeDto,
  AssetValueHistoryEntryDto,
} from './dto/assets.dto.js'

/** Mismo tipo que devuelve `db.from`, para que las filas se tipen en cada consulta. */
type QueryBuilder = ReturnType<typeof db.from>

/** Decimal de MySQL (llega como texto) a número; `null` se respeta. */
type DecimalValue = string | number | null

interface AssetRow {
  supply_id: number
  supply_name: string
  supply_file_number: string | number
  supply_serial_number: string | null
  supply_description: string | null
  supply_status: AssetStatus
  supply_deactivation_reason: string | null
  deactivation_date: string | null
  supply_type_id: number
  supply_type_name: string
  supply_acquisition_value: DecimalValue
  acquisition_date: string | null
  current_value: DecimalValue
  employee_supply_id: number | null
  employee_supply_status: OpenAssignmentStatus | null
  assigned_at: string | null
  expires_at: string | null
  employee_supply_additions: string | null
  employee_id: number | null
  employee_slug: string | null
  employee_photo: string | null
  employee_first_name: string | null
  employee_last_name: string | null
  employee_second_last_name: string | null
  position_name: string | null
  department_name: string | null
  branch_name: string | null
  total_rows?: number
}

/** Fecha de calendario de una columna DATE o TIMESTAMP (la conexión está en UTC). */
const calendarDate = (column: string, alias: string) =>
  db.raw(`DATE_FORMAT(${column}, '%Y-%m-%d') as ${alias}`)

/** Valor vigente: último registro vivo del historial o, sin historial, el de adquisición. */
const CURRENT_VALUE_SQL = `COALESCE(
  (SELECT svh.supply_value_history_current_value
     FROM supply_value_histories AS svh
    WHERE svh.supply_id = s.supply_id
      AND svh.supply_value_history_deleted_at IS NULL
    ORDER BY svh.supply_value_history_created_at DESC, svh.supply_value_history_id DESC
    LIMIT 1),
  s.supply_acquisition_value)`

/**
 * Resguardo abierto del activo (`active` o `shipping`, ver
 * `OPEN_ASSIGNMENT_STATUSES`); el de id mayor si la BD trae más de uno.
 */
const ACTIVE_ASSIGNMENT_ID_SQL = `(SELECT MAX(es_active.employee_supply_id)
  FROM employee_supplies AS es_active
  WHERE es_active.supply_id = s.supply_id
    AND es_active.employee_supply_status IN (${OPEN_ASSIGNMENT_STATUSES.map((status) => `'${status}'`).join(', ')})
    AND es_active.employee_supply_deleted_at IS NULL)`

/** Sucursal base activa del colaborador. */
const BRANCH_NAME_SQL = `(SELECT bo.branch_office_name
  FROM employee_branch_offices AS ebo
  JOIN branch_offices AS bo
    ON bo.branch_office_id = ebo.branch_office_id
   AND bo.branch_office_deleted_at IS NULL
  WHERE ebo.employee_id = e.employee_id
    AND ebo.employee_branch_office_active = 1
  ORDER BY ebo.employee_branch_office_id DESC
  LIMIT 1)`

const EMPLOYEE_FULL_NAME_SQL =
  "CONCAT_WS(' ', e.employee_first_name, e.employee_last_name, e.employee_second_last_name)"

function toNumber(value: DecimalValue): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** Texto no vacío o `null`. */
function textOrNull(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text.length > 0 ? text : null
}

function fullName(parts: ReadonlyArray<string | null>): string {
  return parts
    .map((part) => textOrNull(part))
    .filter((part): part is string => part !== null)
    .join(' ')
}

/** Escapa comodines de LIKE para que el texto se busque literal. */
function likeTerm(search: string): string {
  return `%${search.toLowerCase().replace(/[\\%_]/g, (match) => `\\${match}`)}%`
}

/** ISO 8601 de un TIMESTAMP (mysql2 lo entrega como `Date` en UTC). */
function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

/**
 * Consulta base de activos: tipo, valor vigente, resguardo activo y su
 * colaborador con puesto, departamento y sucursal. Acotada al scope de la
 * petición y sin borrados.
 */
function baseAssetQuery(businessUnitIds: readonly number[]): QueryBuilder {
  return db
    .from('supplies as s')
    .join('supply_types as st', 'st.supply_type_id', 's.supply_type_id')
    .leftJoin('employee_supplies as es', (join) => {
      join.on('es.employee_supply_id', '=', db.knexRawQuery(ACTIVE_ASSIGNMENT_ID_SQL))
    })
    .leftJoin('employees as e', 'e.employee_id', 'es.employee_id')
    .leftJoin('positions as p', (join) => {
      join.on('p.position_id', '=', 'e.position_id').andOnNull('p.position_deleted_at')
    })
    .leftJoin('departments as d', (join) => {
      join.on('d.department_id', '=', 'e.department_id').andOnNull('d.department_deleted_at')
    })
    .whereNull('s.supply_deleted_at')
    .whereIn('s.business_unit_id', [...businessUnitIds])
}

const ASSET_COLUMNS = [
  's.supply_id',
  's.supply_name',
  's.supply_file_number',
  's.supply_serial_number',
  's.supply_description',
  's.supply_status',
  's.supply_deactivation_reason',
  's.supply_type_id',
  'st.supply_type_name',
  's.supply_acquisition_value',
  'es.employee_supply_id',
  'es.employee_supply_status',
  'es.employee_supply_additions',
  'e.employee_id',
  'e.employee_slug',
  'e.employee_photo',
  'e.employee_first_name',
  'e.employee_last_name',
  'e.employee_second_last_name',
  'p.position_name',
  'd.department_name',
] as const

function selectAssetColumns(query: QueryBuilder): QueryBuilder {
  return query.select(
    ...ASSET_COLUMNS,
    calendarDate('s.supply_deactivation_date', 'deactivation_date'),
    calendarDate('s.supply_acquisition_date', 'acquisition_date'),
    calendarDate(
      'COALESCE(es.employee_supply_assignament_date, es.employee_supply_created_at)',
      'assigned_at'
    ),
    calendarDate('es.employee_supply_expiration_date', 'expires_at'),
    db.raw(`${CURRENT_VALUE_SQL} as current_value`),
    db.raw(`${BRANCH_NAME_SQL} as branch_name`)
  )
}

/** Consulta base con los filtros del listado (búsqueda, tipo y estado). */
function filteredAssetQuery(filter: AssetListFilter): QueryBuilder {
  const query = baseAssetQuery(filter.businessUnitIds)
  if (filter.supplyTypeId !== undefined) query.where('s.supply_type_id', filter.supplyTypeId)
  if (filter.search) {
    const term = likeTerm(filter.search)
    query.where((search) => {
      search
        .whereRaw('LOWER(s.supply_name) LIKE ?', [term])
        .orWhereRaw('LOWER(s.supply_file_number) LIKE ?', [term])
        .orWhereRaw('LOWER(s.supply_serial_number) LIKE ?', [term])
        .orWhereRaw('LOWER(st.supply_type_name) LIKE ?', [term])
        .orWhereRaw(`LOWER(${EMPLOYEE_FULL_NAME_SQL}) LIKE ?`, [term])
    })
  }
  switch (filter.state) {
    case 'available':
      query.where('s.supply_status', 'active').whereNull('es.employee_supply_id')
      break
    case 'assigned':
      query.where('s.supply_status', 'active').whereNotNull('es.employee_supply_id')
      break
    case 'retired':
      query.whereNot('s.supply_status', 'active')
      break
    case 'all':
      break
  }
  return query
}

/** Total del filtro sin paginar. */
async function countAssets(filter: AssetListFilter): Promise<number> {
  const row: { total: number | string } | null = await filteredAssetQuery(filter)
    .count('* as total')
    .first()
  return Number(row?.total ?? 0)
}

function toAssetItem(row: AssetRow): AssetListItemDto {
  return {
    supplyId: row.supply_id,
    name: row.supply_name,
    fileNumber: String(row.supply_file_number),
    serialNumber: textOrNull(row.supply_serial_number),
    description: textOrNull(row.supply_description),
    status: row.supply_status,
    deactivationReason: textOrNull(row.supply_deactivation_reason),
    deactivationDate: row.deactivation_date,
    supplyType: { supplyTypeId: row.supply_type_id, name: row.supply_type_name },
    acquisitionValue: toNumber(row.supply_acquisition_value),
    acquisitionDate: row.acquisition_date,
    currentValue: toNumber(row.current_value),
    activeAssignment:
      row.employee_supply_id === null || row.employee_id === null
        ? null
        : {
            employeeSupplyId: row.employee_supply_id,
            status: row.employee_supply_status ?? 'active',
            assignedAt: row.assigned_at ?? '',
            expiresAt: row.expires_at,
            notes: textOrNull(row.employee_supply_additions),
            employee: {
              employeeId: row.employee_id,
              employeeSlug: row.employee_slug ?? '',
              employeePhoto: textOrNull(row.employee_photo),
              name: fullName([
                row.employee_first_name,
                row.employee_last_name,
                row.employee_second_last_name,
              ]),
              positionName: textOrNull(row.position_name),
              departmentName: textOrNull(row.department_name),
              branchName: textOrNull(row.branch_name),
            },
          },
  }
}

export default class AssetsRepositoryMysql implements AssetsRepository {
  async list(filter: AssetListFilter): Promise<AssetListResponseDto> {
    const empty = { total: 0, perPage: filter.limit, currentPage: filter.page, lastPage: 1 }
    if (filter.businessUnitIds.length === 0) return { meta: empty, data: [] }

    // El total viaja en la misma consulta (ventana), así la página es una sola ida.
    const rows: AssetRow[] = await selectAssetColumns(filteredAssetQuery(filter))
      .select(db.raw('COUNT(*) OVER() as total_rows'))
      .orderBy('s.supply_name', 'asc')
      .orderBy('s.supply_id', 'asc')
      .limit(filter.limit)
      .offset((filter.page - 1) * filter.limit)

    // Página fuera de rango: sin filas no hay ventana y el total sale de un conteo.
    const total = rows.length > 0 ? Number(rows[0].total_rows ?? 0) : await countAssets(filter)

    return {
      meta: {
        total,
        perPage: filter.limit,
        currentPage: filter.page,
        lastPage: Math.max(1, Math.ceil(total / filter.limit)),
      },
      data: rows.map(toAssetItem),
    }
  }

  async summary(businessUnitIds: readonly number[], supplyTypeId?: number): Promise<AssetsSummaryDto> {
    if (businessUnitIds.length === 0) {
      return { inOperation: 0, assigned: 0, totalValue: 0, unassignedValue: 0 }
    }

    const query = db
      .from('supplies as s')
      .whereNull('s.supply_deleted_at')
      .whereIn('s.business_unit_id', [...businessUnitIds])
      .where('s.supply_status', 'active')
    if (supplyTypeId !== undefined) query.where('s.supply_type_id', supplyTypeId)

    const row: {
      in_operation: number | string | null
      assigned: number | string | null
      total_value: DecimalValue
      unassigned_value: DecimalValue
    } | null = await query
      .select(
        db.raw('COUNT(*) as in_operation'),
        db.raw(`COALESCE(SUM(${ACTIVE_ASSIGNMENT_ID_SQL} IS NOT NULL), 0) as assigned`),
        db.raw(`COALESCE(SUM(COALESCE(${CURRENT_VALUE_SQL}, 0)), 0) as total_value`),
        db.raw(
          `COALESCE(SUM(CASE WHEN ${ACTIVE_ASSIGNMENT_ID_SQL} IS NULL THEN COALESCE(${CURRENT_VALUE_SQL}, 0) ELSE 0 END), 0) as unassigned_value`
        )
      )
      .first()

    return {
      inOperation: Number(row?.in_operation ?? 0),
      assigned: Number(row?.assigned ?? 0),
      totalValue: toNumber(row?.total_value ?? 0) ?? 0,
      unassignedValue: toNumber(row?.unassigned_value ?? 0) ?? 0,
    }
  }

  async findById(
    businessUnitIds: readonly number[],
    supplyId: number
  ): Promise<AssetListItemDto | null> {
    if (businessUnitIds.length === 0) return null
    const row: AssetRow | null = await selectAssetColumns(
      baseAssetQuery(businessUnitIds).where('s.supply_id', supplyId)
    ).first()
    return row ? toAssetItem(row) : null
  }

  async findOwnership(
    businessUnitIds: readonly number[],
    supplyId: number
  ): Promise<AssetOwnership | null> {
    if (businessUnitIds.length === 0) return null
    const row: { supply_id: number; supply_type_id: number; business_unit_id: number | null } | null =
      await db
        .from('supplies')
        .where('supply_id', supplyId)
        .whereNull('supply_deleted_at')
        .whereIn('business_unit_id', [...businessUnitIds])
        .select('supply_id', 'supply_type_id', 'business_unit_id')
        .first()
    return row
      ? {
          supplyId: row.supply_id,
          supplyTypeId: row.supply_type_id,
          businessUnitId: row.business_unit_id,
        }
      : null
  }

  async findCharacteristicValues(
    supplyId: number,
    supplyTypeId: number
  ): Promise<AssetCharacteristicValueDto[]> {
    const rows: Array<{
      supplie_caracteristic_id: number
      supplie_caracteristic_name: string
      supplie_caracteristic_type: AssetCharacteristicType
      value: string | null
    }> = await db
      .from('supplie_caracteristics as sc')
      .leftJoin('supplie_caracteristic_values as scv', (join) => {
        join.on(
          'scv.supplie_caracteristic_value_id',
          '=',
          db.knexRawQuery(
            `(SELECT MAX(scv_inner.supplie_caracteristic_value_id)
                FROM supplie_caracteristic_values AS scv_inner
               WHERE scv_inner.supplie_caracteristic_id = sc.supplie_caracteristic_id
                 AND scv_inner.supplie_id = ?
                 AND scv_inner.supplie_caracteristic_value_deleted_at IS NULL)`,
            [supplyId]
          )
        )
      })
      .where('sc.supply_type_id', supplyTypeId)
      .whereNull('sc.supplie_caracteristic_deleted_at')
      .orderBy('sc.supplie_caracteristic_id', 'asc')
      .select(
        'sc.supplie_caracteristic_id',
        'sc.supplie_caracteristic_name',
        'sc.supplie_caracteristic_type',
        'scv.supplie_caracteristic_value_value as value'
      )

    return rows.map((row) => ({
      characteristicId: row.supplie_caracteristic_id,
      name: row.supplie_caracteristic_name,
      type: row.supplie_caracteristic_type,
      value: row.value,
    }))
  }

  async findAssignments(
    businessUnitIds: readonly number[],
    supplyId: number
  ): Promise<AssetAssignmentDto[]> {
    if (businessUnitIds.length === 0) return []

    const rows: Array<{
      employee_supply_id: number
      employee_supply_status: AssetAssignmentDto['status']
      employee_supply_additions: string | null
      employee_supply_retirement_reason: string | null
      assigned_at: string | null
      expires_at: string | null
      retirement_date: string | null
      employee_id: number
      employee_slug: string | null
      employee_photo: string | null
      employee_first_name: string | null
      employee_last_name: string | null
      employee_second_last_name: string | null
      position_name: string | null
    }> = await db
      .from('employee_supplies as es')
      .join('employees as e', 'e.employee_id', 'es.employee_id')
      .leftJoin('positions as p', (join) => {
        join.on('p.position_id', '=', 'e.position_id').andOnNull('p.position_deleted_at')
      })
      .where('es.supply_id', supplyId)
      .whereNull('es.employee_supply_deleted_at')
      .whereIn('es.business_unit_id', [...businessUnitIds])
      .orderByRaw(
        'COALESCE(es.employee_supply_assignament_date, es.employee_supply_created_at) DESC, es.employee_supply_id DESC'
      )
      .select(
        'es.employee_supply_id',
        'es.employee_supply_status',
        'es.employee_supply_additions',
        'es.employee_supply_retirement_reason',
        'e.employee_id',
        'e.employee_slug',
        'e.employee_photo',
        'e.employee_first_name',
        'e.employee_last_name',
        'e.employee_second_last_name',
        'p.position_name',
        calendarDate(
          'COALESCE(es.employee_supply_assignament_date, es.employee_supply_created_at)',
          'assigned_at'
        ),
        calendarDate('es.employee_supply_expiration_date', 'expires_at'),
        calendarDate('es.employee_supply_retirement_date', 'retirement_date')
      )
    if (rows.length === 0) return []

    const assignmentIds = rows.map((row) => row.employee_supply_id)
    const [contracts, photos] = await Promise.all([
      db
        .from('employee_supplies_response_contracts')
        .whereIn('employee_supply_id', assignmentIds)
        .whereNull('employee_supply_response_contract_deleted_at')
        .orderBy('employee_supply_response_contract_id', 'asc')
        .select(
          'employee_supply_response_contract_id',
          'employee_supply_id',
          'employee_supply_response_contract_file'
        ) as Promise<
        Array<{
          employee_supply_response_contract_id: number
          employee_supply_id: number
          employee_supply_response_contract_file: string | null
        }>
      >,
      db
        .from('employee_supplie_assignation_photos')
        .whereIn('employee_supply_id', assignmentIds)
        .whereNull('employee_supplie_assignation_photo_deleted_at')
        .orderBy('employee_supplie_assignation_photo_id', 'asc')
        .select(
          'employee_supplie_assignation_photo_id',
          'employee_supply_id',
          'employee_supplie_assignation_photo_type'
        ) as Promise<
        Array<{
          employee_supplie_assignation_photo_id: number
          employee_supply_id: number
          employee_supplie_assignation_photo_type: 'assignation' | 'return'
        }>
      >,
    ])

    return rows.map((row) => ({
      employeeSupplyId: row.employee_supply_id,
      status: row.employee_supply_status,
      assignedAt: row.assigned_at ?? '',
      expiresAt: row.expires_at,
      notes: textOrNull(row.employee_supply_additions),
      retirementReason: textOrNull(row.employee_supply_retirement_reason),
      retirementDate: row.retirement_date,
      employee: {
        employeeId: row.employee_id,
        employeeSlug: row.employee_slug ?? '',
        employeePhoto: textOrNull(row.employee_photo),
        name: fullName([row.employee_first_name, row.employee_last_name, row.employee_second_last_name]),
        positionName: textOrNull(row.position_name),
      },
      contracts: contracts
        .filter((contract) => contract.employee_supply_id === row.employee_supply_id)
        .map((contract) => ({
          id: contract.employee_supply_response_contract_id,
          fileName: storedFileBaseName(contract.employee_supply_response_contract_file),
        })),
      photos: photos
        .filter((photo) => photo.employee_supply_id === row.employee_supply_id)
        .map((photo) => ({
          photoId: photo.employee_supplie_assignation_photo_id,
          kind: photo.employee_supplie_assignation_photo_type,
        })),
    }))
  }

  async findValueHistory(supplyId: number): Promise<AssetValueHistoryEntryDto[]> {
    const rows: Array<{
      supply_value_history_id: number
      supply_value_history_current_value: DecimalValue
      supply_value_history_notes: string | null
      supply_value_history_created_at: Date | string
    }> = await db
      .from('supply_value_histories')
      .where('supply_id', supplyId)
      .whereNull('supply_value_history_deleted_at')
      .orderBy('supply_value_history_created_at', 'desc')
      .orderBy('supply_value_history_id', 'desc')
      .select(
        'supply_value_history_id',
        'supply_value_history_current_value',
        'supply_value_history_notes',
        'supply_value_history_created_at'
      )

    return rows.map((row) => ({
      supplyValueHistoryId: row.supply_value_history_id,
      amount: toNumber(row.supply_value_history_current_value) ?? 0,
      notes: textOrNull(row.supply_value_history_notes),
      recordedAt: toIsoString(row.supply_value_history_created_at),
    }))
  }

  async findTypes(businessUnitIds: readonly number[]): Promise<AssetTypeDto[]> {
    if (businessUnitIds.length === 0) return []

    const types: Array<{
      supply_type_id: number
      supply_type_name: string
      supply_type_slug: string
      supply_type_description: string | null
      supplies_count: number | string
    }> = await db
      .from('supply_types as st')
      .whereNull('st.supply_type_deleted_at')
      .whereIn('st.business_unit_id', [...businessUnitIds])
      .orderBy('st.supply_type_name', 'asc')
      .select(
        'st.supply_type_id',
        'st.supply_type_name',
        'st.supply_type_slug',
        'st.supply_type_description',
        db.raw(
          `(SELECT COUNT(*) FROM supplies AS s
             WHERE s.supply_type_id = st.supply_type_id
               AND s.supply_deleted_at IS NULL) as supplies_count`
        )
      )
    if (types.length === 0) return []

    const characteristics: Array<{
      supplie_caracteristic_id: number
      supply_type_id: number
      supplie_caracteristic_name: string
      supplie_caracteristic_type: AssetCharacteristicType
    }> = await db
      .from('supplie_caracteristics')
      .whereIn(
        'supply_type_id',
        types.map((type) => type.supply_type_id)
      )
      .whereNull('supplie_caracteristic_deleted_at')
      .orderBy('supplie_caracteristic_id', 'asc')
      .select(
        'supplie_caracteristic_id',
        'supply_type_id',
        'supplie_caracteristic_name',
        'supplie_caracteristic_type'
      )

    return types.map((type) => ({
      supplyTypeId: type.supply_type_id,
      name: type.supply_type_name,
      slug: type.supply_type_slug,
      description: textOrNull(type.supply_type_description),
      suppliesCount: Number(type.supplies_count),
      characteristics: characteristics
        .filter((characteristic) => characteristic.supply_type_id === type.supply_type_id)
        .map((characteristic) => ({
          characteristicId: characteristic.supplie_caracteristic_id,
          name: characteristic.supplie_caracteristic_name,
          type: characteristic.supplie_caracteristic_type,
        })),
    }))
  }

  /**
   * Un valor vivo por característica: actualiza el existente, crea el que
   * falta y borra (lógico) los que llegan vacíos o sobran. Todo en una
   * transacción.
   */
  async upsertCharacteristicValues(
    asset: AssetOwnership,
    values: readonly AssetCharacteristicValueWrite[]
  ): Promise<void> {
    if (values.length === 0) return
    const now = new Date()

    await db.transaction(async (trx) => {
      const existing: Array<{
        supplie_caracteristic_value_id: number
        supplie_caracteristic_id: number
      }> = await trx
        .from('supplie_caracteristic_values')
        .where('supplie_id', asset.supplyId)
        .whereIn(
          'supplie_caracteristic_id',
          values.map((value) => value.characteristicId)
        )
        .whereNull('supplie_caracteristic_value_deleted_at')
        .orderBy('supplie_caracteristic_value_id', 'desc')
        .select('supplie_caracteristic_value_id', 'supplie_caracteristic_id')

      for (const { characteristicId, value } of values) {
        const [keep, ...extra] = existing
          .filter((row) => row.supplie_caracteristic_id === characteristicId)
          .map((row) => row.supplie_caracteristic_value_id)
        const toDelete = value === null && keep !== undefined ? [keep, ...extra] : extra

        if (toDelete.length > 0) {
          await trx
            .from('supplie_caracteristic_values')
            .whereIn('supplie_caracteristic_value_id', toDelete)
            .update({ supplie_caracteristic_value_deleted_at: now })
        }
        if (value === null) continue

        if (keep !== undefined) {
          await trx
            .from('supplie_caracteristic_values')
            .where('supplie_caracteristic_value_id', keep)
            .update({
              supplie_caracteristic_value_value: value,
              supplie_caracteristic_value_updated_at: now,
            })
        } else {
          await trx.table('supplie_caracteristic_values').insert({
            supplie_caracteristic_id: characteristicId,
            supplie_id: asset.supplyId,
            business_unit_id: asset.businessUnitId,
            supplie_caracteristic_value_value: value,
            supplie_caracteristic_value_created_at: now,
            supplie_caracteristic_value_updated_at: now,
          })
        }
      }
    })
  }

  async findResponseContractFile(
    businessUnitIds: readonly number[],
    contractId: number
  ): Promise<AssetStoredFile | null> {
    if (businessUnitIds.length === 0) return null
    const row: { employee_supply_response_contract_id: number; stored_path: string | null } | null =
      await db
        .from('employee_supplies_response_contracts as rc')
        .join('employee_supplies as es', 'es.employee_supply_id', 'rc.employee_supply_id')
        .where('rc.employee_supply_response_contract_id', contractId)
        .whereNull('rc.employee_supply_response_contract_deleted_at')
        .whereNull('es.employee_supply_deleted_at')
        .whereIn('es.business_unit_id', [...businessUnitIds])
        .select(
          'rc.employee_supply_response_contract_id',
          'rc.employee_supply_response_contract_file as stored_path'
        )
        .first()
    return row ? { id: row.employee_supply_response_contract_id, storedPath: row.stored_path } : null
  }

  async findAssignationPhotoFile(
    businessUnitIds: readonly number[],
    photoId: number
  ): Promise<(AssetStoredFile & { kind: 'assignation' | 'return' }) | null> {
    if (businessUnitIds.length === 0) return null
    // La foto no lleva empresa propia: se acota por su resguardo, que sí.
    const row: {
      employee_supplie_assignation_photo_id: number
      stored_path: string | null
      kind: 'assignation' | 'return'
    } | null = await db
      .from('employee_supplie_assignation_photos as ph')
      .join('employee_supplies as es', 'es.employee_supply_id', 'ph.employee_supply_id')
      .where('ph.employee_supplie_assignation_photo_id', photoId)
      .whereNull('ph.employee_supplie_assignation_photo_deleted_at')
      .whereNull('es.employee_supply_deleted_at')
      .whereIn('es.business_unit_id', [...businessUnitIds])
      .select(
        'ph.employee_supplie_assignation_photo_id',
        'ph.employee_supplie_assignation_photo_file as stored_path',
        'ph.employee_supplie_assignation_photo_type as kind'
      )
      .first()
    return row
      ? { id: row.employee_supplie_assignation_photo_id, storedPath: row.stored_path, kind: row.kind }
      : null
  }
}

/**
 * Último segmento de la ruta guardada, sin query string; `null` si no hay
 * archivo (vacío o centinela de subida fallida).
 */
function storedFileBaseName(storedPath: string | null): string | null {
  if (isUploadFailureSentinel(storedPath)) return null
  const path = textOrNull(storedPath)?.split('?')[0]
  const name = path?.split('/').pop()
  return textOrNull(name)
}
