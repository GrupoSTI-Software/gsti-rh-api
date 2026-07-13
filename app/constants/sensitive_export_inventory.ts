import type { SensitiveField } from '#constants/sensitive_fields'

/**
 * Alcance de la exportación respecto a titulares.
 *
 * - `mass`   — archivo con datos de múltiples trabajadores (objetivo principal de la HU).
 * - `single` — un solo titular; fuera del foco masivo pero con campos sensibles en archivo.
 */
export type SensitiveExportScope = 'mass' | 'single'

export type SensitiveExportFormat = 'xlsx' | 'pdf' | 'csv'

/**
 * Referencia a un campo del catálogo `SENSITIVE_FIELDS` incluido en el archivo generado.
 */
export interface SensitiveExportColumnRef {
  readonly model: SensitiveField['model']
  readonly column: SensitiveField['column']
}

/**
 * Descriptor de una vía de exportación validada contra el código.
 *
 * Fuente: inventario E1 USRH1783029947540 — grep de rutas + lectura de
 * controllers/services (2026-07-06, rama actual).
 */
export interface SensitiveExportDefinition {
  /** Identificador estable para la bitácora (`export_key`). */
  readonly exportKey: string
  readonly httpMethod: 'GET' | 'POST'
  readonly route: string
  readonly controller: string
  readonly action: string
  readonly format: SensitiveExportFormat
  readonly scope: SensitiveExportScope
  /**
   * Condición bajo la cual el archivo incluye valores sensibles.
   * Si se omite, siempre incluye los campos listados al ejecutar el endpoint.
   */
  readonly activationCondition?: string
  /** Campos del catálogo que el archivo escribe en claro hoy. */
  readonly sensitiveColumns: readonly SensitiveExportColumnRef[]
  /**
   * `true` = revisado y descartado: no requiere motivo ni asiento en este corte.
   */
  readonly excluded: boolean
  readonly excludedReason?: string
  /** Notas de validación (diferencias vs inventario preliminar del spec). */
  readonly validationNotes?: string
}

/**
 * Inventario definitivo de exportaciones con campos del catálogo `SENSITIVE_FIELDS`.
 *
 * Criterio de inclusión: el endpoint genera un archivo (Excel/CSV/PDF) que escribe
 * al menos un valor sensible del catálogo, no solo encabezados vacíos.
 *
 * Delta vs preliminar del spec (2026-07-02):
 *   - Confirmados en alcance masivo: 4 (empleados x2, registro traumático, lactancia).
 *   - Descartados: quejas, excepciones de turno, REPSE.
 *   - Hallazgo nuevo: plantilla de importación con `fillWithExisting=true`.
 *   - Hallazgo single: escrito PDF de un evento traumático (fuera de “masiva”).
 *   - Corrección: registro traumático y lactancia exportan `personCurp`; las notas
 *     de salud del periodo de lactancia NO salen en el PDF (regla de seguridad del servicio).
 */
