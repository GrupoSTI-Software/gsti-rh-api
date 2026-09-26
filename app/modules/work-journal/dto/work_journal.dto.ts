/**
 * DTOs y tipos del módulo de registro electrónico de jornada (work journal).
 * La API usa camelCase; el mapeo a columnas prefijadas lo hace el modelo/servicio.
 */

/** Cuerpo del sellado de un periodo (POST /seal). Opción A del spec: rango dado. */
export interface SealPeriodInput {
  /** Inicio del periodo de nómina (YYYY-MM-DD). */
  from: string
  /** Fin del periodo de nómina (YYYY-MM-DD), inclusivo. */
  to: string
  /**
   * Empleados a sellar. Si se omite, se sellan todos los de la empresa en scope.
   * Se filtra siempre contra el scope de la empresa (nunca cruza tenant).
   */
  employeeIds?: number[]
}

/** Parámetros de la verificación de integridad (GET /verify). */
export interface VerifyPeriodInput {
  from: string
  to: string
  employeeId?: number
}

/** Jornada de un día ya materializada desde el cálculo de asistencia vigente. */
export interface MaterializedDay {
  employeeId: number
  date: string
  checkIn: string | null
  checkOut: string | null
  workedMinutes: number | null
  dayStatus: string
  shiftId: number | null
}

/** Item de falla/omisión del sellado (día ya cerrado, sin datos o error). */
export interface SealFailure {
  employeeId: number
  date: string | null
  reason: string
}

/**
 * Resultado agregado del sellado (contrato §10 del spec):
 *  - `sealed`: días recién sellados.
 *  - `skipped`: días omitidos por estar ya cerrados (inmutables).
 *  - `failed`: días que no se pudieron sellar, con su motivo.
 */
export interface SealResult {
  sealed: number
  skipped: number
  failed: SealFailure[]
}

/** Entrada reportada como alterada por la verificación. */
export interface InvalidEntry {
  workJournalEntryId: number
  employeeId: number
  date: string
  /** Marca de integridad para el cliente (contrato §5/§6). */
  key: 'integridad-invalida'
  code: string
}

/**
 * Resultado de la verificación de integridad (contrato §10 del spec):
 *  - `checked`: entradas cerradas verificadas.
 *  - `valid`: cuántas conservan su sello íntegro.
 *  - `invalid`: entradas cuyo sello no cuadra (alteradas).
 */
export interface VerifyResult {
  checked: number
  valid: number
  invalid: InvalidEntry[]
}
