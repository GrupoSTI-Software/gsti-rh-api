/**
 * Clave de semana ISO (año + número de semana).
 */
export interface IsoWeekKey {
  isoYear: number
  isoWeek: number
}

/**
 * Parámetros de una corrida de backfill histórico.
 */
export interface PayrollOvertimeBackfillOptions {
  /** Fecha inicial del rango (YYYY-MM-DD). */
  from: string
  /** Fecha final del rango (YYYY-MM-DD). */
  to: string
  /** Empresa de nómina a procesar; omitir para todas las que tengan empleados. */
  payrollBusinessUnitId?: number
  /** Si es true, calcula sin persistir en `overtime_weekly_details`. */
  dryRun?: boolean
}

/**
 * Contadores auditable de una corrida de backfill.
 * Se imprimen al terminar el comando y quedan en el log del servidor.
 */
export interface PayrollOvertimeBackfillSummary {
  /** Empresas de nómina recorridas en la corrida. */
  payrollBusinessUnits: number
  /** Empleados que completaron el pipeline (con o sin semanas a persistir). */
  employeesProcessed: number
  /** Empleados elegibles sin `payrollBusinessUnitId` (referencia global del tenant). */
  employeesSkippedNoPayroll: number
  /** Empleados con jornada no resuelta en al menos un día con HE. */
  employeesSkippedUnresolved: number
  /** Filas de detalle semanal generadas o que se persistirían (dry-run). */
  weeksPersisted: number
  /** Minutos acumulados al doble en todo el rango. */
  totalDoubleMinutes: number
  /** Minutos acumulados al triple en todo el rango. */
  totalTripleMinutes: number
  /** Equivalente en horas (2 decimales) de `totalDoubleMinutes`. */
  totalDoubleHours: number
  /** Equivalente en horas (2 decimales) de `totalTripleMinutes`. */
  totalTripleHours: number
  /** Errores no recuperables por empleado. */
  errors: number
  /** Marca de tiempo ISO al cerrar la corrida (trazabilidad). */
  finishedAt: string
}

/**
 * Parámetros de una corrida de reversión (soft delete).
 */
export interface PayrollOvertimeRevertOptions {
  from: string
  to: string
  payrollBusinessUnitId?: number
  dryRun?: boolean
}

/**
 * Contadores auditable de una corrida de reversión.
 */
export interface PayrollOvertimeRevertSummary {
  /** Empresas de nómina afectadas. */
  payrollBusinessUnits: number
  /** Registros soft-deleted o que se revertirían (dry-run). */
  recordsReverted: number
  /** Semanas ISO que intersectan el rango `--from`/`--to`. */
  isoWeeksInRange: number
  errors: number
  finishedAt: string
}

/**
 * Línea JSON de auditoría para grep en logs (sin tabla de bitácora en BD).
 */
export interface PayrollOvertimeBackfillAuditRecord {
  command: 'overtime:backfill-weekly'
  mode: 'backfill' | 'revert'
  from: string
  to: string
  payrollBusinessUnitId: number | null
  dryRun: boolean
  finishedAt: string
  summary: PayrollOvertimeBackfillSummary | PayrollOvertimeRevertSummary
}
