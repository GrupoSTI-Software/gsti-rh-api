import { test } from '@japa/runner'
import {
  ADMS_COMMAND_RETENTION_MIN_DAYS,
  ADMS_RAW_RETENTION_MIN_DAYS,
  admsCommandRetentionDays,
  admsRawFailedRetentionDays,
  admsRawRetentionDays,
  admsRetentionSummary,
} from '#modules/adms/retention/retention.constants'

test.group('Plazos de retencion del canal', () => {
  test('sin configurar, los plazos son los del spec', ({ assert }) => {
    const summary = admsRetentionSummary()
    assert.equal(summary.rawDays, 180)
    assert.equal(summary.rawFailedDays, 30)
    assert.equal(summary.commandDays, 365)
    assert.equal(summary.photoPublicationDays, 7)
    assert.equal(summary.quarantineDays, 30)
  })

  /**
   * El minimo existe porque un plazo de un dia puesto por error borraria la
   * evidencia con la que se reconstruye una nomina cuando alguien reclama.
   */
  test('ningun plazo puede quedar por debajo de su minimo', ({ assert }) => {
    assert.isAtLeast(admsRawRetentionDays(), ADMS_RAW_RETENTION_MIN_DAYS)
    assert.isAtLeast(admsRawFailedRetentionDays(), ADMS_RAW_RETENTION_MIN_DAYS)
    assert.isAtLeast(admsCommandRetentionDays(), ADMS_COMMAND_RETENTION_MIN_DAYS)
  })

  test('todos los plazos son enteros de dias', ({ assert }) => {
    for (const value of Object.values(admsRetentionSummary())) {
      assert.isTrue(Number.isInteger(value), `${value} deberia ser entero`)
      assert.isAbove(value, 0)
    }
  })
})
