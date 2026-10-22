import { test } from '@japa/runner'
import {
  findDuplicateKeys,
  findHierarchyIssues,
  orgStructureLabel,
  type OrgStructureIssue,
  type OrgStructureNodeRef,
} from '#modules/position-templates/position_template_structure.rules'
import type { PositionTemplateOrgStructure } from '#modules/position-templates/dto/position_template.dto'

/**
 * Reglas de jerarquía de una estructura plantilla (VLRH-H1792205820286, regla 6), sin
 * armar documentos: cada caso es una lista de puestos `clave → reporta_a`.
 */

const PUESTO = 'pt-trv-auxiliar-administrativo'

/** `'a>c'` = puesto `a` que reporta a `c`; `'r'` = puesto sin `reporta_a`. */
function nodes(...specs: string[]): OrgStructureNodeRef[] {
  return specs.map((spec, index) => {
    const [clave, reportaA] = spec.split('>')
    return { clave, puesto: PUESTO, reportaA, path: `areas.0.puestos.${index}` }
  })
}

function kindsOf(issues: OrgStructureIssue[]): OrgStructureIssue['kind'][] {
  return issues.map((issue) => issue.kind)
}

test.group('Reglas de jerarquía de la estructura plantilla', () => {
  test('una cima y sin ciclos no da hallazgos', ({ assert }) => {
    assert.deepEqual(findHierarchyIssues(nodes('gerente', 'auxiliar>gerente', 'cajero>auxiliar')), [])
  })

  test('ciclo de tres con cima: solo el ciclo, en su puesto que aparece primero', ({ assert }) => {
    const issues = findHierarchyIssues(nodes('r', 'a>c', 'b>a', 'c>b'))
    assert.deepEqual(issues, [{ kind: 'ciclo', path: 'areas.0.puestos.1.reporta_a', chain: ['a', 'c', 'b'] }])
  })

  test('el ciclo se reporta en su primer puesto aunque el recorrido entre por otro', ({ assert }) => {
    const issues = findHierarchyIssues(nodes('r', 'x>b', 'a>b', 'b>a'))
    assert.deepEqual(issues, [{ kind: 'ciclo', path: 'areas.0.puestos.2.reporta_a', chain: ['a', 'b'] }])
  })

  test('autorreporte es un ciclo de largo uno', ({ assert }) => {
    const issues = findHierarchyIssues(nodes('gerente', 'auxiliar>auxiliar'))
    assert.deepEqual(issues, [{ kind: 'ciclo', path: 'areas.0.puestos.1.reporta_a', chain: ['auxiliar'] }])
  })

  test('dos cimas o ninguna dan un solo raiz_invalida', ({ assert }) => {
    assert.deepEqual(findHierarchyIssues(nodes('gerente', 'auxiliar')), [
      { kind: 'raiz_invalida', roots: ['gerente', 'auxiliar'] },
    ])
    assert.deepEqual(kindsOf(findHierarchyIssues(nodes('a>b', 'b>a'))), ['raiz_invalida', 'ciclo'])
  })

  test('reporta_a inexistente no cuenta como cima ni como ciclo', ({ assert }) => {
    assert.deepEqual(findHierarchyIssues(nodes('gerente', 'auxiliar>jefe')), [
      { kind: 'reporta_a_inexistente', path: 'areas.0.puestos.1.reporta_a', clave: 'auxiliar', reportaA: 'jefe' },
    ])
  })

  test('el puesto con clave repetida no entra a la jerarquía', ({ assert }) => {
    assert.deepEqual(findHierarchyIssues(nodes('gerente', 'auxiliar>gerente', 'gerente')), [])
  })

  test('una cadena de 5000 puestos no desborda la pila', ({ assert }) => {
    const chain = Array.from({ length: 5000 }, (_, index) =>
      index === 0 ? 'p0' : `p${index}>p${index - 1}`
    )
    assert.deepEqual(findHierarchyIssues(nodes(...chain)), [])
    const cyclic = [...chain.slice(1), 'p0>p4999']
    assert.deepEqual(kindsOf(findHierarchyIssues(nodes(...cyclic))), ['raiz_invalida', 'ciclo'])
  })

  test('áreas y puestos con clave repetida, desde la segunda aparición', ({ assert }) => {
    const structure: PositionTemplateOrgStructure = {
      giro: 'restaurantes',
      rango_empleados: '1-10',
      areas: [
        {
          codigo: 'direccion',
          nombre: 'Dirección',
          puestos: [{ clave: 'gerente', puesto: PUESTO, reporta_a: undefined }],
        },
        {
          codigo: 'direccion',
          nombre: 'Dirección operativa',
          puestos: [{ clave: 'gerente', puesto: PUESTO, reporta_a: 'gerente' }],
        },
      ],
      atribucion: { fuente: 'propio', id_en_fuente: undefined, adaptado: false },
    }
    assert.deepEqual(findDuplicateKeys(structure), [
      { kind: 'clave_duplicada', path: 'areas.1.codigo', clave: 'direccion' },
      { kind: 'clave_duplicada', path: 'areas.1.puestos.0.clave', clave: 'gerente' },
    ])
    assert.equal(orgStructureLabel(structure), 'restaurantes 1-10')
  })
})
