import { test } from '@japa/runner'
import {
  COMPETENCY_STANDARD_LEVELS,
  COMPETENCY_STANDARD_LEVEL_POSITIONS,
} from '#constants/competency_standard_levels'

/**
 * Contrato de la escala estándar (VLRH-H1792026425571): la importa el formato de
 * plantillas y la siembra VLRH-H1792026434866, que traduce por posición.
 */
test.group('Escala estándar de niveles de competencia', () => {
  test('trae 5 niveles con posiciones 1 a 5 contiguas y únicas', ({ assert }) => {
    assert.deepEqual(
      COMPETENCY_STANDARD_LEVELS.map((level) => level.position),
      [1, 2, 3, 4, 5]
    )
    assert.deepEqual([...COMPETENCY_STANDARD_LEVEL_POSITIONS], [1, 2, 3, 4, 5])
  })

  test('las keys son únicas y las etiquetas caben en 50 caracteres', ({ assert }) => {
    const keys = COMPETENCY_STANDARD_LEVELS.map((level) => level.key)
    assert.lengthOf(new Set(keys), keys.length)
    for (const level of COMPETENCY_STANDARD_LEVELS) {
      assert.isAtMost(level.label.length, 50, level.key)
      assert.isAbove(level.label.trim().length, 0, level.key)
    }
  })
})
