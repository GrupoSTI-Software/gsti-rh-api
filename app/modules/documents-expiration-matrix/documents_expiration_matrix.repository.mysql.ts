import db from '@adonisjs/lucid/services/db'
import type { DatabaseQueryBuilderContract } from '@adonisjs/lucid/types/querybuilder'
import { DateTime } from 'luxon'
import type {
  ExpirationMatrixFilter,
  ExpirationMatrixRecord,
  ExpirationMatrixRepository,
} from './documents_expiration_matrix.repository.js'
import type { ExpirationMatrixEmployeeOwnerDto } from './dto/documents_expiration_matrix.dto.js'

/** Columnas del empleado dueño, comunes a las fuentes de empleado. */
interface EmployeeOwnerRow {
  employee_id: number
  employee_slug: string | null
  employee_first_name: string | null
  employee_last_name: string | null
  employee_second_last_name: string | null
  employee_code: string | number | null
  position_name: string | null
  department_name: string | null
}

interface EmployeeFileRow extends EmployeeOwnerRow {
  employee_proceeding_file_id: number
  proceeding_file_type_name: string
  proceeding_file_name: string | null
  proceeding_file_path: string | null
  expires_at: string
}

interface EmployeeContractRow extends EmployeeOwnerRow {
  employee_contract_id: number
  employee_contract_folio: string | null
  employee_contract_file: string | null
  employee_contract_type_name: string | null
  expires_at: string
}

interface CompanyFileRow {
  system_setting_proceeding_file_id: number
  proceeding_file_type_id: number
  proceeding_file_type_name: string
  proceeding_file_name: string | null
  proceeding_file_path: string | null
  system_setting_trade_name: string | null
  business_unit_name: string | null
  expires_at: string
}

interface CertificationRow extends EmployeeOwnerRow {
  employee_certification_id: number
  certification_id: number
  certification_name: string
  certification_category_name: string | null
  employee_certification_document_url: string | null
  expires_at: string
}

interface RepseFolioRow {
  repse_registration_id: number
  repse_registration_folio: string
  repse_registration_constancia_storage_key: string | null
  repse_registration_constancia_file_name: string | null
  business_unit_name: string | null
  expires_at: string
}

interface ProviderFolioRow {
  proveedor_repse_id: number
  proveedor_repse_razon_social: string
  proveedor_repse_folio: string
  proveedor_repse_objeto_registrado: string | null
  expires_at: string
}

interface SupplyRow extends EmployeeOwnerRow {
  employee_supply_id: number
  supply_type_id: number | null
  supply_name: string
  supply_file_number: number | null
  supply_type_name: string | null
  employee_supply_response_contract_file: string | null
  expires_at: string
}

type QueryBuilder = DatabaseQueryBuilderContract

/** Columnas del empleado dueño con puesto y departamento por nombre. */
const EMPLOYEE_OWNER_COLUMNS = [
  'e.employee_id',
  'e.employee_slug',
  'e.employee_first_name',
  'e.employee_last_name',
  'e.employee_second_last_name',
  'e.employee_code',
  'p.position_name',
  'd.department_name',
] as const

/**
 * Fecha de calendario de una columna DATE o TIMESTAMP. La conexión está en
 * UTC, así que coincide con lo que `toCalendarIsoDate` lee de esas columnas.
 */
const calendarDate = (column: string) =>
  db.raw(`DATE_FORMAT(${column}, '%Y-%m-%d') as expires_at`)

/**
 * Límite superior exclusivo de la ventana: el día siguiente al horizonte.
 * Sirve igual para columnas DATE y TIMESTAMP (una fecha con hora del último
 * día queda dentro).
 */
function dayAfter(horizon: string): string {
  return DateTime.fromISO(horizon).plus({ days: 1 }).toISODate()!
}

/** Texto no vacío o `null`. */
function textOrNull(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text.length > 0 ? text : null
}

/**
 * Dueño empleado con el nombre de las columnas propias del empleado (no de
 * `person`: es el nombre con el que RH lo da de alta).
 */
function toEmployeeOwner(row: EmployeeOwnerRow): ExpirationMatrixEmployeeOwnerDto {
  const name = [row.employee_first_name, row.employee_last_name, row.employee_second_last_name]
    .map((part) => textOrNull(part))
    .filter((part): part is string => part !== null)
    .join(' ')

  return {
    kind: 'employee',
    employeeId: row.employee_id,
    employeeSlug: textOrNull(row.employee_slug),
    name,
    positionName: textOrNull(row.position_name),
    departmentName: textOrNull(row.department_name),
    employeeCode: textOrNull(row.employee_code),
  }
}