export const SENSITIVE_EXPORT_INVENTORY: readonly SensitiveExportDefinition[] = [
  // ─── EN ALCANCE (masivo) ───────────────────────────────────────────────────
  {
    exportKey: 'employees-list-xlsx',
    httpMethod: 'GET',
    route: '/api/employee-generate-excel',
    controller: 'employee_controller',
    action: 'getExcel',
    format: 'xlsx',
    scope: 'mass',
    sensitiveColumns: [
      { model: 'Person', column: 'personPhone' },
      { model: 'Person', column: 'personCurp' },
      { model: 'Person', column: 'personRfc' },
      { model: 'Person', column: 'personImssNss' },
    ],
    excluded: false,
    validationNotes:
      'Preliminar citaba CURP/RFC; el código también exporta teléfono y NSS vía addHeadRow (employee_controller.ts:4108-4177).',
  },
  {
    exportKey: 'employees-import-template-xlsx',
    httpMethod: 'GET',
    route: '/api/template-excel',
    controller: 'employee_controller',
    action: 'getTemplateExcel',
    format: 'xlsx',
    scope: 'mass',
    activationCondition: 'query fillWithExisting=true (plantilla con datos existentes)',
    sensitiveColumns: [
      { model: 'Person', column: 'personCurp' },
      { model: 'Person', column: 'personRfc' },
      { model: 'Person', column: 'personImssNss' },
      { model: 'Person', column: 'personEmail' },
      { model: 'Person', column: 'personPhone' },
      { model: 'EmployeeEmergencyContact', column: 'employeeEmergencyContactPhone' },
    ],
    excluded: false,
    validationNotes:
      'No estaba en el preliminar. Sin fillWithExisting solo hay encabezados — fuera de alcance en ese caso (regla 4).',
  },
  {
    exportKey: 'traumatic-events-registry-pdf',
    httpMethod: 'GET',
    route: '/api/traumatic-event-reports/registry/export',
    controller: 'traumatic_event_report_controller',
    action: 'registryExport',
    format: 'pdf',
    scope: 'mass',
    sensitiveColumns: [{ model: 'Person', column: 'personCurp' }],
    excluded: false,
    validationNotes:
      'El PDF masivo NO incluye traumaticEventReportDescription ni traumaticEventReportInvolvedPeople; solo CURP por tarjeta (traumatic_event_registry_report_service.ts:597).',
  },
  {
    exportKey: 'lactation-compliance-pdf',
    httpMethod: 'GET',
    route: '/api/employee-lactation-periods/compliance-report/export',
    controller: 'employee_lactation_periods_controller',
    action: 'complianceReportExport',
    format: 'pdf',
    scope: 'mass',
    sensitiveColumns: [{ model: 'Person', column: 'personCurp' }],
    excluded: false,
    validationNotes:
      'employeeLactationPeriodNotes se excluye deliberadamente del PDF (employee_lactation_compliance_report_service.ts:91-100).',
  },

  // ─── FUERA DE ALCANCE MASIVO (single) — decisión pendiente de producto ───────
  {
    exportKey: 'traumatic-event-document-pdf',
    httpMethod: 'GET',
    route: '/api/traumatic-event-reports/:reportId/printable-document',
    controller: 'traumatic_event_report_controller',
    action: 'printableDocument',
    format: 'pdf',
    scope: 'single',
    sensitiveColumns: [
      { model: 'Person', column: 'personCurp' },
      { model: 'TraumaticEventReport', column: 'traumaticEventReportDescription' },
      { model: 'TraumaticEventReport', column: 'traumaticEventReportInvolvedPeople' },
    ],
    excluded: true,
    excludedReason:
      'Un solo trabajador por descarga; la HU prioriza exportaciones masivas. Incluir si producto extiende el alcance a PDFs individuales.',
    validationNotes:
      'Hallazgo nuevo en grep; no estaba en el preliminar. traumatic_event_report_document_service.ts:379,428,445.',
  },

  // ─── REVISADOS Y DESCARTADOS ─────────────────────────────────────────────────
  {
    exportKey: 'complaints-report',
    httpMethod: 'GET',
    route: '/api/v1/complaints/report/export',
    controller: 'complaint_controller',
    action: 'reportExport',
    format: 'xlsx',
    scope: 'mass',
    sensitiveColumns: [],
    excluded: true,
    excludedReason:
      'Export agregado por categoría/conteos; no escribe campos del catálogo (complaint_service.ts:410-446).',
  },
  {
    exportKey: 'employee-shift-exceptions-xlsx',
    httpMethod: 'GET',
    route: '/api/employees/:employeeId/export-excel',
    controller: 'employee_controller',
    action: 'exportShiftExceptionsToExcel',
    format: 'xlsx',
    scope: 'single',
    sensitiveColumns: [],
    excluded: true,
    excludedReason:
      'Solo nombre, departamento, puesto y excepciones de turno; sin campos del catálogo (employee_controller.ts:4015-4074).',
  },
  {
    exportKey: 'repse-coverage-xlsx',
    httpMethod: 'GET',
    route: '/api/repse/coverage-report/export',
    controller: 'repse_coverage_report.controller',
    action: 'export',
    format: 'xlsx',
    scope: 'mass',
    sensitiveColumns: [],
    excluded: true,
    excludedReason:
      'Días laborados y porcentajes REPSE por empleado/empresa; no exporta RFC de EmpresaContratante ni otros campos del catálogo.',
  },
] as const

/** Exportaciones masivas que deben cablearse en E5 (motivo + asiento o variante enmascarada). */
export const SENSITIVE_MASS_EXPORTS = SENSITIVE_EXPORT_INVENTORY.filter(
  (item) => !item.excluded && item.scope === 'mass'
)

/** Claves estables de las exportaciones masivas en alcance. */
export const SENSITIVE_MASS_EXPORT_KEYS = SENSITIVE_MASS_EXPORTS.map((item) => item.exportKey)
