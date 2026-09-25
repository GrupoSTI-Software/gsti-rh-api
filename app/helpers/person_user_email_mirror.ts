import type { HttpContext } from '@adonisjs/core/http'
import type { I18n } from '@adonisjs/i18n'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Employee from '#models/employee'
import Person from '#models/person'
import User from '#models/user'
import UserService from '#services/user_service'
import type { UserEmailTypeValue } from '#constants/user_email_type'
import { EmailMirrorConflictError, type EmailMirrorTarget } from '#exceptions/email_mirror_conflict_error'
import { EmailMirrorRefusedError } from '#exceptions/email_mirror_refused_error'
import { personEmailExistsGlobally } from '#helpers/person_email_global_uniqueness'

/**
 * Espejo entre el correo del expediente y el correo de acceso (USRH1789698261612).
 *
 * Punto ÚNICO de los seis caminos que copiaban el correo: M1 (expediente →
 * credencial), M2/M3 (alta de usuario → expediente), M4/M5 (edición de usuario
 * → expediente) y M6 (empleado → credencial). Invariantes por construcción:
 *  - La cuenta se resuelve por `person_id`, nunca por el correo anterior:
 *    ninguna función recibe el correo previo.
 *  - El destino lo decide `user_email_type` PERSISTIDO, nunca el request.
 *  - La unicidad del destino se valida ANTES de escribir.
 *  - `trx` es obligatorio: no se puede llamar fuera de una transacción.
 *  - El actor es obligatorio y la credencial solo se toca si está a su alcance.
 * Toda no-escritura devuelve una razón con nombre: no hay omisiones mudas.
 *
 * Se llama SOLO desde controladores. Bajarlo a un servicio haría que la carga
 * masiva reescribiera credenciales en lote sin permiso de usuarios.
 */

export type { EmailMirrorTarget }

export type EmailMirrorSkipReason =
  /** El origen no trae correo (null, undefined, vacío o solo espacios). */
  | 'source-email-empty'
  /** No hay contraparte viva para la persona (sin usuario, sin expediente o sin empleado). */
  | 'no-live-counterpart'
  /** El tipo persistido manda la copia al otro campo: decisión de RH, no accidente. */
  | 'email-type-mismatch'
  /** El destino ya tiene ese valor. */
  | 'already-in-sync'

export type EmailMirrorOutcome =
  | {
      readonly status: 'written'
      readonly target: EmailMirrorTarget
      readonly targetId: number
      /** Correo personal anterior (solo destino `people`). Nunca se serializa. */
      readonly previousValue: string | null
      /** Credencial anterior. Nunca se serializa. */
      readonly previousEmail: string | null
      /** Imagen previa de correos para avisos y auditoría. Nunca se serializa. */
      readonly previousUserEmail: string | null
      readonly previousPersonEmail: string | null
      readonly previousBusinessEmail: string | null
    }
  | { readonly status: 'skipped'; readonly reason: EmailMirrorSkipReason }

export type PublicEmailMirrorOutcome =
  | { readonly status: 'written'; readonly target: EmailMirrorTarget }
  | { readonly status: 'skipped'; readonly reason: EmailMirrorSkipReason }

export type EmailMirrorActor = {
  readonly userId: number
  readonly businessUnitScope: readonly number[]
  readonly i18n: I18n
}

type MirrorBaseInput = {
  readonly personId: number
  readonly actor: EmailMirrorActor
  readonly trx: TransactionClientContract
}

export type MirrorPersonEmailInput = MirrorBaseInput & {
  readonly personEmail: string | null | undefined
  /** Capturado de `currentPerson.personEmail` antes de guardar el origen. */
  readonly previousSourceEmail: string | null
}
export type MirrorEmployeeEmailInput = MirrorBaseInput & {
  readonly employeeBusinessEmail: string | null | undefined
  /** Capturado de `currentEmployee.employeeBusinessEmail` antes de guardar el origen. */
  readonly previousSourceEmail: string | null
}
export type MirrorUserEmailInput = MirrorBaseInput & {
  readonly userEmail: string
  /** SIEMPRE el valor persistido (`created.userEmailType` / `updated.userEmailType`). */
  readonly userEmailType: UserEmailTypeValue
  /** Capturado de la credencial antes de crearla o actualizarla. */
  readonly previousCredentialEmail: string | null
}

