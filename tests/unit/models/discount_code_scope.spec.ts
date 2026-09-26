import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import DiscountCode from '#models/discount_code'
import { DiscountCodeServiceError } from '#exceptions/discount_code_service_error'
import { DISCOUNT_CODE_ERROR_CODES } from '#constants/discount_code_error_codes'

/**
 * USRH1787714804397 — catálogo de códigos de descuento.
 * Cobertura de las garantías que vive en el modelo: normalización a
 * MAYÚSCULAS y la guarda write-once del texto.
 */

test.group('DiscountCode — normalización a MAYÚSCULAS (regla 1)', () => {
  test('normalizeCode convierte y recorta el texto antes de guardar', ({ assert }) => {
    const dc = new DiscountCode()
    dc.discountCodeCode = '  blackfriday25  '

    DiscountCode.normalizeCode(dc)

    assert.equal(dc.discountCodeCode, 'BLACKFRIDAY25')
  })

  test('normalizeCode no truena si el texto viene vacío o ausente', ({ assert }) => {
    const dc = new DiscountCode()

    assert.doesNotThrow(() => DiscountCode.normalizeCode(dc))
  })
})

test.group('DiscountCode — guarda write-once del texto (regla 4)', () => {
  test('rejectCodeMutation rechaza si discountCodeCode viene sucio en un update', ({ assert }) => {
    const dc = new DiscountCode()
    dc.discountCodeCode = 'NUEVOTEXTO'

    let thrown: unknown
    try {
      DiscountCode.rejectCodeMutation(dc)
    } catch (error) {
      thrown = error
    }

    assert.instanceOf(thrown, DiscountCodeServiceError)
    const error = thrown as DiscountCodeServiceError
    assert.equal(error.errorCode, DISCOUNT_CODE_ERROR_CODES.CODE_IMMUTABLE)
    assert.equal(error.httpStatus, 409)
  })

  test('rejectCodeMutation no truena si solo cambian otros campos', ({ assert }) => {
    const dc = new DiscountCode()
    dc.discountCodeName = 'Nueva campaña'
    dc.discountCodeValue = 15

    assert.doesNotThrow(() => DiscountCode.rejectCodeMutation(dc))
  })
})

test.group('DiscountCode — el validador de update nunca acepta el texto ni el tipo', () => {
  test('updateDiscountCodeValidator no declara discountCodeCode ni discountCodeKind', async ({
    assert,
  }) => {
    const content = await readFile(
      join(process.cwd(), 'app/validators/discount_code.ts'),
      'utf8'
    )
    const updateBlock = content.match(
      /export const updateDiscountCodeValidator[\s\S]*?\n\)\n/
    )?.[0]
    assert.exists(updateBlock)
    assert.notInclude(updateBlock ?? '', 'discountCodeCode')
    assert.notInclude(updateBlock ?? '', 'discountCodeKind')
  })
})
