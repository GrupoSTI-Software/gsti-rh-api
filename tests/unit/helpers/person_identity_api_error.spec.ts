import { test } from '@japa/runner'
import type { HttpContext } from '@adonisjs/core/http'
import {
  personIdentityDuplicatedFieldFromValidationError,
  personIdentityDuplicatedIndexFromError,
  importRowErrorMessage,
  respondPersonIdentityDuplicated,
  respondPersonIdentityMissingCompany,
} from '#helpers/person_identity_api_error'
import { PERSON_IDENTITY_ERRORS } from '#constants/person_identity_error_codes'

/** USRH1789698261610 regla 6 — el rechazo habla de negocio, nunca de BD. */

function fakeCtx() {
  let status = 0
  return {
    ctx: {
      response: { status: (code: number) => { status = code } },
      i18n: { t: (key: string) => `[${key}]` },
    } as unknown as HttpContext,
    getStatus: () => status,
  }
}

test.group('detectores de duplicado de identidad', () => {
  test('validation: mapea personRfc/personCurp/personImssNss con rule unique', ({ assert }) => {
    const rfc = { code: 'E_VALIDATION_ERROR', messages: [{ field: 'personRfc', rule: 'database.unique' }] }
    const curp = { code: 'E_VALIDATION_ERROR', messages: [{ field: 'personCurp', rule: 'database.unique' }] }
    const nss = { code: 'E_VALIDATION_ERROR', messages: [{ field: 'personImssNss', rule: 'database.unique' }] }
    assert.equal(personIdentityDuplicatedFieldFromValidationError(rfc), 'rfc')
    assert.equal(personIdentityDuplicatedFieldFromValidationError(curp), 'curp')
    assert.equal(personIdentityDuplicatedFieldFromValidationError(nss), 'nss')
  })

  test('validation: ignora el correo y las reglas no-unique', ({ assert }) => {
    const email = { code: 'E_VALIDATION_ERROR', messages: [{ field: 'personEmail', rule: 'database.unique' }] }
    const other = { code: 'E_VALIDATION_ERROR', messages: [{ field: 'personRfc', rule: 'minLength' }] }
    assert.isNull(personIdentityDuplicatedFieldFromValidationError(email))
    assert.isNull(personIdentityDuplicatedFieldFromValidationError(other))
    assert.isNull(personIdentityDuplicatedFieldFromValidationError(null))
  })

  test('índice: mapea ER_DUP_ENTRY por nombre de índice compuesto', ({ assert }) => {
    const rfc = { code: 'ER_DUP_ENTRY', errno: 1062, message: "Duplicate entry '7-abc' for key 'people.people_rfc_company_unique'" }
    const other = { code: 'ER_DUP_ENTRY', errno: 1062, message: "Duplicate entry 'x' for key 'users.users_email_active_unique'" }
    const curp = { code: 'ER_DUP_ENTRY', errno: 1062, message: "Duplicate entry '7-abc' for key 'people.people_curp_company_unique'" }
    const nss = { code: 'ER_DUP_ENTRY', errno: 1062, message: "Duplicate entry '7-abc' for key 'people.people_imss_nss_company_unique'" }
    assert.equal(personIdentityDuplicatedIndexFromError(rfc), 'rfc')
    assert.equal(personIdentityDuplicatedIndexFromError(curp), 'curp')
    assert.equal(personIdentityDuplicatedIndexFromError(nss), 'nss')
    assert.isNull(personIdentityDuplicatedIndexFromError(other))
    assert.isNull(personIdentityDuplicatedIndexFromError({ code: 'E_VALIDATION_ERROR', messages: [] }))
  })
})

test.group('mensaje de fila de la importación masiva', () => {
  const hash = 'a'.repeat(64)
  const dup = (index: string) => ({
    code: 'ER_DUP_ENTRY',
    errno: 1062,
    message: `Duplicate entry '7-${hash}' for key 'people.${index}'`,
  })

  test('choque contra el UNIQUE compuesto: mensaje de negocio sin huella', ({ assert }) => {
    const rfc = importRowErrorMessage(dup('people_rfc_company_unique'))
    assert.equal(rfc, 'RFC duplicado')
    assert.equal(importRowErrorMessage(dup('people_curp_company_unique')), 'CURP duplicado')
    assert.equal(importRowErrorMessage(dup('people_imss_nss_company_unique')), 'NSS duplicado')
    assert.notMatch(rfc, /[0-9a-f]{64}|people_rfc_company_unique|Duplicate entry/)
  })

  test('cualquier otro error conserva su mensaje', ({ assert }) => {
    assert.equal(importRowErrorMessage(new Error('Fecha inválida')), 'Fecha inválida')
    const otherDup = dup('users_email_active_unique')
    assert.equal(importRowErrorMessage(otherDup), otherDup.message)
  })
})

test.group('cuerpos de respuesta', () => {
  test('duplicado: 422 con título, detalle, clave y código, sin rastro de BD', ({ assert }) => {
    const { ctx, getStatus } = fakeCtx()
    const body = respondPersonIdentityDuplicated(ctx, 'rfc')
    assert.equal(getStatus(), 422)
    assert.equal(body.key, PERSON_IDENTITY_ERRORS.DUPLICATED_RFC.key)
    assert.equal(body.code, PERSON_IDENTITY_ERRORS.DUPLICATED_RFC.code)
    const raw = JSON.stringify(body)
    assert.notMatch(raw, /people_rfc_company_unique|ER_DUP_ENTRY|person_rfc_hash|[0-9a-f]{64}/)
  })

  test('sin empresa: 400 con su clave propia', ({ assert }) => {
    const { ctx, getStatus } = fakeCtx()
    const body = respondPersonIdentityMissingCompany(ctx)
    assert.equal(getStatus(), 400)
    assert.equal(body.key, PERSON_IDENTITY_ERRORS.MISSING_COMPANY.key)
    assert.equal(body.code, PERSON_IDENTITY_ERRORS.MISSING_COMPANY.code)
  })
})
