import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { getBusinessTimeZone } from '../utils/business_date.js'

// ─── Tipos de retorno (contrato fijado por USRH1789079078170) ────────────────

export type MilestoneKey =
  | 'estructura'
  | 'turnos'
  | 'empleado-con-turno'
  | 'acceso-app'
  | 'biometrico'
  | 'primera-checada-real'
  | 'expediente'

export interface TenantMilestone {
  /** Numeración heredada del checklist de puesta en marcha: 1,2,3,4,5,6,8. El 7 no aplica. */
  numero: 1 | 2 | 3 | 4 | 5 | 6 | 8
  clave: MilestoneKey
  /** Estado ACTUAL: solo registros vivos. */
  cumplido: boolean
  /** Primer cumplimiento, día civil `YYYY-MM-DD`, INCLUYENDO borrados lógicos. `null` si nunca. */
  fecha: string | null
}

/** Una fila cruda de cualquiera de las ocho consultas: fecha mínima (con borrados) y si hoy vive alguna. */
interface RawMilestoneRow {
  businessUnitId: number
  minFecha: unknown
  vivos: number | string
}

/**
 * Convierte un instante de BD (columna `DATETIME`/`TIMESTAMP`, decodificada
 * por el driver como `Date` ancla en UTC — `config/database.ts:15`,
 * `timezone: 'Z'`) a día civil de negocio `YYYY-MM-DD` (R18 del spec). A
 * diferencia de `toCalendarIsoDate()` (que ancla en UTC y NO corre el día),
 * aquí se necesita el día civil de México: un registro creado el 2 de
 * septiembre a las 20:00 CDMX (02:00 UTC del 3) debe reportar "2026-09-02",
 * no "03". Mismo patrón que `resolveSingleTrialOutcome()` para `paid_at`.
 */
function toBusinessCalendarDate(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) {
    return DateTime.fromJSDate(value, { zone: 'utc' }).setZone(getBusinessTimeZone()).toISODate()
  }
  if (DateTime.isDateTime(value)) {
    return value.setZone(getBusinessTimeZone()).toISODate()
  }
  const raw = String(value)
  const parsed = DateTime.fromSQL(raw, { zone: 'utc' })
  if (parsed.isValid) {
    return parsed.setZone(getBusinessTimeZone()).toISODate()
  }
  const iso = DateTime.fromISO(raw, { zone: 'utc' })
  return iso.isValid ? iso.setZone(getBusinessTimeZone()).toISODate() : null
}

function rowsToMilestoneMap(
  rows: RawMilestoneRow[],
  buIds: number[]
): Map<number, { fecha: string | null; cumplido: boolean }> {
  const map = new Map<number, { fecha: string | null; cumplido: boolean }>()
  for (const id of buIds) {
    map.set(id, { fecha: null, cumplido: false })
  }
  for (const row of rows) {
    // El `Map` se arma por la columna `business_unit_id` DEVUELTA, nunca por
    // índice del arreglo de entrada (RN-49 — el error que no se ve con un
    // solo tenant en el fixture).
    map.set(row.businessUnitId, {
      fecha: toBusinessCalendarDate(row.minFecha),
      cumplido: Number(row.vivos) > 0,
    })
  }
  return map
}

/**
 * Calcula los siete hitos de puesta en marcha de un lote de tenants
 * (USRH1789079078170). Ocho consultas fijas con Knex crudo (nunca Lucid: el
 * mixin de tenant es fail-open sin `TenantContext`, y desde `/api/platform/*`
 * nunca hay uno activo — §7 del spec), agregación condicional (fecha CON
 * borrados, estado SIN borrados en la misma consulta) y anti-join contra la
 * siembra demo del recorrido guiado para los hitos 1-4 (RN-19).
 *
 * `runUnscoped` NO se usa: con Knex crudo no hay filtro que desactivar, y el
 * universo siempre llega explícito por `businessUnitIds` — nunca se descubre
 * por cuenta propia (§7 del spec).
 */