/**
 * Puesto y departamento por nombre. `leftJoin` con el borrado lógico en el ON:
 * un catálogo borrado deja el nombre en `null`, nunca saca al empleado.
 */
function joinEmployeeOrgChart(
  query: QueryBuilder,
  positionIdColumn: string,
  departmentIdColumn: string
): QueryBuilder {
  return query
    .leftJoin('positions as p', (join) => {
      join.on('p.position_id', '=', db.knexRawQuery(positionIdColumn)).andOnNull('p.position_deleted_at')
    })
    .leftJoin('departments as d', (join) => {
      join
        .on('d.department_id', '=', db.knexRawQuery(departmentIdColumn))
        .andOnNull('d.department_deleted_at')
    })
}

/**
 * Condición de "tope" sobre el vencimiento del registro más nuevo: lo sustituye
 * si vence después que el actual o no vence. Un registro nuevo que vence antes
 * no tapa al viejo (los dos siguen en la matriz).
 */
function expiresLaterOrNever(query: QueryBuilder, newerColumn: string, currentColumn: string): void {
  query.where((expiry) => {
    expiry.whereNull(newerColumn).orWhereColumn(newerColumn, '>', currentColumn)
  })
}

/**
 * Implementación MySQL. Cada fuente es UNA consulta con `db.from()` y joins.
 * Como `db.from()` no pasa por el mixin `withBusinessUnitScope`, el corte por
 * empresa es explícito (`businessUnitIds`) y falla cerrado: sin unidades, sin
 * resultados.
 *
 * Tope: en expediente de empleado y de empresa, contratos e insumos, un
 * registro no cuenta si otro vigente del mismo dueño y tipo, creado después
 * (id mayor), vence más tarde o no vence (`NOT EXISTS` dentro de la misma
 * consulta). Certificaciones ya toman el último cumplimiento por par; folios
 * REPSE propios y de proveedores no se tapan.
 */
export default class ExpirationMatrixRepositoryMysql implements ExpirationMatrixRepository {
  /** Expediente de empleado: mismo criterio que `EmployeeProceedingFileService.getExpiredAndExpiring`. */
  async findEmployeeFiles(filter: ExpirationMatrixFilter): Promise<ExpirationMatrixRecord[]> {
    if (filter.businessUnitIds.length === 0 || filter.departmentIds.length === 0) return []

    const query = db
      .from('employee_proceeding_files as epf')
      .join('proceeding_files as pf', 'pf.proceeding_file_id', 'epf.proceeding_file_id')
      .join('proceeding_file_types as pft', 'pft.proceeding_file_type_id', 'pf.proceeding_file_type_id')
      .join('employees as e', 'e.employee_id', 'epf.employee_id')
      .whereNull('epf.employee_proceeding_file_deleted_at')
      .whereNull('pf.proceeding_file_deleted_at')
      .where('pf.proceeding_file_active', 1)
      .whereNull('pft.proceeding_file_type_deleted_at')
      .where('pft.proceeding_file_type_area_to_use', 'employee')
      .whereNull('e.employee_deleted_at')
      .whereIn('e.business_unit_id', [...filter.businessUnitIds])
      .whereIn('e.department_id', [...filter.departmentIds])
      .where('pf.proceeding_file_expiration_at', '<', dayAfter(filter.horizon))
      // Tope: un expediente más nuevo del mismo tipo para el empleado lo sustituye.
      .whereNotExists((newer) => {
        newer
          .from('employee_proceeding_files as epf_new')
          .join('proceeding_files as pf_new', 'pf_new.proceeding_file_id', 'epf_new.proceeding_file_id')
          .whereColumn('epf_new.employee_id', 'epf.employee_id')
          .whereColumn('pf_new.proceeding_file_type_id', 'pf.proceeding_file_type_id')
          .whereColumn('epf_new.employee_proceeding_file_id', '>', 'epf.employee_proceeding_file_id')
          .whereNull('epf_new.employee_proceeding_file_deleted_at')
          .whereNull('pf_new.proceeding_file_deleted_at')
          .where('pf_new.proceeding_file_active', 1)
          .select(db.raw('1'))
        expiresLaterOrNever(newer, 'pf_new.proceeding_file_expiration_at', 'pf.proceeding_file_expiration_at')
      })
    joinEmployeeOrgChart(query, 'e.position_id', 'e.department_id')
    if (filter.id !== undefined) {
      query.where('epf.employee_proceeding_file_id', filter.id)
    }

    const rows: EmployeeFileRow[] = await query.select(
      'epf.employee_proceeding_file_id',
      'pft.proceeding_file_type_name',
      'pf.proceeding_file_name',
      'pf.proceeding_file_path',
      ...EMPLOYEE_OWNER_COLUMNS,
      calendarDate('pf.proceeding_file_expiration_at')
    )

    return rows.map((row) => ({
      source: 'employee-file',
      id: row.employee_proceeding_file_id,
      documentName: textOrNull(row.proceeding_file_type_name),
      reference: textOrNull(row.proceeding_file_name),
      expiresAt: row.expires_at,
      owner: toEmployeeOwner(row),
      storedPath: textOrNull(row.proceeding_file_path),
      storedFileName: textOrNull(row.proceeding_file_name),
    }))
  }

