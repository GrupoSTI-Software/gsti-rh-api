import { test } from '@japa/runner'
import {
  buildMrrConcentration,
  SIN_GRUPO_NOMBRE,
  type MrrConcentrationRow,
} from '#services/platform_mrr_service'

/**
 * USRH1788052455659 — reglas del reparto del MRR actual neto entre grupos.
 *
 * La pura recibe las filas ya agrupadas por la base y el conteo de grupos vivos,
 * así que estas pruebas son deterministas: no tocan MySQL ni el reloj. Lo que
 * depende de la base —el universo, los `LEFT JOIN` y la baja lógica del grupo—
 * se verifica contra el servidor en la Task 4.
 */

function fila(overrides: Partial<MrrConcentrationRow> = {}): MrrConcentrationRow {
  return {
    platformTenantGroupId: 7,
    nombre: 'Grupo Norte',
    tenants: 1,
    suscripciones: 1,
    mrrNetoCents: 100_000,
    ...overrides,
  }
}

test.group('buildMrrConcentration', () => {
  test('CA-3 — la suma de las unidades es exactamente el total, sin tolerancia', ({ assert }) => {
    const { concentracion, netoCents } = buildMrrConcentration(
      [
        fila({ platformTenantGroupId: 7, nombre: 'Grupo Norte', mrrNetoCents: 130_001 }),
        fila({ platformTenantGroupId: 9, nombre: 'Grupo Sur', mrrNetoCents: 65_003 }),
        fila({ platformTenantGroupId: null, nombre: null, mrrNetoCents: 129_999, tenants: 2 }),
      ],
      2
    )

    const suma = concentracion.unidades.reduce((acc, u) => acc + u.mrrNetoCents, 0)

    assert.equal(suma, netoCents)
    assert.equal(netoCents, 325_003)
  })

  test('CA-2 — los clientes sin grupo son una sola unidad llamada Sin grupo, sin identidad de clientes', ({
    assert,
  }) => {
    const { concentracion } = buildMrrConcentration(
      [fila({ platformTenantGroupId: null, nombre: null, tenants: 3, suscripciones: 4, mrrNetoCents: 90_000 })],
      0
    )

    assert.lengthOf(concentracion.unidades, 1)
    const unidad = concentracion.unidades[0]!
    assert.equal(unidad.tipo, 'sin-grupo')
    assert.equal(unidad.nombre, SIN_GRUPO_NOMBRE)
    assert.isNull(unidad.platformTenantGroupId)
    assert.equal(unidad.tenants, 3)
    assert.deepEqual(Object.keys(unidad).sort(), [
      'mrrNetoCents',
      'nombre',
      'participacionPct',
      'platformTenantGroupId',
      'tenants',
      'tipo',
    ])
  })

  test('CA-5 — la participación se deriva del importe, a un decimal, y no se fuerza el 100', ({
    assert,
  }) => {
    const { concentracion } = buildMrrConcentration(
      [
        fila({ platformTenantGroupId: 7, nombre: 'A', mrrNetoCents: 100_000 }),
        fila({ platformTenantGroupId: 8, nombre: 'B', mrrNetoCents: 100_000 }),
        fila({ platformTenantGroupId: 9, nombre: 'C', mrrNetoCents: 100_000 }),
      ],
      3
    )

    const pcts = concentracion.unidades.map((u) => u.participacionPct)

    assert.deepEqual(pcts, [33.3, 33.3, 33.3])
    assert.notEqual(
      pcts.reduce((a, b) => a + b, 0),
      100
    )
  })

  test('regla 8 del contrato — orden por importe descendente, desempate por nombre ascendente', ({
    assert,
  }) => {
    const { concentracion } = buildMrrConcentration(
      [
        fila({ platformTenantGroupId: 7, nombre: 'Zeta', mrrNetoCents: 50_000 }),
        fila({ platformTenantGroupId: null, nombre: null, mrrNetoCents: 200_000 }),
        fila({ platformTenantGroupId: 8, nombre: 'Alfa', mrrNetoCents: 50_000 }),
      ],
      2
    )

    assert.deepEqual(
      concentracion.unidades.map((u) => u.nombre),
      [SIN_GRUPO_NOMBRE, 'Alfa', 'Zeta']
    )
  })

  test('CA-10 — las unidades sin ingreso no se listan y se informa cuántos grupos quedaron fuera', ({
    assert,
  }) => {
    const { concentracion } = buildMrrConcentration(
      [
        fila({ platformTenantGroupId: 7, nombre: 'Con ingreso', mrrNetoCents: 100_000 }),
        fila({ platformTenantGroupId: 8, nombre: 'Sin ingreso', mrrNetoCents: 0, suscripciones: 0, tenants: 0 }),
      ],
      4
    )

    assert.lengthOf(concentracion.unidades, 1)
    assert.equal(concentracion.unidades[0]!.nombre, 'Con ingreso')
    assert.equal(concentracion.gruposOmitidosSinMrr, 3)
  })

  test('regla 7 del contrato — la bolsa Sin grupo también se omite cuando su importe es cero', ({
    assert,
  }) => {
    const { concentracion } = buildMrrConcentration(
      [
        fila({ platformTenantGroupId: 7, nombre: 'Único', mrrNetoCents: 100_000 }),
        fila({ platformTenantGroupId: null, nombre: null, mrrNetoCents: 0, suscripciones: 0, tenants: 0 }),
      ],
      1
    )

    assert.lengthOf(concentracion.unidades, 1)
    assert.equal(concentracion.unidades[0]!.tipo, 'grupo')
  })

  test('CA-7 — un solo grupo con todo el ingreso sale al 100.0 y es resultado válido', ({
    assert,
  }) => {
    const { concentracion } = buildMrrConcentration(
      [fila({ platformTenantGroupId: 7, nombre: 'Único', mrrNetoCents: 480_000, tenants: 3 })],
      1
    )

    assert.lengthOf(concentracion.unidades, 1)
    assert.equal(concentracion.unidades[0]!.participacionPct, 100)
    assert.equal(concentracion.gruposOmitidosSinMrr, 0)
  })

  test('CA-9 — sin suscripciones activas el reparto llega vacío y no hay división entre cero', ({
    assert,
  }) => {
    const { concentracion, netoCents, suscripciones } = buildMrrConcentration([], 2)

    assert.deepEqual(concentracion.unidades, [])
    assert.equal(concentracion.gruposOmitidosSinMrr, 2)
    assert.equal(netoCents, 0)
    assert.equal(suscripciones, 0)
  })

  test('el total y el conteo se plegan de las mismas filas del desglose', ({ assert }) => {
    const { netoCents, suscripciones } = buildMrrConcentration(
      [
        fila({ platformTenantGroupId: 7, nombre: 'A', suscripciones: 3, mrrNetoCents: 100_000 }),
        fila({ platformTenantGroupId: null, nombre: null, suscripciones: 2, mrrNetoCents: 50_000 }),
      ],
      1
    )

    assert.equal(netoCents, 150_000)
    assert.equal(suscripciones, 5)
  })

  test('el desglose nunca publica identidad de clientes', ({ assert }) => {
    const { concentracion } = buildMrrConcentration(
      [fila({ platformTenantGroupId: null, nombre: null, tenants: 2, mrrNetoCents: 10_000 })],
      0
    )

    const json = JSON.stringify(concentracion)

    assert.notInclude(json, 'businessUnit')
    assert.notInclude(json, 'business_unit')
  })

  test('base declara sobre qué cifra se reparte', ({ assert }) => {
    const { concentracion } = buildMrrConcentration([fila()], 1)

    assert.equal(concentracion.base, 'mrr-actual-neto')
  })
})