export default class PlatformTenantMilestoneService {
  async resolveMilestones(businessUnitIds: number[]): Promise<Map<number, TenantMilestone[]>> {
    const result = new Map<number, TenantMilestone[]>()
    if (businessUnitIds.length === 0) {
      return result
    }

    const [departamentos, puestos, turnos, empleadoConTurno, accesoApp, biometrico, checada, expediente] =
      await Promise.all([
        this.queryDepartamentos(businessUnitIds),
        this.queryPuestos(businessUnitIds),
        this.queryTurnos(businessUnitIds),
        this.queryEmpleadoConTurno(businessUnitIds),
        this.queryAccesoApp(businessUnitIds),
        this.queryBiometrico(businessUnitIds),
        this.queryChecada(businessUnitIds),
        this.queryExpediente(businessUnitIds),
      ])

    const depMap = rowsToMilestoneMap(departamentos, businessUnitIds)
    const posMap = rowsToMilestoneMap(puestos, businessUnitIds)
    const turnosMap = rowsToMilestoneMap(turnos, businessUnitIds)
    const empleadoMap = rowsToMilestoneMap(empleadoConTurno, businessUnitIds)
    const accesoMap = rowsToMilestoneMap(accesoApp, businessUnitIds)
    const biometricoMap = rowsToMilestoneMap(biometrico, businessUnitIds)
    const checadaMap = rowsToMilestoneMap(checada, businessUnitIds)
    const expedienteMap = rowsToMilestoneMap(expediente, businessUnitIds)

    for (const buId of businessUnitIds) {
      const dep = depMap.get(buId)!
      const pos = posMap.get(buId)!

      // Hito 1 (RN-15): se cumple solo con los dos vivos; la fecha es la MÁS
      // TARDÍA entre el primer departamento y el primer puesto.
      const estructuraCumplido = dep.cumplido && pos.cumplido
      const fechas1 = [dep.fecha, pos.fecha].filter((f): f is string => f !== null)
      const estructuraFecha =
        fechas1.length === 2 ? (fechas1[0] > fechas1[1] ? fechas1[0] : fechas1[1]) : null

      const milestones: TenantMilestone[] = [
        { numero: 1, clave: 'estructura', cumplido: estructuraCumplido, fecha: estructuraFecha },
        { numero: 2, clave: 'turnos', cumplido: turnosMap.get(buId)!.cumplido, fecha: turnosMap.get(buId)!.fecha },
        {
          numero: 3,
          clave: 'empleado-con-turno',
          cumplido: empleadoMap.get(buId)!.cumplido,
          fecha: empleadoMap.get(buId)!.fecha,
        },
        {
          numero: 4,
          clave: 'acceso-app',
          cumplido: accesoMap.get(buId)!.cumplido,
          fecha: accesoMap.get(buId)!.fecha,
        },
        {
          numero: 5,
          clave: 'biometrico',
          cumplido: biometricoMap.get(buId)!.cumplido,
          fecha: biometricoMap.get(buId)!.fecha,
        },
        {
          numero: 6,
          clave: 'primera-checada-real',
          cumplido: checadaMap.get(buId)!.cumplido,
          fecha: checadaMap.get(buId)!.fecha,
        },
        {
          numero: 8,
          clave: 'expediente',
          cumplido: expedienteMap.get(buId)!.cumplido,
          fecha: expedienteMap.get(buId)!.fecha,
        },
      ]

      result.set(buId, milestones)
    }

    return result
  }

  // ─── Las ocho consultas fijas ──────────────────────────────────────────────

  /** Hito 1a — primer departamento propio (RN-19: excluye la siembra demo). */
  private async queryDepartamentos(buIds: number[]): Promise<RawMilestoneRow[]> {
    return db
      .from('departments as d')
      .leftJoin('onboarding_seeded_records as osr', (join) => {
        join
          .on('osr.onboarding_seeded_record_entity_id', 'd.department_id')
          .andOnVal('osr.onboarding_seeded_record_entity_type', 'department')
      })
      .whereIn('d.business_unit_id', buIds)
      .whereNull('osr.onboarding_seeded_record_id')
      .groupBy('d.business_unit_id')
      .select([
        'd.business_unit_id as businessUnitId',
        db.raw('MIN(d.department_created_at) as minFecha'),
        db.raw('MAX(CASE WHEN d.department_deleted_at IS NULL THEN 1 ELSE 0 END) as vivos'),
      ])
  }

