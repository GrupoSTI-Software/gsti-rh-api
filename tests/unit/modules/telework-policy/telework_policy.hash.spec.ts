import { test } from '@japa/runner'
import { computeTeleworkPolicyContentHash } from '#modules/telework-policy/telework_policy.hash'
import type { TeleworkPolicyComponent } from '#models/telework_policy_template'

/**
 * Unit — sello de contenido de la Política de Teletrabajo
 * (USRH1783547655377, regla de negocio 2).
 */

function makeComponents(overrides: Partial<TeleworkPolicyComponent> = {}): TeleworkPolicyComponent[] {
  return [
    { key: '5_2_a', clause: '5.2.a', title: 'Título A', body: '<p>Texto A</p>', required: true, order: 1 },
    { key: '5_2_b', clause: '5.2.b', title: 'Título B', body: '<p>Texto B</p>', required: true, order: 2, ...overrides },
  ]
}

test.group('computeTeleworkPolicyContentHash', () => {
  test('es determinista: el mismo contenido produce siempre el mismo hash', ({ assert }) => {
    const components = makeComponents()

    const first = computeTeleworkPolicyContentHash('Política de Teletrabajo', components)
    const second = computeTeleworkPolicyContentHash('Política de Teletrabajo', components)

    assert.equal(first, second)
  })

  test('produce un hex sha256 de 64 caracteres', ({ assert }) => {
    const hash = computeTeleworkPolicyContentHash('Política', makeComponents())

    assert.match(hash, /^[0-9a-f]{64}$/)
  })

  test('es insensible al orden de las propiedades de cada componente', ({ assert }) => {
    const orderedFirst = [
      { key: '5_2_a', clause: '5.2.a', title: 'A', body: 'x', required: true, order: 1 },
    ]
    const orderedSecond = [
      { order: 1, required: true, body: 'x', title: 'A', clause: '5.2.a', key: '5_2_a' },
    ]

    const first = computeTeleworkPolicyContentHash('Título', orderedFirst)
    const second = computeTeleworkPolicyContentHash('Título', orderedSecond)

    assert.equal(first, second)
  })

  test('cambia si el título cambia', ({ assert }) => {
    const components = makeComponents()

    const first = computeTeleworkPolicyContentHash('Título 1', components)
    const second = computeTeleworkPolicyContentHash('Título 2', components)

    assert.notEqual(first, second)
  })

  test('cambia si el body de un solo componente cambia', ({ assert }) => {
    const first = computeTeleworkPolicyContentHash('Título', makeComponents())
    const second = computeTeleworkPolicyContentHash(
      'Título',
      makeComponents({ body: '<p>Texto B modificado</p>' })
    )

    assert.notEqual(first, second)
  })

  test('cambia si el orden de los componentes en el arreglo cambia (el arreglo sí es posicional)', ({
    assert,
  }) => {
    const components = makeComponents()
    const reversed = [...components].reverse()

    const first = computeTeleworkPolicyContentHash('Título', components)
    const second = computeTeleworkPolicyContentHash('Título', reversed)

    assert.notEqual(first, second)
  })
})
