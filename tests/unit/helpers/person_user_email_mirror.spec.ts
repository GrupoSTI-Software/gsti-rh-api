import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import i18nManager from '@adonisjs/i18n/services/main'
import type { HttpContext } from '@adonisjs/core/http'
import { EmailMirrorConflictError } from '#exceptions/email_mirror_conflict_error'
import { EmailMirrorRefusedError } from '#exceptions/email_mirror_refused_error'
import {
  respondEmailMirrorConflict,
  respondEmailMirrorRefused,
} from '#helpers/user_access_email_api_error'

async function spanishContext(): Promise<HttpContext> {
  const ctx = await testUtils.createHttpContext()
  ctx.i18n = i18nManager.locale('es')
  return ctx
}

test.group('Espejo correo ↔ credencial — respuestas (USRH1789698261612)', () => {
  test('conflicto en users reutiliza verbatim el cuerpo de la 611', async ({ assert }) => {
    const ctx = await spanishContext()
    const body = respondEmailMirrorConflict(ctx, new EmailMirrorConflictError('users'))
    assert.equal(ctx.response.getStatus(), 400)
    assert.deepEqual(body, {
      title: 'Este correo de acceso ya está en uso',
      detail:
        'Otra cuenta activa usa este correo de acceso; usa uno distinto o da de baja la cuenta que lo tiene. No se guardó ningún cambio.',
      key: 'correo-de-acceso-ya-registrado',
      code: 'USR.MAIL.002',
    })
  })

  test('conflicto en people → USR.MAIL.003', async ({ assert }) => {
    const ctx = await spanishContext()
    const body = respondEmailMirrorConflict(ctx, new EmailMirrorConflictError('people'))
    assert.equal(ctx.response.getStatus(), 400)
    assert.equal(body.key, 'correo-personal-ya-registrado')
    assert.equal(body.code, 'USR.MAIL.003')
    assert.equal(body.title, 'Este correo personal ya está en uso')
  })

  test('conflicto en employees → USR.MAIL.004', async ({ assert }) => {
    const ctx = await spanishContext()
    const body = respondEmailMirrorConflict(ctx, new EmailMirrorConflictError('employees'))
    assert.equal(ctx.response.getStatus(), 400)
    assert.equal(body.key, 'correo-institucional-ya-registrado')
    assert.equal(body.code, 'USR.MAIL.004')
  })

  test('fuera de alcance y actor ausente responden el MISMO cuerpo 403', async ({ assert }) => {
    const ctxA = await spanishContext()
    const ctxB = await spanishContext()
    const outOfScope = respondEmailMirrorRefused(ctxA, new EmailMirrorRefusedError('target-out-of-scope'))
    const missingActor = respondEmailMirrorRefused(ctxB, new EmailMirrorRefusedError('missing-actor'))
    assert.equal(ctxA.response.getStatus(), 403)
    assert.deepEqual(outOfScope, missingActor)
    assert.equal(outOfScope.code, 'USR.MAIL.005')
    assert.equal(outOfScope.key, 'cuenta-de-acceso-fuera-de-alcance')
  })

  test('varios usuarios vivos → 400 USR.MAIL.006 sin decir cuántos', async ({ assert }) => {
    const ctx = await spanishContext()
    const body = respondEmailMirrorRefused(ctx, new EmailMirrorRefusedError('multiple-live-users'))
    assert.equal(ctx.response.getStatus(), 400)
    assert.equal(body.code, 'USR.MAIL.006')
    assert.equal(body.key, 'cuenta-de-acceso-no-determinada')
    assert.notMatch(JSON.stringify(body), /\d+ (cuentas|usuarios)/)
  })

  test('los mensajes del error no llevan datos del conflicto', async ({ assert }) => {
    assert.equal(new EmailMirrorConflictError('people').message, 'Email mirror conflict on people')
    assert.equal(
      new EmailMirrorRefusedError('multiple-live-users').message,
      'Email mirror refused: multiple-live-users'
    )
  })
})