/** Sin usuario autenticado o sin empresa activa, el espejo no corre (falla cerrado). */
export function emailMirrorActorFromContext(ctx: HttpContext): EmailMirrorActor {
  const userId = ctx.auth?.user?.userId
  const businessUnitScope = ctx.businessUnitScope ?? []
  if (!userId || businessUnitScope.length === 0) {
    throw new EmailMirrorRefusedError('missing-actor')
  }
  return { userId, businessUnitScope, i18n: ctx.i18n }
}

/** M1 — `people.person_email` → credencial, solo si el tipo persistido es `personal`. */
export function mirrorPersonEmailToUserEmail(
  input: MirrorPersonEmailInput
): Promise<EmailMirrorOutcome> {
  return mirrorRecordEmailToUserEmail(
    input,
    input.personEmail,
    'personal',
    input.previousSourceEmail
  )
}

/** M6 — `employees.employee_business_email` → credencial, solo si el tipo persistido es `institutional`. */
export function mirrorEmployeeEmailToUserEmail(
  input: MirrorEmployeeEmailInput
): Promise<EmailMirrorOutcome> {
  return mirrorRecordEmailToUserEmail(
    input,
    input.employeeBusinessEmail,
    'institutional',
    input.previousSourceEmail
  )
}

/**
 * M2+M3 (alta) y M4+M5 (edición) — credencial → expediente. `personal` escribe
 * `people.person_email`; `institutional`, `employees.employee_business_email`.
 * El otro campo no se toca nunca (regla 3). `Person` y `Employee` componen el
 * scope de empresa: un expediente ajeno es invisible y queda `no-live-counterpart`.
 */
export async function mirrorUserEmailToRecord(
  input: MirrorUserEmailInput
): Promise<EmailMirrorOutcome> {
  const email = normalizeMirrorEmail(input.userEmail)
  if (email === null) return skipped('source-email-empty')
  const previousEmails = await readPreviousEmailImage(
    input.personId,
    input.trx,
    input.previousCredentialEmail
  )

  if (input.userEmailType === 'personal') {
    const person = await Person.query({ client: input.trx })
      .where('person_id', input.personId)
      .whereNull('person_deleted_at')
      .first()
    if (!person) return skipped('no-live-counterpart')
    if (person.personEmail === email) return skipped('already-in-sync')
    if (await personEmailExistsGlobally(email, person.personId)) {
      throw new EmailMirrorConflictError('people')
    }
    const previousValue = normalizeMirrorEmail(person.personEmail)
    person.useTransaction(input.trx)
    person.personEmail = email
    await person.save()
    return {
      status: 'written',
      target: 'people',
      targetId: person.personId,
      previousValue,
      ...previousEmails,
    }
  }

  // Una persona tiene a lo más un empleado vivo: lo garantiza
  // `createEmployeeValidator.personId.unique()`.
  const employee = await Employee.query({ client: input.trx })
    .where('person_id', input.personId)
    .whereNull('employee_deleted_at')
    .first()
  if (!employee) return skipped('no-live-counterpart')
  if (employee.employeeBusinessEmail === email) return skipped('already-in-sync')
  await assertEmployeeBusinessEmailAvailable(email, employee.employeeId, input.trx)
  employee.useTransaction(input.trx)
  employee.employeeBusinessEmail = email
  await employee.save()
  return {
    status: 'written',
    target: 'employees',
    targetId: employee.employeeId,
    previousValue: null,
    ...previousEmails,
  }
}

/** Lo único que sale en la respuesta HTTP: sin ids ni correo anterior. */
export function toPublicEmailMirrorOutcome(outcome: EmailMirrorOutcome): PublicEmailMirrorOutcome {
  if (outcome.status === 'written') return { status: 'written', target: outcome.target }
  return { status: 'skipped', reason: outcome.reason }
}

/** Correos previos descifrados, sin vacíos ni duplicados por mayúsculas. */
export function previousEmailRecipients(
  outcome: Extract<EmailMirrorOutcome, { status: 'written' }>
): string[] {
  const recipients = new Map<string, string>()
  for (const value of [
    outcome.previousUserEmail,
    outcome.previousPersonEmail,
    outcome.previousBusinessEmail,
  ]) {
    const email = normalizeMirrorEmail(value)
    if (email !== null && !recipients.has(email.toLowerCase())) {
      recipients.set(email.toLowerCase(), email)
    }
  }
  return [...recipients.values()]
}

