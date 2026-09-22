import Person from '#models/person'
import type { PersonIdentityField } from '#constants/person_identity_error_codes'

const HASH_COLUMN: Record<PersonIdentityField, string> = {
  curp: 'person_curp_hash',
  nss: 'person_imss_nss_hash',
  rfc: 'person_rfc_hash',
}

/**
 * ¿Hay OTRO expediente vivo de esta empresa con la misma huella? (USRH1789698261610)
 *
 * La empresa es parámetro explícito, no contexto implícito: así el mismo chequeo
 * sirve con contexto HTTP, sin contexto (REPL, jobs) y en validadores. Sin empresa
 * devuelve falso y NUNCA un veredicto (regla 10): el 400 lo pone quien llama.
 * El correo no pasa por aquí: sigue global (regla 5).
 */
export async function livePersonWithIdentityExists(
  field: PersonIdentityField,
  hash: string,
  businessUnitId: number | null | undefined,
  excludePersonId: number = 0
): Promise<boolean> {
  if (!businessUnitId) return false
  const found = await Person.query()
    .whereNull('person_deleted_at')
    .where('business_unit_id', businessUnitId)
    .where(HASH_COLUMN[field], hash)
    .if(excludePersonId > 0, (query) => query.whereNot('person_id', excludePersonId))
    .first()
  return !!found
}

/** Resultado de `PersonService.verifyInfo`. */
export type PersonIdentityRecheck =
  | { status: 200 }
  | { status: 400; missingCompany: true }
  | { status: 422; field: PersonIdentityField | 'email' }

/**
 * Qué dato informar cuando el guardado perdió una carrera contra el UNIQUE.
 *
 * MySQL reporta el índice que chocó primero en SU orden, no en el de la HU. La
 * reverificación (`verifyInfo`) aplica el orden CURP > RFC > NSS y por eso manda;
 * el índice solo se usa si la reverificación ya no encuentra choque de identidad
 * (p. ej. el ganador se dio de baja entre tanto) o no se pudo hacer.
 */
export function resolveRacedIdentityField(
  recheck: PersonIdentityRecheck | null,
  indexField: PersonIdentityField
): PersonIdentityField {
  if (recheck && recheck.status === 422 && recheck.field !== 'email') return recheck.field
  return indexField
}
