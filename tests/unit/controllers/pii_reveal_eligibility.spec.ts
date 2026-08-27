import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { SENSITIVE_DATA_READ_ERROR_CODES } from '#constants/sensitive_data_read_error_codes'

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
    const notRevealableIndex = source.indexOf('NOT_REVEALABLE')
    assert.isBelow(notRevealableIndex, revealIndex)
  })

  test('el 403 de categoría va después de los 422 y antes del servicio', ({ assert }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/controllers/pii_reveal_controller.ts'),
      'utf-8'
    )
    const notRevealableIndex = source.indexOf('NOT_REVEALABLE')
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