  /**
   * Contratos activos con fin en ventana. Puesto y departamento del contrato;
   * si el contrato no los trae, los del empleado.
   */
  async findEmployeeContracts(filter: ExpirationMatrixFilter): Promise<ExpirationMatrixRecord[]> {
    if (filter.businessUnitIds.length === 0 || filter.departmentIds.length === 0) return []

    const query = db
      .from('employee_contracts as ec')
      .join('employees as e', 'e.employee_id', 'ec.employee_id')
      .leftJoin('employee_contract_types as ect', (join) => {
        join
          .on('ect.employee_contract_type_id', '=', 'ec.employee_contract_type_id')
          .andOnNull('ect.employee_contract_type_deleted_at')
      })
      .whereNull('ec.employee_contract_deleted_at')
      .where('ec.employee_contract_active', 1)
      .whereNull('e.employee_deleted_at')
      .whereIn('e.business_unit_id', [...filter.businessUnitIds])
      .whereIn('e.department_id', [...filter.departmentIds])
      .where('ec.employee_contract_end_date', '<', dayAfter(filter.horizon))
      // Tope: un contrato activo más nuevo del empleado (de cualquier tipo) lo
      // sustituye; sin fecha de fin es indefinido y también sustituye.
      .whereNotExists((newer) => {
        newer
          .from('employee_contracts as ec_new')
          .whereColumn('ec_new.employee_id', 'ec.employee_id')
          .whereColumn('ec_new.employee_contract_id', '>', 'ec.employee_contract_id')
          .whereNull('ec_new.employee_contract_deleted_at')
          .where('ec_new.employee_contract_active', 1)
          .select(db.raw('1'))
        expiresLaterOrNever(newer, 'ec_new.employee_contract_end_date', 'ec.employee_contract_end_date')
      })
    joinEmployeeOrgChart(
      query,
      'COALESCE(ec.position_id, e.position_id)',
      'COALESCE(ec.department_id, e.department_id)'
    )
    if (filter.id !== undefined) {
      query.where('ec.employee_contract_id', filter.id)
    }

    const rows: EmployeeContractRow[] = await query.select(
      'ec.employee_contract_id',
      'ec.employee_contract_folio',
      'ec.employee_contract_file',
      'ect.employee_contract_type_name',
      ...EMPLOYEE_OWNER_COLUMNS,
      calendarDate('ec.employee_contract_end_date')
    )

    return rows.map((row) => ({
      source: 'employee-contract',
      id: row.employee_contract_id,
      documentName: textOrNull(row.employee_contract_type_name),
      reference: textOrNull(row.employee_contract_folio),
      expiresAt: row.expires_at,
      owner: toEmployeeOwner(row),
      storedPath: textOrNull(row.employee_contract_file),
      storedFileName: null,
    }))
  }

