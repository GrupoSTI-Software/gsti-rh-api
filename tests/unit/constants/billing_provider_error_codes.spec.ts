import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { BILLING_PROVIDER_ERROR_CODES } from '#constants/billing_provider_error_codes'

test.group('billing_provider_error_codes (USRH1790708507467 / CA-10, 7496)', () => {
  test('catálogo PLT.PRV incluye codes de 7467 y 7496', ({ assert }) => {
    const path = join(process.cwd(), 'app/constants/billing_provider_error_codes.ts')
    const source = readFileSync(path, 'utf8')
    const matches = source.match(/PLT\.PRV\./g)
    assert.equal(matches?.length ?? 0, 3)
    assert.equal(
      BILLING_PROVIDER_ERROR_CODES.ADAPTER_NOT_REGISTERED,
      'PLT.PRV.ADAPTER_NOT_REGISTERED'
    )
    assert.equal(
      BILLING_PROVIDER_ERROR_CODES.OPERATION_NOT_AVAILABLE,
      'PLT.PRV.OPERATION_NOT_AVAILABLE'
    )
    assert.equal(
      BILLING_PROVIDER_ERROR_CODES.STRIPE_NOT_CONFIGURED,
      'PLT.PRV.STRIPE_NOT_CONFIGURED'
    )
  })
})
