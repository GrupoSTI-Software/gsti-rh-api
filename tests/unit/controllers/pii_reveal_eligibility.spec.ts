import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HttpContext } from '@adonisjs/core/http'
import { test } from '@japa/runner'
import { SENSITIVE_DATA_READ_ERROR_CODES } from '#constants/sensitive_data_read_error_codes'
import PiiRevealController from '#controllers/pii_reveal_controller'
import {
  SensitiveAccessContext,
  type SensitiveAccessStore,
} from '#utils/sensitive_access_context'

test.group('PiiRevealController ramas 422 y 403', () => {
  test('FORBIDDEN existe en la familia EMP.SENS.READ', ({ assert }) => {
    assert.equal(SENSITIVE_DATA_READ_ERROR_CODES.FORBIDDEN, 'EMP.SENS.READ.FORBIDDEN')
  })

  test('consulta elegibilidad antes del servicio y emite los dos códigos 422', ({ assert }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/controllers/pii_reveal_controller.ts'),
      'utf-8'
    )
    assert.include(source, 'revealEligibility')
    assert.include(source, 'SENSITIVE_DATA_READ_ERROR_CODES.NOT_REVEALABLE')
    assert.include(source, 'SENSITIVE_DATA_READ_ERROR_CODES.NOT_CLASSIFIED')
    assert.include(source, 'El dato no se puede revelar por esta vía')
    assert.include(source, 'El campo solicitado no es un dato sensible')
    assert.include(source, 'el-dato-no-se-puede-revelar-por-esta-via')
    assert.include(source, 'el-campo-solicitado-no-es-un-dato-sensible')
    const revealIndex = source.indexOf('new PiiRevealService()')
    const notRevealableIndex = source.indexOf(
      'SENSITIVE_DATA_READ_ERROR_CODES.NOT_REVEALABLE'
    )
    assert.isBelow(notRevealableIndex, revealIndex)
  })

  test('el 403 de categoría va después de los 422 y antes del servicio', ({ assert }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/controllers/pii_reveal_controller.ts'),
      'utf-8'
    )
    const notRevealableIndex = source.indexOf(
      'SENSITIVE_DATA_READ_ERROR_CODES.NOT_REVEALABLE'
    )
    const categoryOfIndex = source.indexOf('catalog.categoryOf')
    const canReadIndex = source.indexOf('SensitiveAccessContext.canRead')
    const forbiddenIndex = source.indexOf('SENSITIVE_DATA_READ_ERROR_CODES.FORBIDDEN')
    const revealIndex = source.indexOf('new PiiRevealService()')

    assert.isBelow(notRevealableIndex, categoryOfIndex)
    assert.isBelow(categoryOfIndex, canReadIndex)
    assert.isBelow(canReadIndex, forbiddenIndex)
    assert.isBelow(forbiddenIndex, revealIndex)
    assert.include(source, 'Sin permiso para revelar datos sensibles')
    assert.include(source, 'sin-permiso-para-revelar-datos-sensibles')
    assert.include(source, 'datos de identificación')
    assert.include(source, 'datos de contacto')
    assert.include(source, 'datos financieros')
    assert.include(source, 'datos de salud')
    assert.include(source, 'datos biométricos')
    assert.notInclude(source, 'middleware.permissionGate')
    assert.notInclude(source, 'evaluate(')
  })
})

test.group('PiiRevealController autorización por categoría', () => {
  test('deniega salud sin permiso y deja pasar con permiso', async ({ assert }) => {
    const createContext = () => {
      let responseStatus: number | undefined
      const context = {
        auth: { user: { userId: 1, roleId: 1 } },
        request: {
          ip: () => '127.0.0.1',
          header: () => undefined,
          id: () => undefined,
        },
        response: {
          status(code: number) {
            responseStatus = code
          },
        },
        params: {
          model: 'EmployeeMedicalCondition',
          column: 'employeeMedicalConditionDiagnosis',
          recordId: '1',
        },
        i18n: { formatMessage: (key: string) => key },
        businessUnitScope: [1],
      }

      return {
        context: context as unknown as HttpContext,
        getResponseStatus: () => responseStatus,
      }
    }

    const deniedStore: SensitiveAccessStore = {
      read: {
        identificacion: false,
        contacto: false,
        financiero: false,
        salud: false,
        biometrico: false,
      },
      write: {
        identificacion: 'denied',
        contacto: 'denied',
        financiero: 'denied',
        salud: 'denied',
        biometrico: 'denied',
      },
    }
    const deniedContext = createContext()
    const deniedBody = (await SensitiveAccessContext.run(deniedStore, () =>
      new PiiRevealController().reveal(deniedContext.context)
    )) as Record<string, unknown>

    assert.equal(deniedContext.getResponseStatus(), 403)
    assert.equal(deniedBody.code, 'EMP.SENS.READ.FORBIDDEN')
    assert.equal(deniedBody.key, 'sin-permiso-para-revelar-datos-sensibles')
    assert.include(String(deniedBody.detail), 'datos de salud')

    const grantedStore: SensitiveAccessStore = {
      ...deniedStore,
      read: { ...deniedStore.read, salud: true },
    }
    const grantedContext = createContext()
    const grantedBody = (await SensitiveAccessContext.run(grantedStore, () =>
      new PiiRevealController().reveal(grantedContext.context)
    )) as Record<string, unknown>

    assert.notEqual(grantedContext.getResponseStatus(), 403)
    assert.notEqual(grantedBody.code, 'EMP.SENS.READ.FORBIDDEN')
  })
})
