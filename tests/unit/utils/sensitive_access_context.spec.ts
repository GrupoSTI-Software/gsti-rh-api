import { test } from '@japa/runner'
import {
  SensitiveAccessContext,
  type SensitiveAccessStore,
  type SensitiveWriteDecision,
} from '#utils/sensitive_access_context'
import type { LegalCategory } from '#constants/sensitive_fields'

const deniedRead: Record<LegalCategory, boolean> = {
  identificacion: false,
  contacto: false,
  financiero: false,
  salud: false,
  biometrico: false,
}

const deniedWrite: Record<LegalCategory, SensitiveWriteDecision> = {
  identificacion: 'denied',
  contacto: 'denied',
  financiero: 'denied',
  salud: 'denied',
  biometrico: 'denied',
}

function store(overrides: Partial<SensitiveAccessStore> = {}): SensitiveAccessStore {
  return {
    read: { ...deniedRead, ...overrides.read },
    write: { ...deniedWrite, ...overrides.write },
    unguarded: overrides.unguarded,
  }
}

test.group('SensitiveAccessContext', () => {
  test('sin contexto activo canRead y canWrite son false y isActive es false', ({ assert }) => {
    assert.isFalse(SensitiveAccessContext.isActive())
    assert.isFalse(SensitiveAccessContext.canRead('contacto'))
    assert.isFalse(SensitiveAccessContext.canWrite('financiero'))
    assert.isFalse(SensitiveAccessContext.isUnguarded())
  })

  test('canRead lee el mapa read y canWrite solo es true si write es allowed', ({ assert }) => {
    SensitiveAccessContext.run(
      store({
        read: { ...deniedRead, contacto: true },
        write: { ...deniedWrite, financiero: 'allowed', salud: 'unresolved' },
      }),
      () => {
        assert.isTrue(SensitiveAccessContext.isActive())
        assert.isTrue(SensitiveAccessContext.canRead('contacto'))
        assert.isFalse(SensitiveAccessContext.canRead('financiero'))
        assert.isTrue(SensitiveAccessContext.canWrite('financiero'))
        assert.isFalse(SensitiveAccessContext.canWrite('salud'))
        assert.isFalse(SensitiveAccessContext.canWrite('contacto'))
        assert.equal(SensitiveAccessContext.writeDecision('salud'), 'unresolved')
        assert.equal(SensitiveAccessContext.writeDecision('contacto'), 'denied')
      }
    )
  })

  test('runUnguarded marca unguarded, conserva read/write y registra el motivo', ({ assert }) => {
    SensitiveAccessContext.run(
      store({ read: { ...deniedRead, biometrico: true } }),
      () => {
        assert.isFalse(SensitiveAccessContext.isUnguarded())
        SensitiveAccessContext.runUnguarded('renovación del token biométrico en consulta de foto', () => {
          assert.isTrue(SensitiveAccessContext.isUnguarded())
          assert.isTrue(SensitiveAccessContext.isActive())
          assert.isTrue(SensitiveAccessContext.canRead('biometrico'))
          assert.isFalse(SensitiveAccessContext.canWrite('biometrico'))
        })
        assert.isFalse(SensitiveAccessContext.isUnguarded())
      }
    )
  })

  test('al salir de run el store no se filtra', ({ assert }) => {
    SensitiveAccessContext.run(store({ write: { ...deniedWrite, salud: 'allowed' } }), () => {
      assert.isTrue(SensitiveAccessContext.canWrite('salud'))
    })
    assert.isFalse(SensitiveAccessContext.canWrite('salud'))
  })
})
