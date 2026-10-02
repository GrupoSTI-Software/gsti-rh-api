import { test } from '@japa/runner'
import {
  buildStripeStartupLog,
  resolveStripeSettings,
  toStripeProviderDescription,
  type StripeRawSettings,
} from '#modules/billing-provider/stripe_billing_provider.config'

test.group('stripe_billing_provider.config — resolveStripeSettings (7496)', () => {
  test('CA-2: sin llaves → disabled missing-secret y log sin ruido', ({ assert }) => {
    const settings = resolveStripeSettings({ nodeEnv: 'development' })
    assert.deepEqual(settings, {
      status: 'disabled',
      reason: 'missing-secret',
      warnings: [],
    })

    const log = buildStripeStartupLog(toStripeProviderDescription(settings))
    assert.equal(log.level, 'info')
    assert.equal(log.message, 'Cobro: Stripe sin llaves; solo cobro manual')
    assert.notProperty(log.fields, 'mode')
  })

  test('CA-3: llaves de prueba sk_test → enabled test', ({ assert }) => {
    const raw: StripeRawSettings = {
      secretKey: 'sk_test_fixtureSecret1',
      publishableKey: 'pk_test_fixturePub1',
      webhookSecret: 'whsec_fixtureHook1',
      nodeEnv: 'development',
    }
    const settings = resolveStripeSettings(raw)
    assert.equal(settings.status, 'enabled')
    if (settings.status === 'enabled') {
      assert.equal(settings.mode, 'test')
    }

    const log = buildStripeStartupLog(toStripeProviderDescription(settings))
    assert.equal(log.level, 'info')
    assert.equal(log.message, 'Cobro: Stripe en modo de prueba')
    assert.deepEqual(log.fields, {
      provider: 'stripe',
      mode: 'test',
      publishableKey: 'configurada',
      webhookSecret: 'configurada',
    })
    const serialized = JSON.stringify(log)
    assert.notInclude(serialized, 'fixtureSecret1')
    assert.notInclude(serialized, 'fixturePub1')
    assert.notInclude(serialized, 'fixtureHook1')
  })

  test('CA-3: llave restringida rk_test → enabled test', ({ assert }) => {
    const settings = resolveStripeSettings({
      secretKey: 'rk_test_fixtureSecret1',
      nodeEnv: 'development',
    })
    assert.equal(settings.status, 'enabled')
    if (settings.status === 'enabled') {
      assert.equal(settings.mode, 'test')
    }
  })

  test('CA-4: forma inválida deshabilita con warn por variable', ({ assert }) => {
    const cases: Array<{
      raw: StripeRawSettings
      variable: string
    }> = [
      {
        raw: { secretKey: 'pk_test_fixturePub1', nodeEnv: 'development' },
        variable: 'STRIPE_SECRET_KEY',
      },
      {
        raw: { secretKey: 'sk_test_', nodeEnv: 'development' },
        variable: 'STRIPE_SECRET_KEY',
      },
      {
        raw: { secretKey: 'sk_test_fixture-Secret', nodeEnv: 'development' },
        variable: 'STRIPE_SECRET_KEY',
      },
      {
        raw: {
          secretKey: 'sk_test_fixtureSecret1',
          publishableKey: 'sk_test_fixturePub1',
          nodeEnv: 'development',
        },
        variable: 'STRIPE_PUBLISHABLE_KEY',
      },
      {
        raw: {
          secretKey: 'sk_test_fixtureSecret1',
          webhookSecret: 'whsec_',
          nodeEnv: 'development',
        },
        variable: 'STRIPE_WEBHOOK_SECRET',
      },
    ]

    for (const { raw, variable } of cases) {
      const settings = resolveStripeSettings(raw)
      assert.equal(settings.status, 'disabled', `caso ${variable}`)
      if (settings.status === 'disabled') {
        assert.equal(settings.reason, 'invalid-shape')
        assert.lengthOf(settings.warnings, 1)
        assert.equal(settings.warnings[0]!.variable, variable)
        assert.equal(settings.warnings[0]!.problem, 'invalid-shape')
      }

      const log = buildStripeStartupLog(toStripeProviderDescription(settings))
      assert.equal(log.level, 'warn')
      assert.equal(log.message, 'Cobro: Stripe deshabilitado por configuración inválida')
      assert.notInclude(JSON.stringify(log), 'fixture')
      assert.notInclude(JSON.stringify(log), 'Secret')
    }
  })

  test('CA-5: sk_live fuera de producción → live-outside-production', ({ assert }) => {
    for (const nodeEnv of ['development', 'test'] as const) {
      const settings = resolveStripeSettings({
        secretKey: 'sk_live_fixtureSecret1',
        nodeEnv,
      })
      assert.equal(settings.status, 'disabled')
      if (settings.status === 'disabled') {
        assert.equal(settings.reason, 'live-outside-production')
        assert.deepEqual(settings.warnings, [
          { variable: 'STRIPE_SECRET_KEY', problem: 'live-outside-production' },
        ])
      }
    }
  })

  test('CA-5: modo cruzado secreta test y publicable live → mode-mismatch', ({ assert }) => {
    const settings = resolveStripeSettings({
      secretKey: 'sk_test_fixtureSecret1',
      publishableKey: 'pk_live_fixturePub1',
      nodeEnv: 'development',
    })
    assert.equal(settings.status, 'disabled')
    if (settings.status === 'disabled') {
      assert.equal(settings.reason, 'mode-mismatch')
      assert.deepEqual(settings.warnings, [
        { variable: 'STRIPE_PUBLISHABLE_KEY', problem: 'mode-mismatch' },
      ])
    }
  })

  test('CA-5: producción con sk_live + pk_live → enabled live', ({ assert }) => {
    const settings = resolveStripeSettings({
      secretKey: 'sk_live_fixtureSecret1',
      publishableKey: 'pk_live_fixturePub1',
      nodeEnv: 'production',
    })
    assert.equal(settings.status, 'enabled')
    if (settings.status === 'enabled') {
      assert.equal(settings.mode, 'live')
    }

    const log = buildStripeStartupLog(toStripeProviderDescription(settings))
    assert.equal(log.message, 'Cobro: Stripe en modo en vivo')
  })
})
