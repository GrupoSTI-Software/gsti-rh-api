/**
 * Tipos de evidencia NOM-035 cubiertos por la política de retención.
 * Corresponden a las entidades operativas existentes en el repo.
 */
export const RETENTION_POLICY_EVIDENCE_TYPES = [
  'questionnaire_application',
  'traumatic_event_report',
  'traumatic_event_referral',
  'traumatic_event_exam',
  'complaint',
] as const

export type RetentionPolicyEvidenceType = (typeof RETENTION_POLICY_EVIDENCE_TYPES)[number]

/** Años de retención por defecto (2 ciclos de evaluación NOM-035 § 7.9). */
export const RETENTION_POLICY_DEFAULT_YEARS = 4

/** Piso legal de retención en años (NOM-035 § 10.4). */
export const RETENTION_POLICY_MIN_YEARS = 1

/** Tope máximo permitido para evitar basura de datos. */
export const RETENTION_POLICY_MAX_YEARS = 99
