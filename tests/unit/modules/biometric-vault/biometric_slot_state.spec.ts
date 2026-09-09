import { test } from '@japa/runner'
import {
  BIOMETRIC_SLOT_STATE,
  betterState,
  resolveSlotState,
} from '#modules/biometric-vault/device-biometrics/biometric_slot_state'

test.group('Situacion de un biometrico frente a un equipo', () => {
  test('lo que ya esta dentro del aparato no necesita version', ({ assert }) => {
    const state = resolveSlotState({
      present: true,
      templateMajorVer: null,
      deviceVersion: null,
    })

    assert.equal(state, BIOMETRIC_SLOT_STATE.HERE)
  })

  test('misma generacion de algoritmo: se puede copiar sin la persona', ({ assert }) => {
    const state = resolveSlotState({
      present: false,
      templateMajorVer: '10',
      deviceVersion: '10',
    })

    assert.equal(state, BIOMETRIC_SLOT_STATE.COPYABLE)
  })

  test('generacion distinta: hay que capturar de nuevo en ese equipo', ({ assert }) => {
    // El caso medido en hardware: un template version 10 del SpeedFace V5L
    // frente a un SenseFace 2A que trabaja en 13. Ese dedo no sirve alli.
    const state = resolveSlotState({
      present: false,
      templateMajorVer: '10',
      deviceVersion: '13',
    })

    assert.equal(state, BIOMETRIC_SLOT_STATE.INCOMPATIBLE)
  })

  test('la version se compara por su parte entera', ({ assert }) => {
    assert.equal(
      resolveSlotState({ present: false, templateMajorVer: '13.2', deviceVersion: '13' }),
      BIOMETRIC_SLOT_STATE.COPYABLE
    )
  })

  test('sin version conocida no se promete nada', ({ assert }) => {
    // Un equipo que aun no dice con que algoritmo trabaja, o un template que
    // subio sin declararla: darlo por copiable manda un dato que sera rechazado.
    assert.equal(
      resolveSlotState({ present: false, templateMajorVer: '10', deviceVersion: null }),
      BIOMETRIC_SLOT_STATE.UNKNOWN
    )
    assert.equal(
      resolveSlotState({ present: false, templateMajorVer: null, deviceVersion: '10' }),
      BIOMETRIC_SLOT_STATE.UNKNOWN
    )
    assert.equal(
      resolveSlotState({ present: false, templateMajorVer: 'sin numero', deviceVersion: '10' }),
      BIOMETRIC_SLOT_STATE.UNKNOWN
    )
  })
})

test.group('El mismo dedo con varias versiones guardadas', () => {
  test('gana estar dentro del aparato sobre poder copiarse', ({ assert }) => {
    assert.equal(
      betterState(BIOMETRIC_SLOT_STATE.COPYABLE, BIOMETRIC_SLOT_STATE.HERE),
      BIOMETRIC_SLOT_STATE.HERE
    )
    assert.equal(
      betterState(BIOMETRIC_SLOT_STATE.HERE, BIOMETRIC_SLOT_STATE.COPYABLE),
      BIOMETRIC_SLOT_STATE.HERE
    )
  })

  test('una copia posible pesa mas que una version que no sirve', ({ assert }) => {
    assert.equal(
      betterState(BIOMETRIC_SLOT_STATE.INCOMPATIBLE, BIOMETRIC_SLOT_STATE.COPYABLE),
      BIOMETRIC_SLOT_STATE.COPYABLE
    )
  })

  test('el primero manda cuando no hay con que compararlo', ({ assert }) => {
    assert.equal(
      betterState(null, BIOMETRIC_SLOT_STATE.INCOMPATIBLE),
      BIOMETRIC_SLOT_STATE.INCOMPATIBLE
    )
  })
})
