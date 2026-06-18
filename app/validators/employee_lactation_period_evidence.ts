import vine from '@vinejs/vine'

/**
 * Conjunto cerrado de categorías de evidencia documental de un periodo de
 * lactancia. Debe mantenerse alineado con el `EmployeeLactationPeriodEvidenceCategory`
 * del modelo y con la columna `employee_lactation_period_evidence_category`.
 */
export const EMPLOYEE_LACTATION_PERIOD_EVIDENCE_CATEGORIES = [
  'agreement',
  'birth_support',
  'other',
] as const

/**
 * Sólo validamos la categoría con VineJS. El archivo no pasa por `vine.file()`
 * porque el patrón del repo (employee_certifications, shift_exception_evidences)
 * deja la validación de tipo/tamaño dentro del service para tener acceso al
 * `code` estable de error tipado y devolver `key` consistente al cliente.
 */
export const employeeLactationPeriodEvidenceUploadValidator = vine.compile(
  vine.object({
    employeeLactationPeriodEvidenceCategory: vine
      .enum([...EMPLOYEE_LACTATION_PERIOD_EVIDENCE_CATEGORIES])
      .optional(),
  })
)
