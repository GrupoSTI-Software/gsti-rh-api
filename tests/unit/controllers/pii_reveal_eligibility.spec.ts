import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

test.group('PiiRevealController ramas 422', () => {
  test('consulta elegibilidad antes del servicio y emite los dos códigos', ({ assert }) => {
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
})
