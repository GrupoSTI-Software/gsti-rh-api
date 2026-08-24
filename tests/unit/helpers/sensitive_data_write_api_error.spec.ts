import { test } from '@japa/runner'
import type { HttpContext } from '@adonisjs/core/http'
import { SENSITIVE_DATA_WRITE_ERROR_CODES } from '#constants/sensitive_data_write_error_codes'
import { SensitiveDataWriteError } from '#exceptions/sensitive_data_write_error'
import {
  isSensitiveDataWriteError,
  respondSensitiveDataWriteDenial,
} from '#helpers/sensitive_data_write_api_error'

function makeCtx(locale: 'es' | 'en' = 'es'): HttpContext {
  const messages: Record<string, Record<string, string>> = {
    es: {
      sensitive_data_write_forbidden_title: 'Sin permiso para modificar datos sensibles',
      sensitive_data_write_forbidden_detail:
        'No tienes permiso para modificar {category}. Ningún dato de la petición se guardó.',
      sensitive_data_write_unresolved_title: 'No se pudo determinar el permiso de escritura',
      sensitive_data_write_unresolved_detail:
        'No se pudo determinar si tienes permiso para modificar datos sensibles. Ningún dato de la petición se guardó.',
      sensitive_data_write_category_identificacion: 'datos de identificación',
      sensitive_data_write_category_contacto: 'datos de contacto',
      sensitive_data_write_category_financiero: 'datos financieros',
      sensitive_data_write_category_salud: 'datos de salud',
      sensitive_data_write_category_biometrico: 'datos biométricos',
    },
    en: {
      sensitive_data_write_forbidden_title: 'Not allowed to modify sensitive data',
      sensitive_data_write_forbidden_detail:
        'You are not allowed to modify {category}. No data from the request was saved.',
      sensitive_data_write_unresolved_title: 'Write permission could not be determined',
      sensitive_data_write_unresolved_detail:
        'It could not be determined whether you are allowed to modify sensitive data. No data from the request was saved.',
      sensitive_data_write_category_identificacion: 'identification data',
      sensitive_data_write_category_contacto: 'contact data',
      sensitive_data_write_category_financiero: 'financial data',
      sensitive_data_write_category_salud: 'health data',
      sensitive_data_write_category_biometrico: 'biometric data',
    },
  }
  const table = messages[locale]
  return {
    i18n: {
      locale,
      t: (key: string, params?: Record<string, string>) => {
        let text = table[key] ?? key
        if (params) {
          for (const [name, value] of Object.entries(params)) {
            text = text.replace(`{${name}}`, value)
          }
        }
        return text
      },
    },
    response: {
      status(code: number) {
        ;(this as { statusCode?: number }).statusCode = code
        return this
      },
    },
  } as unknown as HttpContext
}

test.group('isSensitiveDataWriteError', () => {
  test('reconoce la excepción y rechaza un Error genérico', ({ assert }) => {
    const denied = new SensitiveDataWriteError(
      SENSITIVE_DATA_WRITE_ERROR_CODES.FORBIDDEN,
      'financiero'
    )
    assert.isTrue(isSensitiveDataWriteError(denied))
    assert.isFalse(isSensitiveDataWriteError(new Error('boom')))
    assert.isFalse(isSensitiveDataWriteError({ message: 'nope' }))
  })
})

test.group('respondSensitiveDataWriteDenial', () => {
  test('FORBIDDEN nombra la categoría, fija 403 y no incluye valores', ({ assert }) => {
    const ctx = makeCtx('es')
    const error = new SensitiveDataWriteError(
      SENSITIVE_DATA_WRITE_ERROR_CODES.FORBIDDEN,
      'financiero'
    )
    const body = respondSensitiveDataWriteDenial(ctx, error)
    assert.equal((ctx.response as { statusCode?: number }).statusCode, 403)
    assert.equal(body.title, 'Sin permiso para modificar datos sensibles')
    assert.equal(body.key, 'sin-permiso-para-modificar-datos-sensibles')
    assert.equal(body.code, 'EMP.SENS.WRITE.FORBIDDEN')
    assert.equal(
      body.detail,
      'No tienes permiso para modificar datos financieros. Ningún dato de la petición se guardó.'
    )
    assert.notInclude(body.detail, '012345678901234567')
    assert.notInclude(JSON.stringify(body), '••••')
  })

  test('UNRESOLVED no nombra categoría ni valores', ({ assert }) => {
    const ctx = makeCtx('es')
    const error = new SensitiveDataWriteError(SENSITIVE_DATA_WRITE_ERROR_CODES.UNRESOLVED)
    const body = respondSensitiveDataWriteDenial(ctx, error)
    assert.equal(body.code, 'EMP.SENS.WRITE.UNRESOLVED')
    assert.equal(body.key, 'no-se-pudo-determinar-el-permiso-de-escritura')
    assert.equal(body.title, 'No se pudo determinar el permiso de escritura')
    assert.notInclude(body.detail.toLowerCase(), 'identificacion')
    assert.notInclude(body.detail.toLowerCase(), 'clabe')
  })
})