async function mirrorRecordEmailToUserEmail(
  input: MirrorBaseInput,
  source: string | null | undefined,
  requiredType: UserEmailTypeValue,
  previousSourceEmail: string | null
): Promise<EmailMirrorOutcome> {
  const email = normalizeMirrorEmail(source)
  if (email === null) return skipped('source-email-empty')

  const user = await findTheLiveUserOfPerson(input.personId, input.trx)
  if (!user) return skipped('no-live-counterpart')
  if (user.userEmailType !== requiredType) return skipped('email-type-mismatch')
  if (user.userEmail === email) return skipped('already-in-sync')
  const previousEmails =
    requiredType === 'personal'
      ? await readPreviousEmailImage(
          input.personId,
          input.trx,
          user.userEmail,
          previousSourceEmail
        )
      : await readPreviousEmailImage(
          input.personId,
          input.trx,
          user.userEmail,
          undefined,
          previousSourceEmail
        )

  await assertActorCanAdministerUser(input.actor, user.userId)
  await assertUserEmailAvailable(email, user.userId, input.trx)

  user.useTransaction(input.trx)
  user.userEmail = email
  await user.save()
  return {
    status: 'written',
    target: 'users',
    targetId: user.userId,
    previousValue: null,
    ...previousEmails,
  }
}

function skipped(reason: EmailMirrorSkipReason): EmailMirrorOutcome {
  return { status: 'skipped', reason }
}

/** `''` y solo-espacios cuentan como "sin correo": `''` es falsy y se colaba. */
function normalizeMirrorEmail(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * La cuenta viva de la persona. Con más de una, falla cerrado: un `.first()`
 * sin criterio elegiría al azar a qué credencial escribir.
 */
async function findTheLiveUserOfPerson(
  personId: number,
  trx: TransactionClientContract
): Promise<User | null> {
  return findLiveUserByPersonId(personId, trx)
}

/** Cuenta viva de la persona para decidir transiciones antes de abrir una transacción. */
export async function findLiveUserByPersonId(
  personId: number,
  trx?: TransactionClientContract
): Promise<User | null> {
  const query = trx ? User.query({ client: trx }) : User.query()
  const users = await query
    .where('person_id', personId)
    .whereNull('user_deleted_at')
    .orderBy('user_id')
    .limit(2)
  if (users.length > 1) throw new EmailMirrorRefusedError('multiple-live-users')
  return users[0] ?? null
}

type PreviousEmailImage = Pick<
  Extract<EmailMirrorOutcome, { status: 'written' }>,
  'previousEmail' | 'previousUserEmail' | 'previousPersonEmail' | 'previousBusinessEmail'
>

async function readPreviousEmailImage(
  personId: number,
  trx: TransactionClientContract,
  previousCredentialEmail: string | null,
  previousPersonEmail?: string | null,
  previousBusinessEmail?: string | null
): Promise<PreviousEmailImage> {
  const person =
    previousPersonEmail === undefined
      ? await Person.query({ client: trx })
          .where('person_id', personId)
          .whereNull('person_deleted_at')
          .first()
      : null
  const employee =
    previousBusinessEmail === undefined
      ? await Employee.query({ client: trx })
          .where('person_id', personId)
          .whereNull('employee_deleted_at')
          .first()
      : null

  const previousEmail = normalizeMirrorEmail(previousCredentialEmail)
  return {
    previousEmail,
    previousUserEmail: previousEmail,
    previousPersonEmail: normalizeMirrorEmail(previousPersonEmail ?? person?.personEmail),
    previousBusinessEmail: normalizeMirrorEmail(
      previousBusinessEmail ?? employee?.employeeBusinessEmail
    ),
  }
}

/** El espejo nunca amplía el acceso del actor (B8). */
async function assertActorCanAdministerUser(
  actor: EmailMirrorActor,
  userId: number
): Promise<void> {
  const scoped = await new UserService(actor.i18n).findActiveInBusinessUnitScope(userId, [
    ...actor.businessUnitScope,
  ])
  if (!scoped) throw new EmailMirrorRefusedError('target-out-of-scope')
}

async function assertUserEmailAvailable(
  email: string,
  excludeUserId: number,
  trx: TransactionClientContract
): Promise<void> {
  const clash = await User.query({ client: trx })
    .whereNull('user_deleted_at')
    .where('user_email', email)
    .whereNot('user_id', excludeUserId)
    .first()
  if (clash) throw new EmailMirrorConflictError('users')
}

async function assertEmployeeBusinessEmailAvailable(
  email: string,
  excludeEmployeeId: number,
  trx: TransactionClientContract
): Promise<void> {
  const clash = await Employee.query({ client: trx })
    .whereNull('employee_deleted_at')
    .where('employee_business_email', email)
    .whereNot('employee_id', excludeEmployeeId)
    .first()
  if (clash) throw new EmailMirrorConflictError('employees')
}
