import { test } from '@japa/runner'
import {
  BillingProviderEventHandlerRegistry,
  billingProviderEventHandlers,
} from '#modules/billing-provider/billing_provider_event_handlers'
import BillingProviderInvoiceCreatedHandler from '#modules/billing-provider/billing_provider_invoice_created.handler'
import BillingProviderInvoicePaidHandler from '#modules/billing-provider/billing_provider_invoice_paid.handler'

test.group('BillingProviderEventHandlerRegistry (7579 / CA-11)', () => {
  test('registra, resuelve y da de baja un tipo', ({ assert }) => {
    const registry = new BillingProviderEventHandlerRegistry()
    const handler = { handle: async () => ({ status: 'processed' as const }) }

    const unregister = registry.register('valanserh.fixture_processed', handler)
    assert.strictEqual(registry.resolve('valanserh.fixture_processed'), handler)

    unregister()
    assert.isNull(registry.resolve('valanserh.fixture_processed'))
  })

  test('registrar el mismo tipo dos veces lanza Error', ({ assert }) => {
    const registry = new BillingProviderEventHandlerRegistry()
    const handler = { handle: async () => ({ status: 'processed' as const }) }
    registry.register('invoice.created', handler)

    assert.throws(() => registry.register('invoice.created', handler), 'Manejador ya registrado')
  })

  test('tipo no registrado devuelve null', ({ assert }) => {
    const registry = new BillingProviderEventHandlerRegistry()
    assert.isNull(registry.resolve('invoice.created'))
  })

  test('CA-14: registro global de invoice.created (7665)', ({ assert }) => {
    const handler = billingProviderEventHandlers.resolve('invoice.created')
    assert.instanceOf(handler, BillingProviderInvoiceCreatedHandler)
  })

  test('CA-14: registro global de invoice.paid (7693)', ({ assert }) => {
    const handler = billingProviderEventHandlers.resolve('invoice.paid')
    assert.instanceOf(handler, BillingProviderInvoicePaidHandler)
  })
})
