import { test } from '@japa/runner'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DateTime } from 'luxon'
import env from '#start/env'
import {
  PERSON_RELEASE_FUTURE_TOLERANCE_SECONDS,
  PERSON_RELEASE_WINDOW_MINUTES_CAP,
  PERSON_RELEASE_WINDOW_MINUTES_DEFAULT,
  PERSON_RELEASE_WINDOW_MINUTES_MIN,
  getPersonReleaseWindowMinutes,
  isWithinPersonReleaseWindow,
} from '#constants/person_release.constants'

/**
 * USRH1789698261608 — ventana de frescura de la compensación del alta fallida.
 *
 * Regla 2: solo se libera lo creado dentro de la ventana. Regla 3: la ventana
 * sale del entorno con default en código, saturada a un tope que solo cambia
 * con código y revisión (CA-10). CA-5: acotada por ambos lados — una fecha
 * futura ensancharía la ventana en vez de cerrarla.
 *
 * `env.set` escribe el valor validado y `process.env` a la vez, así que el
 * accesor lo lee de inmediato (mismo molde que assist_punch_time_window.spec).
 */

const VARIABLE = 'PERSON_RELEASE_WINDOW_MINUTES'

/** Ejecuta `run` con la variable fijada y la restaura pase lo que pase. */
function withWindow(value: string, run: () => void) {
  const previous = getPersonReleaseWindowMinutes()
  env.set(VARIABLE, value)
  try {
    run()
  } finally {
    env.set(VARIABLE, String(previous))
  }
}

test.group('person_release.constants — ventana configurable (CA-10)', () => {
  test('los topes de producto son los del spec', ({ assert }) => {
    assert.equal(PERSON_RELEASE_WINDOW_MINUTES_DEFAULT, 60)
    assert.equal(PERSON_RELEASE_WINDOW_MINUTES_MIN, 1)
    assert.equal(PERSON_RELEASE_WINDOW_MINUTES_CAP, 1_440)
    assert.equal(PERSON_RELEASE_FUTURE_TOLERANCE_SECONDS, 120)
  })

  test('vacía o no numérica cae al default de 60, nunca a NaN', ({ assert }) => {
    withWindow('', () => {
      assert.equal(getPersonReleaseWindowMinutes(), PERSON_RELEASE_WINDOW_MINUTES_DEFAULT)
    })
    withWindow('sesenta', () => {
      assert.equal(getPersonReleaseWindowMinutes(), PERSON_RELEASE_WINDOW_MINUTES_DEFAULT)
    })
  })

  test('un valor absurdo se satura al tope de código', ({ assert }) => {
    withWindow('525600', () => {
      assert.equal(getPersonReleaseWindowMinutes(), PERSON_RELEASE_WINDOW_MINUTES_CAP)
    })
    withWindow('0', () => {
      assert.equal(getPersonReleaseWindowMinutes(), PERSON_RELEASE_WINDOW_MINUTES_MIN)
    })
    withWindow('-5', () => {
      assert.equal(getPersonReleaseWindowMinutes(), PERSON_RELEASE_WINDOW_MINUTES_MIN)
    })
  })

  test('un valor dentro del intervalo se aplica tal cual y se lee en cada evaluación', ({
    assert,
  }) => {
    withWindow('5', () => {
      assert.equal(getPersonReleaseWindowMinutes(), 5)
      assert.isTrue(isWithinPersonReleaseWindow(DateTime.now().minus({ minutes: 4 })))
      assert.isFalse(isWithinPersonReleaseWindow(DateTime.now().minus({ minutes: 6 })))
    })
  })

  test('.env.example documenta la variable', ({ assert }) => {
    const example = readFileSync(join(process.cwd(), '.env.example'), 'utf8')
    assert.include(example, `${VARIABLE}=`)
  })
})

test.group('isWithinPersonReleaseWindow — ventana bilateral (CA-5)', () => {
  test('una fecha reciente dentro de la ventana es liberable', ({ assert }) => {
    assert.isTrue(isWithinPersonReleaseWindow(DateTime.now()))
    assert.isTrue(isWithinPersonReleaseWindow(DateTime.now().minus({ minutes: 1 })))
  })

  test('una fecha más vieja que la ventana no es liberable', ({ assert }) => {
    const window = getPersonReleaseWindowMinutes()
    assert.isFalse(isWithinPersonReleaseWindow(DateTime.now().minus({ minutes: window + 1 })))
    assert.isFalse(isWithinPersonReleaseWindow(DateTime.now().minus({ days: 2 })))
  })

  test('hacia el futuro solo se tolera el desfase de reloj', ({ assert }) => {
    assert.isTrue(isWithinPersonReleaseWindow(DateTime.now().plus({ seconds: 60 })))
    assert.isFalse(
      isWithinPersonReleaseWindow(
        DateTime.now().plus({ seconds: PERSON_RELEASE_FUTURE_TOLERANCE_SECONDS + 30 })
      )
    )
    assert.isFalse(isWithinPersonReleaseWindow(DateTime.now().plus({ days: 2 })))
  })

  test('nula o inválida no es liberable (fallo cerrado)', ({ assert }) => {
    assert.isFalse(isWithinPersonReleaseWindow(null))
    assert.isFalse(isWithinPersonReleaseWindow(undefined))
    assert.isFalse(isWithinPersonReleaseWindow(DateTime.invalid('corrupta')))
  })
})
