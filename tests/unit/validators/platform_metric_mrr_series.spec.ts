import { test } from '@japa/runner'
import {
  mrrSeriesValidator,
  mrrSeriesValidatorMessages,
} from '../../../app/validators/platform_metric.js'
import { MRR_SERIES_METRIC_ERROR_TEXTS } from '../../../app/constants/platform_metric_error_codes.js'

/**
 * USRH1788052455654 — la ventana de la serie.
 *
 * El `detail` del 422 está fijado literal por CA-7, así que las cuatro reglas
 * de Vine dicen la misma frase: el mensaje no puede cambiar según cuál falló
 * primero.
 */
const RANGE_MESSAGE = 'El número de meses debe estar entre 1 y 24.'

interface VineFailure {
  code: string
  messages: Array<{ message: string }>
}

async function firstFailure(payload: Record<string, unknown>): Promise<VineFailure> {
  try {
    await mrrSeriesValidator.validate(payload, {
      messagesProvider: mrrSeriesValidatorMessages,
    })
  } catch (error) {
    return error as VineFailure
  }
  throw new Error(`el validador aceptó ${JSON.stringify(payload)} y debía rechazarlo`)
}

test.group('mrrSeriesValidator', () => {
  test('CA-7 — meses = 40 falla con el detalle exacto del criterio', async ({ assert }) => {
    const failure = await firstFailure({ meses: 40 })

    assert.equal(failure.code, 'E_VALIDATION_ERROR')
    assert.equal(failure.messages[0].message, RANGE_MESSAGE)
  })

  test('meses = 0 falla con el mismo detalle que el tope de arriba', async ({ assert }) => {
    const failure = await firstFailure({ meses: 0 })

    assert.equal(failure.messages[0].message, RANGE_MESSAGE)
  })

  test('meses no entero falla, y no se redondea a ojo', async ({ assert }) => {
    const withDecimals = await firstFailure({ meses: 12.5 })
    const withText = await firstFailure({ meses: 'doce' })

    assert.equal(withDecimals.messages[0].message, RANGE_MESSAGE)
    assert.equal(withText.messages[0].message, RANGE_MESSAGE)
  })

  test('los bordes 1 y 24 pasan, y meses ausente queda undefined', async ({ assert }) => {
    const one = await mrrSeriesValidator.validate({ meses: 1 })
    const twentyFour = await mrrSeriesValidator.validate({ meses: 24 })
    const empty = await mrrSeriesValidator.validate({})

    assert.equal(one.meses, 1)
    assert.equal(twentyFour.meses, 24)
    // El 12 por omisión lo aplica el controlador: el default vive en un solo lugar.
    assert.isUndefined(empty.meses)
  })

  test('el title de la serie nombra la serie, no la cifra de la franja', ({ assert }) => {
    assert.equal(
      MRR_SERIES_METRIC_ERROR_TEXTS.failureTitle,
      'No fue posible obtener la serie mensual de MRR'
    )
    // Convención del área: el key es el slug kebab del título y el code va aparte.
    assert.notInclude(MRR_SERIES_METRIC_ERROR_TEXTS.failureKey, 'PLT.MET')
  })
})
