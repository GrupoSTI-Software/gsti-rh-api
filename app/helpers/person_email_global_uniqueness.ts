import Person from '#models/person'
import { blindIndex } from '#utils/blind_index'
import { TenantContext } from '#utils/tenant_context'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'

/**
 * ¿Hay OTRA persona viva, en cualquier empresa, con este correo personal?
 *
 * El correo personal es único en todo el sistema (USRH1789698261610, regla 5),
 * por eso la consulta corre sin filtro de empresa. Es el ÚNICO lugar con este
 * `runUnscoped`: alta, edición, verificación y el espejo de USRH1789698261612
 * la llaman; ninguno la copia. Compara por huella (`person_email_hash`), porque
 * el correo está cifrado.
 *
 * @param excludePersonId La propia persona en una edición; 0 en un alta.
 */
export async function personEmailExistsGlobally(
  email: string,
  excludePersonId: number
): Promise<boolean> {
  if (email.trim() === '') return false
  const emailHash = blindIndex(email)
  const existing = await TenantContext.runUnscoped(
    () =>
      Person.query()
        .whereNull('person_deleted_at')
        .where('person_email_hash', emailHash)
        .if(excludePersonId > 0, (query) => query.whereNot('person_id', excludePersonId))
        .first(),
    TENANT_UNSCOPED_REASON.PERSON_IDENTITY_UNIQUENESS
  )
  return existing !== null
}
