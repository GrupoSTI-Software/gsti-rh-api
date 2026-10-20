import { test } from '@japa/runner'
import {
  createCompetencyValidator,
  updateCompetencyValidator,
} from '#validators/competency'

/**
 * VLRH-H1792026430212 — Renombrar `transversal` a `functional` en el enum
 * `competency_type`. El validador es la primera barrera: sin BD, solo el
 * enum importa.
 *
 * CA-2 (regla 1): `technical` y `functional` son los únicos valores válidos.
 * CA-3 (regla 2): `transversal` se rechaza sin guardar nada.
 */

const validBase = { competencyName: 'Competencia de prueba' }

test.group('competency validators — enum functional (VLRH-H1792026430212)', () => {
  for (const validator of [
    { label: 'createCompetencyValidator', v: createCompetencyValidator },
    { label: 'updateCompetencyValidator', v: updateCompetencyValidator },
  ]) {
    test(`${validator.label}: acepta technical`, async ({ assert }) => {
      const data = await validator.v.validate({
        ...validBase,
        competencyType: 'technical',
      })
      assert.equal(data.competencyType, 'technical')
    })

    test(`${validator.label}: acepta functional`, async ({ assert }) => {
      const data = await validator.v.validate({
        ...validBase,
        competencyType: 'functional',
      })
      assert.equal(data.competencyType, 'functional')
    })

    test(`${validator.label}: rechaza transversal (CA-3)`, async ({ assert }) => {
      await assert.rejects(() =>
        validator.v.validate({ ...validBase, competencyType: 'transversal' })
      )
    })

    test(`${validator.label}: rechaza un valor arbitrario`, async ({ assert }) => {
      await assert.rejects(() =>
        validator.v.validate({ ...validBase, competencyType: 'value' })
      )
    })
  }
})
