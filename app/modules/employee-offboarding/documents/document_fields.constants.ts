import {
  EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE,
  type EmployeeOffboardingDocumentType,
} from './documents.constants.js'

/**
 * Catálogo ÚNICO de campos combinables del documento de salida
 * (USRH1788579938623). Es la puerta de qué puede imprimirse: lo que no está
 * aquí no se combina, y por eso NO existen identificadores fiscales, de
 * población ni de seguridad social, ni datos de nómina del colaborador
 * (regla 5) — lo vigila una prueba negativa. Declarado en código y no en
 * configuración de cliente: es idéntico para todas las empresas y ninguna
 * puede ampliarlo.
 *
 * Vive en `documents/` porque sus consumidoras son de este slice: el
 * contraste (ESB-05-07-08), el llenado al emitir (ESB-05-07-09), la guarda
 * dinámica (ESB-05-07-11) y el convenio (ESB-05-07-04 / ESB-05-07-16). La
 * consulta HTTP vive en `document-templates/`. No toca `MISSING_FIELD_ORDER`
 * ni `MISSING_FIELD_LABEL_KEY`: la guarda vigente sigue con su lista fija.
 */
export interface OffboardingDocumentField {
  /** Nombre EXACTO del campo AcroForm del archivo (regla 2): sin llaves, corchetes ni prefijos; nunca se traduce. */
  key: string
  /** Clave i18n del nombre legible, resuelta en el idioma de la petición. */
  labelKey: string
  /** Obligatorio en la plantilla de la empresa; distinto de "dato faltante del expediente". */
  requiredInTemplate: boolean
  /** Clave i18n de la pantalla de captura; `null` = lo provee el sistema. */
  captureTabLabelKey: string | null
  /** Tipos de documento donde aplica (candado V-4: hoy solo la constancia). */
  documentTypes: readonly EmployeeOffboardingDocumentType[]
  /** De dónde sale el valor (tabla.columna o cálculo). Trazabilidad interna: NUNCA viaja al cliente. */
  source: string
}

/** Hasta que exista el convenio (ESB-05-07-04), todo campo aplica solo a la constancia. */
const SEPARATION_LETTER_ONLY = [EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.SEPARATION_LETTER] as const

/** Pantallas de captura, una clave i18n por pantalla (regla 8). */
const CAPTURE_TAB = {
  SYSTEM_SETTINGS: 'employee_offboarding_document_field_capture_tab_system_settings',
  EMPLOYEE_PERSONAL: 'employee_offboarding_document_field_capture_tab_employee_personal',
  EMPLOYEE_WORK: 'employee_offboarding_document_field_capture_tab_employee_work',
  TERMINATION_RECORD: 'employee_offboarding_document_field_capture_tab_termination_record',
} as const

/**
 * Las diez entradas iniciales (regla 3) en orden ESTABLE (regla 6): empresa
 * → colaborador → sistema. `as const satisfies`: la unión de claves se
 * DERIVA de la tupla y una entrada mal formada no compila.
 */
export const OFFBOARDING_DOCUMENT_FIELDS = [
  {
    key: 'legal_name',
    labelKey: 'employee_offboarding_document_field_label_legal_name',
    requiredInTemplate: true,
    captureTabLabelKey: CAPTURE_TAB.SYSTEM_SETTINGS,
    documentTypes: SEPARATION_LETTER_ONLY,
    source: 'business_units.business_unit_legal_name',
  },
  {
    key: 'trade_name',
    labelKey: 'employee_offboarding_document_field_label_trade_name',
    requiredInTemplate: false,
    captureTabLabelKey: CAPTURE_TAB.SYSTEM_SETTINGS,
    documentTypes: SEPARATION_LETTER_ONLY,
    source: 'system_settings.system_setting_trade_name',
  },
  {
    key: 'employee_name',
    labelKey: 'employee_offboarding_document_field_label_employee_name',
    requiredInTemplate: true,
    captureTabLabelKey: CAPTURE_TAB.EMPLOYEE_PERSONAL,
    documentTypes: SEPARATION_LETTER_ONLY,
    source: 'people.person_firstname + person_lastname + person_second_lastname',
  },
  {
    key: 'position_name',
    labelKey: 'employee_offboarding_document_field_label_position_name',
    requiredInTemplate: true,
    captureTabLabelKey: CAPTURE_TAB.EMPLOYEE_WORK,
    documentTypes: SEPARATION_LETTER_ONLY,
    source: 'positions.position_name',
  },
  {
    key: 'department_or_unit',
    labelKey: 'employee_offboarding_document_field_label_department_or_unit',
    requiredInTemplate: false,
    captureTabLabelKey: CAPTURE_TAB.EMPLOYEE_WORK,
    documentTypes: SEPARATION_LETTER_ONLY,
    source: 'departments.department_name, respaldo business_units.business_unit_legal_name',
  },
  {
    key: 'hire_date',
    labelKey: 'employee_offboarding_document_field_label_hire_date',
    requiredInTemplate: true,
    captureTabLabelKey: CAPTURE_TAB.EMPLOYEE_WORK,
    documentTypes: SEPARATION_LETTER_ONLY,
    source: 'employees.employee_hire_date',
  },
  {
    key: 'separation_date',
    labelKey: 'employee_offboarding_document_field_label_separation_date',
    requiredInTemplate: true,
    captureTabLabelKey: CAPTURE_TAB.TERMINATION_RECORD,
    documentTypes: SEPARATION_LETTER_ONLY,
    source:
      'employees.employee_terminated_date, respaldo employee_offboardings.employee_offboarding_planned_date',
  },
  {
    key: 'seniority',
    labelKey: 'employee_offboarding_document_field_label_seniority',
    requiredInTemplate: false,
    captureTabLabelKey: null,
    documentTypes: SEPARATION_LETTER_ONLY,
    source: 'calculado: años y meses cumplidos entre hire_date y separation_date',
  },
  {
    key: 'folio',
    labelKey: 'employee_offboarding_document_field_label_folio',
    requiredInTemplate: true,
    captureTabLabelKey: null,
    documentTypes: SEPARATION_LETTER_ONLY,
    source: 'employee_offboarding_documents.employee_offboarding_document_folio',
  },
  {
    key: 'issue_date',
    labelKey: 'employee_offboarding_document_field_label_issue_date',
    requiredInTemplate: false,
    captureTabLabelKey: null,
    documentTypes: SEPARATION_LETTER_ONLY,
    source: 'employee_offboarding_documents.employee_offboarding_document_created_at',
  },
] as const satisfies readonly OffboardingDocumentField[]

/** Unión de claves DERIVADA de la tupla; nunca se escribe a mano. */
export type OffboardingDocumentFieldKey = (typeof OFFBOARDING_DOCUMENT_FIELDS)[number]['key']

/** Vista tipada por la interfaz, para las funciones de lectura. */
const CATALOG: readonly OffboardingDocumentField[] = OFFBOARDING_DOCUMENT_FIELDS

/**
 * Campos que aplican a un tipo, EN EL ORDEN DEL CATÁLOGO (lo garantizado a
 * ESB-05-07-08). Función pura: no consulta, no traduce, no lanza.
 */
export function fieldsForDocumentType(
  documentType: EmployeeOffboardingDocumentType
): readonly OffboardingDocumentField[] {
  return CATALOG.filter((field) => field.documentTypes.includes(documentType))
}

/** Búsqueda por nombre exacto del hueco (la consume ESB-05-07-11). Función pura. */
export function fieldByKey(key: string): OffboardingDocumentField | undefined {
  return CATALOG.find((field) => field.key === key)
}
