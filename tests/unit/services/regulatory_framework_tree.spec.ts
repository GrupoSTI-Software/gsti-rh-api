import { test } from '@japa/runner'
import {
  buildClauseTree,
  countTreeNodes,
} from '../../../app/modules/regulatory-framework/regulatory_framework.tree.js'
import type { RegulationClauseRow } from '../../../app/modules/regulatory-framework/dto/regulatory_framework.dto.js'

/**
 * USRH1785167064404 — helper puro de armado del árbol de numerales.
 * Reglas 3 y 4: jerarquía padre-hijo correcta y orden oficial, sin depender
 * del orden de llegada de las filas (el `ord` de la semilla es por-grupo,
 * no global: distintos padres pueden compartir el mismo `ord`).
 */

function row(
  id: number,
  parentId: number | null,
  code: string,
  ord: number
): RegulationClauseRow {
  return {
    id,
    parentId,
    code,
    ord,
    titleKey: null,
    obligationKey: `regulatory.clauses.test.${code.replace(/\./g, '_')}.obligation`,
    explanationKey: `regulatory.clauses.test.${code.replace(/\./g, '_')}.explanation`,
    rationaleKey: `regulatory.clauses.test.${code.replace(/\./g, '_')}.rationale`,
    auditCriteriaKey: `regulatory.clauses.test.${code.replace(/\./g, '_')}.audit_criteria`,
    applicabilityKey: null,
  }
}

test.group('buildClauseTree', () => {
  test('anida sub-numerales bajo su numeral padre (5.1 → 5.1.1, 5.1.2, 5.1.3)', ({ assert }) => {
    const clauses = [
      row(1, null, '5', 1),
      row(2, 1, '5.1', 1),
      row(3, 2, '5.1.1', 1),
      row(4, 2, '5.1.2', 2),
      row(5, 2, '5.1.3', 3),
    ]

    const tree = buildClauseTree(clauses)

    assert.lengthOf(tree, 1)
    const [root] = tree
    assert.equal(root.code, '5')
    assert.lengthOf(root.children, 1)

    const [c51] = root.children
    assert.equal(c51.code, '5.1')
    assert.lengthOf(c51.children, 3)
    assert.deepEqual(c51.children.map((c) => c.code), ['5.1.1', '5.1.2', '5.1.3'])
    assert.deepEqual(
      c51.children.map((c) => c.children),
      [[], [], []]
    )
  })

  test('un numeral hoja (5.7) llega con children: []', ({ assert }) => {
    const clauses = [row(1, null, '5', 1), row(2, 1, '5.7', 7)]
    const tree = buildClauseTree(clauses)
    const c57 = tree[0].children[0]
    assert.equal(c57.code, '5.7')
    assert.deepEqual(c57.children, [])
  })

  test('ordena hermanos por ord aunque lleguen desordenados y con ord repetido entre grupos distintos', ({
    assert,
  }) => {
    // 5.8.a/b/c y 8.1.1/2 comparten valores de ord (1, 2) — cada grupo se
    // ordena de forma independiente, sin depender del orden de llegada.
    const clauses = [
      row(10, null, '8', 2),
      row(11, 10, '8.1', 1),
      row(13, 11, '8.1.2', 2),
      row(12, 11, '8.1.1', 1),
      row(1, null, '5', 1),
      row(2, 1, '5.8', 8),
      row(5, 2, '5.8.c', 3),
      row(3, 2, '5.8.a', 1),
      row(4, 2, '5.8.b', 2),
    ]

    const tree = buildClauseTree(clauses)

    const c5 = tree.find((n) => n.code === '5')!
    const c58 = c5.children.find((n) => n.code === '5.8')!
    assert.deepEqual(c58.children.map((c) => c.code), ['5.8.a', '5.8.b', '5.8.c'])

    const c8 = tree.find((n) => n.code === '8')!
    const c81 = c8.children.find((n) => n.code === '8.1')!
    assert.deepEqual(c81.children.map((c) => c.code), ['8.1.1', '8.1.2'])
  })

  test('countTreeNodes cuenta raíces + todos los descendientes', ({ assert }) => {
    const clauses = [
      row(1, null, '5', 1),
      row(2, 1, '5.1', 1),
      row(3, 2, '5.1.1', 1),
      row(4, 2, '5.1.2', 2),
      row(5, null, '8', 2),
    ]
    const tree = buildClauseTree(clauses)
    assert.equal(countTreeNodes(tree), 5)
  })

  test('lista vacía produce árbol vacío (sin lanzar)', ({ assert }) => {
    assert.deepEqual(buildClauseTree([]), [])
  })
})
