import { test } from '@japa/runner'
import type { HttpContext } from '@adonisjs/core/http'
import {
  isUserAccessEmailDuplicatedIndexError,
  isUserAccessEmailDuplicatedValidationError,
  respondUserAccessEmailDuplicated,
} from '#helpers/user_access_email_api_error'

test.group('Detector de correo de acceso duplicado (CA-11)', () => {
  test('detecta el error de validación VineJS del .unique() de createUserValidator', ({ assert }) => {
    const error = {
      code: 'E_VALIDATION_ERROR',
      messages: [{ field: 'userEmail', rule: 'database.unique', message: 'crudo' }],
    }
    assert.isTrue(isUserAccessEmailDuplicatedValidationError(error))
  })

  test('detecta el ER_DUP_ENTRY del índice users_email_active_unique', ({ assert }) => {
    const error = {
      code: 'ER_DUP_ENTRY',
      errno: 1062,
      message: "Duplicate entry 'x' for key 'users.users_email_active_unique'",
    }
    assert.isTrue(isUserAccessEmailDuplicatedIndexError(error))
  })

  test('el responder devuelve solo title, detail, key, code con status 400', ({ assert }) => {
    const statuses: number[] = []
    const ctx = {
      response: { status: (s: number) => { statuses.push(s) } },
      i18n: { t: (k: string) => k },
    } as unknown as HttpContext
    const body = respondUserAccessEmailDuplicated(ctx)
    assert.deepEqual(statuses, [400])
    assert.deepEqual(Object.keys(body).sort(), ['code', 'detail', 'key', 'title'])
    assert.equal(body.key, 'correo-de-acceso-ya-registrado')
    assert.equal(body.code, 'USR.MAIL.002')
  })
})
