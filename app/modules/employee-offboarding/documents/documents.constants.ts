import type {
  OffboardingDocumentField,
  OffboardingDocumentFieldKey,
} from './document_fields.constants.js'

/**
 * Constantes de los documentos del expediente de salida (USRH1787433503686).
 * Conjuntos cerrados del slice: `varchar` en BD, literal aquí.
 */

/** Tipos de documento; hoy solo la constancia de separación. */
export const EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE = {
  SEPARATION_LETTER: 'separation_letter',
} as const

export type EmployeeOffboardingDocumentType =
  (typeof EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE)[keyof typeof EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE]

/** De dónde salió la fecha de separación impresa. H1a siempre `terminated`. */
export const REFERENCE_DATE_SOURCE = {
  TERMINATED: 'terminated',
  PLANNED: 'planned',
} as const

/** Carpeta lógica en S3 bajo `AWS_ROOT_PATH/files/`. */
export const DOCUMENTS_S3_FOLDER = 'employee-offboarding-documents'

/** Vigencia (segundos) de la URL firmada: 5 min. NO negociable hacia arriba. */
export const DOCUMENT_SIGNED_URL_EXPIRES_SECONDS = 5 * 60

/**
 * Invariante del slice: el documento es SIEMPRE PDF. No se guarda como
 * columna ni se expone en el contrato.
 */
export const DOCUMENT_MIME_TYPE = 'application/pdf'

/**
 * Formato civil de las fechas escritas en la plantilla propia
 * (USRH1789097550389): el MISMO que imprime la plantilla del sistema, que
 * conserva su literal privado (candado G-14). Zona de negocio.
 */
export const DOCUMENT_PRINTED_DATE_FORMAT = 'dd/LL/yyyy'

/** Anchos de las columnas de snapshot (espejo de las tablas de origen). */
export const DOCUMENT_EMPLOYEE_NAME_MAX_LENGTH = 255
export const DOCUMENT_POSITION_NAME_MAX_LENGTH = 100
export const DOCUMENT_DEPARTMENT_NAME_MAX_LENGTH = 100
export const DOCUMENT_LEGAL_NAME_MAX_LENGTH = 250

/**
 * Campos calculados → campos capturables de los que dependen
 * (USRH1789097550392, regla 4): una plantilla que imprime la antigüedad exige
 * las dos fechas aunque no las imprima por separado; la unidad de adscripción
 * cae a la razón social cuando no hay departamento (regla 10).
 */
export const DERIVED_FIELD_DEPENDENCIES = {
  seniority: ['hire_date', 'separation_date'],
  department_or_unit: ['legal_name'],
} as const satisfies Readonly<Record<string, readonly string[]>>

/**
 * Frases vivas del aviso de dato faltante (USRH1787433503689) para los cinco
 * campos históricos: "el puesto (pestaña Trabajo de la ficha)". Se conservan
 * por su clave i18n porque el aviso de una empresa sin plantilla propia no
 * cambia ni un carácter (regla 2); cualquier otro campo del catálogo se
 * enuncia con su `labelKey` y su `captureTabLabelKey`.
 */
export const LEGACY_FIELD_GUARD_LABEL_KEY: Readonly<
  Partial<Record<OffboardingDocumentFieldKey, string>>
> = {
  legal_name: 'employee_offboarding_document_field_legal_name',
  employee_name: 'employee_offboarding_document_field_employee_name',
  position_name: 'employee_offboarding_document_field_position',
  hire_date: 'employee_offboarding_document_field_hire_date',
  separation_date: 'employee_offboarding_document_field_separation_date',
}

/**
 * Lista efectiva de campos exigidos al emitir (USRH1789097550392). Pura: no
 * consulta, no traduce, no lanza. `recognizedFieldKeys === null` ⇒ empresa
 * sin plantilla propia ⇒ todos los indispensables capturables del catálogo
 * (regla 2: exactamente los cinco de hoy, en su orden). Con plantilla, los
 * indispensables capturables que la plantilla usa, más las dependencias de
 * los calculados que imprime (reglas 3 y 4). Nunca los que provee el sistema
 * (`captureTabLabelKey === null`) ni los opcionales (regla 5). Devuelve en el
 * ORDEN DE DECLARACIÓN del catálogo (regla 8), sin duplicados. El catálogo se
 * inyecta para no cerrar un ciclo de importación con quien lo declara.
 */
export function resolveRequiredFieldKeys(
  documentType: EmployeeOffboardingDocumentType,
  recognizedFieldKeys: readonly string[] | null,
  catalog: readonly OffboardingDocumentField[]
): OffboardingDocumentFieldKey[] {
  const fields = catalog.filter((field) => field.documentTypes.includes(documentType))
  const dependencies: Readonly<Record<string, readonly string[]>> = DERIVED_FIELD_DEPENDENCIES
  const used = recognizedFieldKeys === null ? null : new Set(recognizedFieldKeys)
  if (used !== null) {
    for (const key of recognizedFieldKeys ?? []) {
      for (const dependency of dependencies[key] ?? []) {
        used.add(dependency)
      }
    }
  }
  return fields
    .filter((field) => field.requiredInTemplate && field.captureTabLabelKey !== null)
    .filter((field) => used === null || used.has(field.key))
    .map((field) => field.key as OffboardingDocumentFieldKey)
}