  /** Hito 1b — primer puesto propio (RN-19). */
  private async queryPuestos(buIds: number[]): Promise<RawMilestoneRow[]> {
    return db
      .from('positions as p')
      .leftJoin('onboarding_seeded_records as osr', (join) => {
        join
          .on('osr.onboarding_seeded_record_entity_id', 'p.position_id')
          .andOnVal('osr.onboarding_seeded_record_entity_type', 'position')
      })
      .whereIn('p.business_unit_id', buIds)
      .whereNull('osr.onboarding_seeded_record_id')
      .groupBy('p.business_unit_id')
      .select([
        'p.business_unit_id as businessUnitId',
        db.raw('MIN(p.position_created_at) as minFecha'),
        db.raw('MAX(CASE WHEN p.position_deleted_at IS NULL THEN 1 ELSE 0 END) as vivos'),
      ])
  }

  /**
   * Hito 2 — primer turno propio (RN-19). `Shift` no compone `SoftDeletes`
   * (`app/models/shift.ts`): el `whereNull` de vida se escribe a mano contra
   * `shifts.shift_deleted_at`, que sí existe como columna física.
   */
  private async queryTurnos(buIds: number[]): Promise<RawMilestoneRow[]> {
    return db
      .from('shifts as s')
      .leftJoin('onboarding_seeded_records as osr', (join) => {
        join
          .on('osr.onboarding_seeded_record_entity_id', 's.shift_id')
          .andOnVal('osr.onboarding_seeded_record_entity_type', 'shift')
      })
      .whereIn('s.business_unit_id', buIds)
      .whereNull('osr.onboarding_seeded_record_id')
      .groupBy('s.business_unit_id')
      .select([
        's.business_unit_id as businessUnitId',
        db.raw('MIN(s.shift_created_at) as minFecha'),
        db.raw('MAX(CASE WHEN s.shift_deleted_at IS NULL THEN 1 ELSE 0 END) as vivos'),
      ])
  }

  /**
   * Hito 3 — primer empleado con turno asignado (RN-19). El typo real de
   * columna se copia tal cual: `employe_shifts_*` (no `employee_shifts_*`),
   * confirmado en `app/models/employee_shift.ts`.
   */
  private async queryEmpleadoConTurno(buIds: number[]): Promise<RawMilestoneRow[]> {
    return db
      .from('employee_shifts as es')
      .leftJoin('onboarding_seeded_records as osr', (join) => {
        join
          .on('osr.onboarding_seeded_record_entity_id', 'es.employee_shift_id')
          .andOnVal('osr.onboarding_seeded_record_entity_type', 'employee_shift')
      })
      .whereIn('es.business_unit_id', buIds)
      .whereNull('osr.onboarding_seeded_record_id')
      .groupBy('es.business_unit_id')
      .select([
        'es.business_unit_id as businessUnitId',
        db.raw('MIN(es.employe_shifts_created_at) as minFecha'),
        db.raw('MAX(CASE WHEN es.employe_shifts_deleted_at IS NULL THEN 1 ELSE 0 END) as vivos'),
      ])
  }

