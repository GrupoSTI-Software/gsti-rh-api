import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import {
  ADMS_COMMAND_RETENTION_MIN_DAYS,
  ADMS_PHOTO_PUBLICATION_RETENTION_MIN_DAYS,
  ADMS_QUARANTINE_RETENTION_MIN_DAYS,
  ADMS_RAW_RETENTION_MIN_DAYS,
  admsCommandRetentionDays,
  admsRawFailedRetentionDays,
  admsRawRetentionDays,
  admsRetentionSummary,
} from '#modules/adms/retention/retention.constants'

/**
 * Plazos de retención del canal (spec ADMS 13.12).
 *
 * AISLAMIENTO: estos plazos salen del entorno, así que el caso solo dice la
 * verdad si el entorno es el de la suite y no el de la máquina. `.env.test`
 * —versionado, sin secretos— fija las cinco variables a los valores por
 * defecto del código justamente para eso: el `.env` de desarrollo de Willy
 * tiene `ADMS_PHOTO_PUBLICATION_RETENTION_DAYS=1`, y sin ese anclaje este
 * archivo afirmaba "los plazos son los del spec" mientras leía un 1. El primer
 * caso comprueba el anclaje antes de comprobar los valores, para que quien
 * rompa `.env.test` (o lo pise desde un `.env.test.local`) vea el motivo y no
 * una comparación numérica suelta.
 */

/** Los cinco plazos del spec, con su mínimo en código. Es el contrato. */
const PLAZOS = [
  {
    variable: 'ADMS_RAW_RETENTION_DAYS',
    resumen: 'rawDays',
    porDefecto: 180,
    minimo: ADMS_RAW_RETENTION_MIN_DAYS,
  },
  {
    variable: 'ADMS_RAW_FAILED_RETENTION_DAYS',
    resumen: 'rawFailedDays',
    porDefecto: 30,
    minimo: ADMS_RAW_RETENTION_MIN_DAYS,
  },
  {
    variable: 'ADMS_COMMAND_RETENTION_DAYS',
    resumen: 'commandDays',
    porDefecto: 365,
    minimo: ADMS_COMMAND_RETENTION_MIN_DAYS,
  },
  {
    variable: 'ADMS_PHOTO_PUBLICATION_RETENTION_DAYS',
    resumen: 'photoPublicationDays',
    porDefecto: 7,
    minimo: ADMS_PHOTO_PUBLICATION_RETENTION_MIN_DAYS,
  },
  {
    variable: 'ADMS_QUARANTINE_RETENTION_DAYS',
    resumen: 'quarantineDays',
    porDefecto: 30,
    minimo: ADMS_QUARANTINE_RETENTION_MIN_DAYS,
  },
] as const

/**
 * Comentario que `.env.example` escribe justo encima de una variable.
 *
 * Se recogen las líneas de comentario contiguas anteriores a la declaración,
 * porque el bloque de cada variable puede llevar una o dos.
 */
function comentarioDe(envExample: string, variable: string): string {
  const lineas = envExample.split('\n')
  const indice = lineas.findIndex((linea) => linea.startsWith(`${variable}=`))
  if (indice === -1) {
    throw new Error(`.env.example no declara ${variable}`)
  }

  const comentarios: string[] = []
  for (let i = indice - 1; i >= 0 && lineas[i].startsWith('#'); i -= 1) {
    comentarios.unshift(lineas[i])
  }
  return comentarios.join('\n')
}

test.group('Plazos de retencion del canal', () => {
  test('la suite fija las cinco variables: no hereda el .env de la maquina', ({ assert }) => {
    for (const plazo of PLAZOS) {
      assert.isDefined(
        process.env[plazo.variable],
        `${plazo.variable} no esta fijada: .env.test debe anclarla para que este archivo no lea el .env local`
      )
    }
  })

  test('los plazos efectivos son los del spec', ({ assert }) => {
    const summary = admsRetentionSummary()
    for (const plazo of PLAZOS) {
      assert.equal(summary[plazo.resumen], plazo.porDefecto, `${plazo.variable} fuera del spec`)
    }
  })

  /**
   * El minimo existe porque un plazo de un dia puesto por error borraria la
   * evidencia con la que se reconstruye una nomina cuando alguien reclama.
   */
  test('ningun plazo puede quedar por debajo de su minimo', ({ assert }) => {
    assert.isAtLeast(admsRawRetentionDays(), ADMS_RAW_RETENTION_MIN_DAYS)
    assert.isAtLeast(admsRawFailedRetentionDays(), ADMS_RAW_RETENTION_MIN_DAYS)
    assert.isAtLeast(admsCommandRetentionDays(), ADMS_COMMAND_RETENTION_MIN_DAYS)
  })

  test('todos los plazos son enteros de dias', ({ assert }) => {
    for (const value of Object.values(admsRetentionSummary())) {
      assert.isTrue(Number.isInteger(value), `${value} deberia ser entero`)
      assert.isAbove(value, 0)
    }
  })

  /**
   * `.env.example` es lo unico que lee quien monta un entorno nuevo. Documentaba
   * "Default 1" para la publicacion de foto cuando el codigo usa 7: quien
   * copiara el ejemplo tal cual creeria estar conservando una semana de
   * publicaciones y estaria conservando un dia.
   */
  test('.env.example documenta el mismo default y el mismo minimo que el codigo', ({ assert }) => {
    const envExample = readFileSync(join(process.cwd(), '.env.example'), 'utf-8')

    for (const plazo of PLAZOS) {
      const comentario = comentarioDe(envExample, plazo.variable)
      const documentado = comentario.match(/Default (\d+), mínimo (\d+)\./)

      assert.isNotNull(
        documentado,
        `El comentario de ${plazo.variable} debe decir "Default N, mínimo M."`
      )
      assert.equal(
        Number(documentado![1]),
        plazo.porDefecto,
        `${plazo.variable}: el default documentado no es el del codigo`
      )
      assert.equal(
        Number(documentado![2]),
        plazo.minimo,
        `${plazo.variable}: el minimo documentado no es el del codigo`
      )
    }
  })
})