  /**
   * Expediente de la empresa: el de la ficha activa (`system_settings`) de la
   * unidad de negocio de la petición. Mismo criterio que
   * `SystemSettingProceedingFileService.getExpiredAndExpiringBySystemSetting`.
   */
  async findCompanyFiles(filter: ExpirationMatrixFilter): Promise<ExpirationMatrixRecord[]> {
    if (filter.businessUnitIds.length === 0) return []

    const query = db
      .from('system_setting_proceeding_files as sspf')
      .join('system_settings as ss', 'ss.system_setting_id', 'sspf.system_setting_id')
      .join('proceeding_files as pf', 'pf.proceeding_file_id', 'sspf.proceeding_file_id')
      .join('proceeding_file_types as pft', 'pft.proceeding_file_type_id', 'pf.proceeding_file_type_id')
      .leftJoin('business_units as bu', 'bu.business_unit_id', 'ss.business_unit_id')
      .whereNull('sspf.system_setting_proceeding_file_deleted_at')
      .whereNull('ss.system_setting_deleted_at')
      .where('ss.system_setting_active', 1)
      .whereIn('ss.business_unit_id', [...filter.businessUnitIds])
      .whereNull('pf.proceeding_file_deleted_at')
      .whereNull('pft.proceeding_file_type_deleted_at')
      .where('pft.proceeding_file_type_area_to_use', 'system-setting')
      .where('pf.proceeding_file_expiration_at', '<', dayAfter(filter.horizon))
      // Tope: un expediente más nuevo del mismo tipo en la misma ficha lo sustituye.
      .whereNotExists((newer) => {
        newer
          .from('system_setting_proceeding_files as sspf_new')
          .join('proceeding_files as pf_new', 'pf_new.proceeding_file_id', 'sspf_new.proceeding_file_id')
          .whereColumn('sspf_new.system_setting_id', 'sspf.system_setting_id')
          .whereColumn('pf_new.proceeding_file_type_id', 'pf.proceeding_file_type_id')
          .whereColumn(
            'sspf_new.system_setting_proceeding_file_id',
            '>',
            'sspf.system_setting_proceeding_file_id'
          )
          .whereNull('sspf_new.system_setting_proceeding_file_deleted_at')
          .whereNull('pf_new.proceeding_file_deleted_at')
          .select(db.raw('1'))
        expiresLaterOrNever(newer, 'pf_new.proceeding_file_expiration_at', 'pf.proceeding_file_expiration_at')
      })
    if (filter.id !== undefined) {
      query.where('sspf.system_setting_proceeding_file_id', filter.id)
    }

    const rows: CompanyFileRow[] = await query.select(
      'sspf.system_setting_proceeding_file_id',
      'pft.proceeding_file_type_id',
      'pft.proceeding_file_type_name',
      'pf.proceeding_file_name',
      'pf.proceeding_file_path',
      'ss.system_setting_trade_name',
      'bu.business_unit_name',
      calendarDate('pf.proceeding_file_expiration_at')
    )

    return rows.map((row) => {
      const tradeName = textOrNull(row.system_setting_trade_name)
      const unitName = textOrNull(row.business_unit_name)
      const name = tradeName ?? unitName ?? ''
      return {
        source: 'company-file',
        id: row.system_setting_proceeding_file_id,
        targetId: row.proceeding_file_type_id,
        documentName: textOrNull(row.proceeding_file_type_name),
        reference: textOrNull(row.proceeding_file_name),
        expiresAt: row.expires_at,
        owner: {
          kind: 'company',
          name,
          detail: unitName !== null && unitName !== name ? unitName : null,
        },
        storedPath: textOrNull(row.proceeding_file_path),
        storedFileName: textOrNull(row.proceeding_file_name),
      }
    })
  }