  /**
   * Hito 4 — acceso a la app (RN-16, RN-19, RN-49-CA-06). Corta por
   * `employees.business_unit_id`, NUNCA por `users` (tabla global: ahí viven
   * también los administradores de GSTI). Fecha = la MÁS TARDÍA entre el
   * alta del usuario y la del empleado ligado, por par, luego el mínimo entre
   * pares. El anti-join va contra el tipo `user` de la siembra demo.
   */
  private async queryAccesoApp(buIds: number[]): Promise<RawMilestoneRow[]> {
    const rows = await db
      .from('employees as e')
      .join('users as u', 'u.person_id', 'e.person_id')
      .leftJoin('onboarding_seeded_records as osr', (join) => {
        join
          .on('osr.onboarding_seeded_record_entity_id', 'u.user_id')
          .andOnVal('osr.onboarding_seeded_record_entity_type', 'user')
      })
      .whereIn('e.business_unit_id', buIds)
      .whereNull('osr.onboarding_seeded_record_id')
      .select([
        'e.business_unit_id as businessUnitId',
        'e.employee_created_at as employeeCreatedAt',
        'u.user_created_at as userCreatedAt',
        db.raw(
          'CASE WHEN e.employee_deleted_at IS NULL AND u.user_deleted_at IS NULL THEN 1 ELSE 0 END as vivo'
        ),
      ])

    // Agregación en TypeScript: la fecha por PAR es la más tardía entre
    // usuario y empleado; entre pares de la misma empresa, el mínimo.
    const byBu = new Map<number, { fechas: string[]; vivos: boolean }>()
    for (const row of rows as Array<{
      businessUnitId: number
      employeeCreatedAt: unknown
      userCreatedAt: unknown
      vivo: number | string
    }>) {
      const fechaEmpleado = toBusinessCalendarDate(row.employeeCreatedAt)
      const fechaUsuario = toBusinessCalendarDate(row.userCreatedAt)
      if (fechaEmpleado === null || fechaUsuario === null) continue
      const fechaPar = fechaEmpleado > fechaUsuario ? fechaEmpleado : fechaUsuario

      const acc = byBu.get(row.businessUnitId) ?? { fechas: [], vivos: false }
      acc.fechas.push(fechaPar)
      if (Number(row.vivo) > 0) acc.vivos = true
      byBu.set(row.businessUnitId, acc)
    }

    const result: RawMilestoneRow[] = []
    for (const [businessUnitId, acc] of byBu) {
      const minFecha = acc.fechas.length > 0 ? acc.fechas.reduce((a, b) => (a < b ? a : b)) : null
      result.push({ businessUnitId, minFecha, vivos: acc.vivos ? 1 : 0 })
    }
    return result
  }

  /**
   * Hito 5 — biométrico terminado (RN-17). Cuentan los tres `completed_*`.
   * La fecha sale de `employee_biometric_updated_at` (decisión declarada del
   * spec, R-3): es cota superior, nunca antecede al momento real. Columnas
   * enumeradas una por una — nunca `SELECT *` sobre datos biométricos
   * (`app/constants/sensitive_fields.ts:123`).
   */
  private async queryBiometrico(buIds: number[]): Promise<RawMilestoneRow[]> {
    const COMPLETED = ['completed_fingers', 'completed_face', 'completed_both']
    return db
      .from('employee_biometrics as eb')
      .whereIn('eb.business_unit_id', buIds)
      .whereIn('eb.employee_biometric_status', COMPLETED)
      .groupBy('eb.business_unit_id')
      .select([
        'eb.business_unit_id as businessUnitId',
        db.raw('MIN(eb.employee_biometric_updated_at) as minFecha'),
        db.raw(
          'MAX(CASE WHEN eb.employee_biometric_deleted_at IS NULL THEN 1 ELSE 0 END) as vivos'
        ),
      ])
  }

  /**
   * Hito 6 — primera checada con canal (RN-18). Fecha = `assist_punch_time_utc`
   * (nunca `assist_created_at` ni `assist_punch_time_origin`). Sin anti-join
   * (R-4): la siembra demo crea sus checadas sin canal (`assist_origin`
   * nulo), así que ya quedan fuera por el propio `whereNotNull`.
   */
  private async queryChecada(buIds: number[]): Promise<RawMilestoneRow[]> {
    return db
      .from('assists as a')
      .whereIn('a.business_unit_id', buIds)
      .whereNotNull('a.assist_origin')
      .groupBy('a.business_unit_id')
      .select([
        'a.business_unit_id as businessUnitId',
        db.raw('MIN(a.assist_punch_time_utc) as minFecha'),
        db.raw('MAX(CASE WHEN a.assist_deleted_at IS NULL THEN 1 ELSE 0 END) as vivos'),
      ])
  }

  /** Hito 8 — primer documento en el expediente. Sin anti-join: la siembra demo no crea expedientes. */
  private async queryExpediente(buIds: number[]): Promise<RawMilestoneRow[]> {
    return db
      .from('employee_proceeding_files as epf')
      .whereIn('epf.business_unit_id', buIds)
      .groupBy('epf.business_unit_id')
      .select([
        'epf.business_unit_id as businessUnitId',
        db.raw('MIN(epf.employee_proceeding_file_created_at) as minFecha'),
        db.raw(
          'MAX(CASE WHEN epf.employee_proceeding_file_deleted_at IS NULL THEN 1 ELSE 0 END) as vivos'
        ),
      ])
  }
}
