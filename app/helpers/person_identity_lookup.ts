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