  /**
   * Última certificación por par empleado-certificación (misma regla que
   * `EmployeeCertificationExpirationService.getExpiredAndExpiring`), pero el
   * puesto borrado no saca al empleado: su condición va en el ON del join.
   */
  async findCertifications(filter: ExpirationMatrixFilter): Promise<ExpirationMatrixRecord[]> {
    if (filter.businessUnitIds.length === 0 || filter.departmentIds.length === 0) return []

    const latestIds = db
      .from('employee_certifications as ec_inner')
      .whereNull('ec_inner.employee_certification_deleted_at')
      .whereNotNull('ec_inner.employee_certification_expires_at')
      .groupBy('ec_inner.employee_id', 'ec_inner.certification_id')
      .select(db.raw('MAX(ec_inner.employee_certification_id)'))

    const query = db
      .from('employee_certifications as ec')
      .join('employees as e', 'e.employee_id', 'ec.employee_id')
      .join('certifications as c', 'c.certification_id', 'ec.certification_id')
      .leftJoin('certification_categories as cc', 'cc.certification_category_id', 'c.category_id')
      .whereIn('ec.employee_certification_id', latestIds)
      .whereNull('ec.employee_certification_deleted_at')
      .whereNull('e.employee_deleted_at')
      .whereIn('e.business_unit_id', [...filter.businessUnitIds])
      .whereIn('e.department_id', [...filter.departmentIds])
      .where('ec.employee_certification_expires_at', '<', dayAfter(filter.horizon))
    joinEmployeeOrgChart(query, 'e.position_id', 'e.department_id')
    if (filter.id !== undefined) {
      query.where('ec.employee_certification_id', filter.id)
    }

    const rows: CertificationRow[] = await query.select(
      'ec.employee_certification_id',
      'ec.certification_id',
      'ec.employee_certification_document_url',
      'c.certification_name',
      'cc.certification_category_name',
      ...EMPLOYEE_OWNER_COLUMNS,
      calendarDate('ec.employee_certification_expires_at')
    )

    return rows.map((row) => ({
      source: 'certification',
      id: row.employee_certification_id,
      targetId: row.certification_id,
      documentName: textOrNull(row.certification_name),
      reference: textOrNull(row.certification_category_name),
      expiresAt: row.expires_at,
      owner: toEmployeeOwner(row),
      storedPath: textOrNull(row.employee_certification_document_url),
      storedFileName: null,
    }))
  }

  /** Folio REPSE propio: registros activos de las unidades permitidas. */
  async findRepseFolios(filter: ExpirationMatrixFilter): Promise<ExpirationMatrixRecord[]> {
    if (filter.businessUnitIds.length === 0) return []

    const query = db
      .from('repse_registrations as rr')
      .leftJoin('business_units as bu', 'bu.business_unit_id', 'rr.business_unit_id')
      .whereNull('rr.repse_registration_deleted_at')
      .where('rr.repse_registration_status', 'active')
      .whereIn('rr.business_unit_id', [...filter.businessUnitIds])
      .where('rr.repse_registration_expires_at', '<', dayAfter(filter.horizon))
    if (filter.id !== undefined) {
      query.where('rr.repse_registration_id', filter.id)
    }

    const rows: RepseFolioRow[] = await query.select(
      'rr.repse_registration_id',
      'rr.repse_registration_folio',
      'rr.repse_registration_constancia_storage_key',
      'rr.repse_registration_constancia_file_name',
      'bu.business_unit_name',
      calendarDate('rr.repse_registration_expires_at')
    )

    return rows.map((row) => ({
      source: 'repse-folio',
      id: row.repse_registration_id,
      documentName: null,
      reference: textOrNull(row.repse_registration_folio),
      expiresAt: row.expires_at,
      owner: { kind: 'company', name: textOrNull(row.business_unit_name) ?? '', detail: null },
      storedPath: textOrNull(row.repse_registration_constancia_storage_key),
      storedFileName: textOrNull(row.repse_registration_constancia_file_name),
    }))
  }

  /** Folio de proveedores REPSE (lado contratante) del tenant. No tiene archivo. */
  async findProviderFolios(filter: ExpirationMatrixFilter): Promise<ExpirationMatrixRecord[]> {
    if (filter.businessUnitIds.length === 0) return []

    const query = db
      .from('proveedores_repse as pr')
      .whereNull('pr.proveedor_repse_deleted_at')
      .whereIn('pr.business_unit_id', [...filter.businessUnitIds])
      .where('pr.proveedor_repse_folio_vencimiento', '<', dayAfter(filter.horizon))
    if (filter.id !== undefined) {
      query.where('pr.proveedor_repse_id', filter.id)
    }

    const rows: ProviderFolioRow[] = await query.select(
      'pr.proveedor_repse_id',
      'pr.proveedor_repse_razon_social',
      'pr.proveedor_repse_folio',
      'pr.proveedor_repse_objeto_registrado',
      calendarDate('pr.proveedor_repse_folio_vencimiento')
    )

    return rows.map((row) => ({
      source: 'provider-folio',
      id: row.proveedor_repse_id,
      documentName: null,
      reference: textOrNull(row.proveedor_repse_folio),
      expiresAt: row.expires_at,
      owner: {
        kind: 'provider',
        providerId: row.proveedor_repse_id,
        name: textOrNull(row.proveedor_repse_razon_social) ?? '',
        detail: textOrNull(row.proveedor_repse_objeto_registrado),
      },
      storedPath: null,
      storedFileName: null,
    }))
  }

