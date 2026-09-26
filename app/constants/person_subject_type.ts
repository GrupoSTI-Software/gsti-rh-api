/**
 * Destinos que el alta de persona acepta declarar.
 *
 * `customer`, `flight-attendant` y `pilot` se retiraron con aviación: sus
 * pantallas y rutas ya no existen y ningún cliente del API los envía. Seguir
 * aceptándolos dejaba un atajo para crear personas sin `tab-persona-write`;
 * ahora resuelven a 'collaborator' y exigen ese permiso (fail-closed).
 */
export const PERSON_SUBJECT_TYPES = ['collaborator', 'system-user'] as const

export type PersonSubjectType = (typeof PERSON_SUBJECT_TYPES)[number]

const NON_COLLABORATOR_SUBJECTS = new Set<PersonSubjectType>(['system-user'])

/**
 * Resuelve el destino declarado en el alta de persona.
 * Ausente, vacío o desconocido → 'collaborator' (fail-closed).
 */
export function resolvePersonSubjectType(raw: unknown): PersonSubjectType {
  if (typeof raw !== 'string') {
    return 'collaborator'
  }
  const normalized = raw.trim()
  if (normalized === '') {
    return 'collaborator'
  }
  if ((PERSON_SUBJECT_TYPES as readonly string[]).includes(normalized)) {
    return normalized as PersonSubjectType
  }
  return 'collaborator'
}

export function personSubjectRequiresCollaboratorWritePermission(
  subjectType: PersonSubjectType
): boolean {
  return !NON_COLLABORATOR_SUBJECTS.has(subjectType)
}
