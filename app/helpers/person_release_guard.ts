import Person from '#models/person'
import { isWithinPersonReleaseWindow } from '#constants/person_release.constants'

/**
 * Contexto del acto que dispara la liberación.
 *
 * `releasePersonIfOrphan` es un método de servicio sin `HttpContext`: el actor
 * y su scope no se pueden leer ahí dentro, se pasan. De paso el compilador
 * obliga a tocar los seis puntos de invocación, así que no queda ninguno sin
 * blindar por olvido.
 *
 * Los nombres calzan uno a uno con `ScopeDeniedLogEntry`
 * (`app/services/scope_denied_log_service.ts`).
 */
export interface PersonReleaseContext {
  /** Usuario autenticado que disparó el alta. `null` si la sesión no resolvió. */
  actorUserId: number | null
  /** Unidades de negocio del actor al momento de la petición. */
  businessUnitScope: number[]
}

/** Motivo de la negativa. Solo ids y etiquetas: nunca viaja dato personal. */
export type PersonReleaseDenialReason =
  /** No existe, o ya fue liberada (soft delete) por la compensación previa. */
  | 'not-found'
  /** Tiene o tuvo vínculo como empleado, usuario o cliente — vivo o dado de baja. */
  | 'linked'
  /** Se creó fuera de la ventana de frescura: no pudo nacer de este acto. */
  | 'stale'

export type PersonReleaseDecision =
  | { releasable: true; person: Person }
  | { releasable: false; reason: PersonReleaseDenialReason }

/**
 * Decide si una persona puede liberarse por la compensación del alta fallida
 * (USRH1789698261608). Fuente ÚNICA: la consume `EmployeeService.releasePersonIfOrphan`
 * para los seis puntos del alta y para el catch de `syncCreate`.
 *
 * El criterio NO es "creada en esta misma petición": la persona nace en otra
 * petición HTTP que no registra actor ni acto, así que esa prueba no existe hoy.
 * `people` tampoco tiene marca de empresa: esto no es aislamiento por cuenta.
 */
export async function resolvePersonRelease(personId: number): Promise<PersonReleaseDecision> {
  // El `personId` llega del payload sin castear (`employee_controller.store`):
  // se normaliza aquí para que un "123" no se caiga por el tipo y rompa el
  // reintento legítimo en silencio.
  const id = Number(personId)
  if (!Number.isInteger(id) || id <= 0) {
    return { releasable: false, reason: 'not-found' }
  }

  // Sin `withTrashed()`: el mixin SoftDeletes filtra `person_deleted_at`, así
  // que una persona ya liberada cae en `not-found` y la compensación conserva
  // su idempotencia.
  const person = await Person.query().where('person_id', id).first()
  if (!person) {
    return { releasable: false, reason: 'not-found' }
  }

  // Vínculo ALGUNA VEZ: sin `whereNull('*_deleted_at')` en ninguna de las tres.
  // Ahí estaba el agujero: la baja del colaborador hace soft delete sobre
  // `employees`, no sobre `people`.
  const unlinked = await Person.query()
    .where('person_id', id)
    .whereNotExists((query) => {
      query.from('employees').whereRaw('employees.person_id = people.person_id')
    })
    .whereNotExists((query) => {
      query.from('users').whereRaw('users.person_id = people.person_id')
    })
    .whereNotExists((query) => {
      query.from('customers').whereRaw('customers.person_id = people.person_id')
    })
    .first()

  if (!unlinked) {
    return { releasable: false, reason: 'linked' }
  }

  if (!isWithinPersonReleaseWindow(person.personCreatedAt)) {
    return { releasable: false, reason: 'stale' }
  }

  return { releasable: true, person: unlinked }
}