  /**
   * Insumos asignados activos con vencimiento en ventana. El archivo es el
   * resguardo más reciente (`employee_supplies_response_contracts`), resuelto
   * con un join a su id máximo por asignación: sin consulta por insumo.
   */
  async findSupplies(filter: ExpirationMatrixFilter): Promise<ExpirationMatrixRecord[]> {
    if (filter.businessUnitIds.length === 0 || filter.departmentIds.length === 0) return []

    /** Resguardo vigente: el de id más alto no borrado de la asignación. */
    const latestResponseContractId = db.knexRawQuery(
      `(SELECT MAX(rc_inner.employee_supply_response_contract_id)
        FROM employee_supplies_response_contracts AS rc_inner
        WHERE rc_inner.employee_supply_id = es.employee_supply_id
          AND rc_inner.employee_supply_response_contract_deleted_at IS NULL)`
    )

    const query = db
      .from('employee_supplies as es')
      .join('supplies as s', 's.supply_id', 'es.supply_id')
      .join('employees as e', 'e.employee_id', 'es.employee_id')
      .leftJoin('supply_types as st', (join) => {
        join.on('st.supply_type_id', '=', 's.supply_type_id').andOnNull('st.supply_type_deleted_at')
      })
      .leftJoin('employee_supplies_response_contracts as rc', (join) => {
        join.on('rc.employee_supply_response_contract_id', '=', latestResponseContractId)
      })
      .whereNull('es.employee_supply_deleted_at')
      .where('es.employee_supply_status', 'active')
      .whereNull('s.supply_deleted_at')
      .whereNull('e.employee_deleted_at')
      .whereIn('es.business_unit_id', [...filter.businessUnitIds])
      .whereIn('e.business_unit_id', [...filter.businessUnitIds])
      .whereIn('e.department_id', [...filter.departmentIds])
      .where('es.employee_supply_expiration_date', '<', dayAfter(filter.horizon))
      // Tope: una asignación activa más nueva del mismo tipo de insumo al
      // empleado la sustituye.
      .whereNotExists((newer) => {
        newer
          .from('employee_supplies as es_new')
          .join('supplies as s_new', 's_new.supply_id', 'es_new.supply_id')
          .whereColumn('es_new.employee_id', 'es.employee_id')
          // El mismo insumo, no el mismo tipo: dos activos del mismo tipo
          // (dos laptops) son legítimos y no se tapan entre sí.
          .whereColumn('es_new.supply_id', 'es.supply_id')
          .whereColumn('es_new.employee_supply_id', '>', 'es.employee_supply_id')
          .whereNull('es_new.employee_supply_deleted_at')
          .where('es_new.employee_supply_status', 'active')
          .whereNull('s_new.supply_deleted_at')
          .select(db.raw('1'))
        expiresLaterOrNever(
          newer,
          'es_new.employee_supply_expiration_date',
          'es.employee_supply_expiration_date'
        )
      })
    joinEmployeeOrgChart(query, 'e.position_id', 'e.department_id')
    if (filter.id !== undefined) {
      query.where('es.employee_supply_id', filter.id)
    }

    const rows: SupplyRow[] = await query.select(
      'es.employee_supply_id',
      'st.supply_type_id',
      's.supply_name',
      's.supply_file_number',
      'st.supply_type_name',
      'rc.employee_supply_response_contract_file',
      ...EMPLOYEE_OWNER_COLUMNS,
      calendarDate('es.employee_supply_expiration_date')
    )

    return rows.map((row) => {
      const supplyName = textOrNull(row.supply_name)
      const typeName = textOrNull(row.supply_type_name)
      return {
        source: 'supply',
        id: row.employee_supply_id,
        // Tipo vigente del insumo: con el tipo dado de baja no hay a dónde abrir.
        targetId: row.supply_type_id ?? undefined,
        documentName: supplyName && typeName ? `${supplyName} (${typeName})` : supplyName,
        reference: textOrNull(row.supply_file_number),
        expiresAt: row.expires_at,
        owner: toEmployeeOwner(row),
        storedPath: textOrNull(row.employee_supply_response_contract_file),
        storedFileName: null,
      }
    })
  }
}
