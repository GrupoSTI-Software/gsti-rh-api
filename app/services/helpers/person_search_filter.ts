import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import type Person from '#models/person'

type PersonQuery = ModelQueryBuilderContract<typeof Person>

/**
 * Aplica el filtro de búsqueda por identificadores cifrados de persona
 * (CURP, RFC, NSS, correo).
 *
 * PUNTO DE REINTRODUCCIÓN 08-10-04-01 (blind-index):
 *   Esta función es actualmente un no-op porque las columnas
 *   person_curp, person_rfc, person_imss_nss y person_email están cifradas
 *   en reposo desde USRH1782854997782 y no se pueden consultar con LIKE/= sobre
 *   el ciphertext. La búsqueda por igualdad exacta (y la validación de unicidad)
 *   se restaurará cuando 08-10-04-01 implemente el blind-index determinista.
 *
 *   Al restaurar, este es el único lugar a modificar; todos los buscadores
 *   que llaman a esta función recuperarán la capacidad automáticamente.
 */
export function applyPersonIdentifierSearch(personQuery: PersonQuery, search: string): void {
  void personQuery
  void search
}
