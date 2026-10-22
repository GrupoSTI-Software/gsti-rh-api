import { test } from '@japa/runner'
import type EmployeeTeleworkLocation from '#models/employee_telework_location'
import {
  isSameTeleworkAddress,
  normalizeTeleworkAddressField,
  shouldInvalidateTeleworkChecklist,
  toTeleworkLocationSnapshot,
  type TeleworkAddress,
  type TeleworkLocationChange,
  type TeleworkLocationReference,
  type TeleworkLocationSnapshot,
} from '#utils/telework_location_change'

/**
 * VLRH-H1791306078668 — regla pura que decide si un cambio de lugar de teletrabajo
 * invalida la lista de verificación vigente.
 *
 * Suite sin BD: el modelo se importa solo como tipo; no hay HTTP ni transacción.
 * Matriz de decisión: anexo A (casos 1 a 20), un test por fila.
 */

/**
 * Campos del modelo que el snapshot consume. El modelo se importa solo como tipo
 * (`import type`), así que la fila fake se tipa por esos campos y no arranca el modelo.
 */
type TeleworkLocationRow = Pick<
  EmployeeTeleworkLocation,
  | 'employeeTeleworkLocationId'
  | 'employeeTeleworkLocationIsFixedAgreed'
  | 'employeeTeleworkLocationStreet'
  | 'employeeTeleworkLocationExternalNumber'
  | 'employeeTeleworkLocationInternalNumber'
  | 'employeeTeleworkLocationSettlement'
  | 'employeeTeleworkLocationCity'
  | 'employeeTeleworkLocationState'
  | 'employeeTeleworkLocationCountry'
  | 'employeeTeleworkLocationZipcode'
>

/** Fila fake del modelo (sin BD), con los nullable en null. */
function fakeLocation(overrides: Partial<TeleworkLocationRow> = {}): TeleworkLocationRow {
  return {
    employeeTeleworkLocationId: 10,
    employeeTeleworkLocationIsFixedAgreed: false,
    employeeTeleworkLocationStreet: 'Av. Juárez',
    employeeTeleworkLocationExternalNumber: '15',
    employeeTeleworkLocationInternalNumber: null,
    employeeTeleworkLocationSettlement: 'Centro',
    employeeTeleworkLocationCity: 'Ciudad de México',
    employeeTeleworkLocationState: 'Ciudad de México',
    employeeTeleworkLocationCountry: 'México',
    employeeTeleworkLocationZipcode: '06600',
    ...overrides,
  }
}

/**
 * La fila fake es estructuralmente el modelo (los campos `employeeTeleworkLocation*`),
 * pero no es una instancia real: el cast es deliberado, sin `any`, para no bootear el modelo.
 */
const asModel = (row: TeleworkLocationRow): EmployeeTeleworkLocation =>
  row as unknown as EmployeeTeleworkLocation

/** Entrada del builder: los 8 campos del domicilio, `null` como "sin dato" (igual que el modelo). */
type TeleworkAddressInput = { [K in keyof TeleworkAddress]: string | null }

/** Dirección base de la matriz (anexo A). */
const BASE_ADDRESS: TeleworkAddressInput = {
  street: 'Av. Juárez',
  externalNumber: '15',
  internalNumber: null,
  settlement: 'Centro',
  city: 'Ciudad de México',
  state: 'Ciudad de México',
  country: 'México',
  zipcode: '06600',
}

/** Snapshot con la dirección base; `null` cae a '' igual que en `toTeleworkLocationSnapshot`. */
function snap(
  id: number,
  fixed: boolean,
  overrides: Partial<TeleworkAddressInput> = {}
): TeleworkLocationSnapshot {
  const address = { ...BASE_ADDRESS, ...overrides }
  return {
    locationId: id,
    isFixedAgreed: fixed,
    address: {
      street: address.street ?? '',
      externalNumber: address.externalNumber ?? '',
      internalNumber: address.internalNumber ?? '',
      settlement: address.settlement ?? '',
      city: address.city ?? '',
      state: address.state ?? '',
      country: address.country ?? '',
      zipcode: address.zipcode ?? '',
    },
  }
}

const linked = (location: TeleworkLocationSnapshot): TeleworkLocationReference => ({
  kind: 'linked',
  location,
})

const fixed = (location: TeleworkLocationSnapshot | null): TeleworkLocationReference => ({
  kind: 'fixed',
  location,
})

const chgCreate = (after: TeleworkLocationSnapshot): TeleworkLocationChange => ({
  operation: 'create',
  after,
})

const chgUpdate = (
  before: TeleworkLocationSnapshot,
  after: TeleworkLocationSnapshot
): TeleworkLocationChange => ({ operation: 'update', before, after })

const chgDelete = (before: TeleworkLocationSnapshot): TeleworkLocationChange => ({
  operation: 'softDelete',
  before,
})

// Lugares base de la matriz.
const L = snap(10, false) // lugar verificado (lista ligada)
const OTRO = snap(20, false) // lugar no fijo distinto de L
const F = snap(30, true) // fijo pactado (referencia cuando la lista no trae lugar)
const NUEVO_FIJO = snap(50, true) // lugar que se marca como fijo

test.group('Cambio de domicilio — normalización y comparación (VLRH-H1791306078668)', () => {
  test('normaliza espacios, tabuladores, mayúsculas y acentos', ({ assert }) => {
    assert.equal(normalizeTeleworkAddressField('  Av.   Juárez\t15 '), 'av. juarez 15')
  })

  test('trata el espacio duro NBSP como espacio', ({ assert }) => {
    assert.equal(normalizeTeleworkAddressField('Av.\u00A0Juárez'), 'av. juarez')
  })

  test('trata la ñ igual que la n', ({ assert }) => {
    assert.equal(normalizeTeleworkAddressField('Peña'), normalizeTeleworkAddressField('Pena'))
    assert.equal(normalizeTeleworkAddressField('Peña'), 'pena')
  })

  test('vacío es igual a sin dato: null, undefined y cadena vacía dan ""', ({ assert }) => {
    assert.equal(normalizeTeleworkAddressField(null), '')
    assert.equal(normalizeTeleworkAddressField(undefined), '')
    assert.equal(normalizeTeleworkAddressField(''), '')
    assert.equal(normalizeTeleworkAddressField(null), normalizeTeleworkAddressField(''))
  })

  test('es el mismo domicilio con diferencias cosméticas', ({ assert }) => {
    assert.isTrue(
      isSameTeleworkAddress(
        snap(10, false, { street: 'Av. Juárez  15' }).address,
        snap(10, false, { street: 'av. juarez 15' }).address
      )
    )
  })

  test('es el mismo domicilio cuando un campo viene null y el otro vacío', ({ assert }) => {
    const desdeModelo = toTeleworkLocationSnapshot(asModel(fakeLocation())).address
    assert.equal(desdeModelo.internalNumber, '')
    assert.isTrue(isSameTeleworkAddress(desdeModelo, snap(20, false, { internalNumber: '' }).address))
  })

  test('es distinto cuando difiere la calle', ({ assert }) => {
    assert.isFalse(
      isSameTeleworkAddress(L.address, snap(10, false, { street: 'Calle Reforma' }).address)
    )
  })

  test('es distinto cuando difiere el número exterior', ({ assert }) => {
    assert.isFalse(
      isSameTeleworkAddress(L.address, snap(10, false, { externalNumber: '17' }).address)
    )
  })

  test('es distinto cuando difiere el número interior', ({ assert }) => {
    assert.isFalse(
      isSameTeleworkAddress(L.address, snap(10, false, { internalNumber: '3' }).address)
    )
  })

  test('es distinto cuando difiere la colonia', ({ assert }) => {
    assert.isFalse(isSameTeleworkAddress(L.address, snap(10, false, { settlement: 'Roma' }).address))
  })

  test('es distinto cuando difiere la ciudad', ({ assert }) => {
    assert.isFalse(
      isSameTeleworkAddress(L.address, snap(10, false, { city: 'Guadalajara' }).address)
    )
  })

  test('es distinto cuando difiere el estado', ({ assert }) => {
    assert.isFalse(
      isSameTeleworkAddress(L.address, snap(10, false, { state: 'Jalisco' }).address)
    )
  })

  test('es distinto cuando difiere el país', ({ assert }) => {
    assert.isFalse(isSameTeleworkAddress(L.address, snap(10, false, { country: 'España' }).address))
  })

  test('es distinto cuando difiere el código postal', ({ assert }) => {
    assert.isFalse(isSameTeleworkAddress(L.address, snap(10, false, { zipcode: '44100' }).address))
  })

  test('el snapshot mapea los 8 campos, el id y la fijeza desde el modelo', ({ assert }) => {
    const location = asModel(
      fakeLocation({
        employeeTeleworkLocationId: 42,
        employeeTeleworkLocationIsFixedAgreed: true,
        employeeTeleworkLocationExternalNumber: null,
        employeeTeleworkLocationInternalNumber: null,
        employeeTeleworkLocationSettlement: null,
        employeeTeleworkLocationZipcode: null,
      })
    )

    const snapshot = toTeleworkLocationSnapshot(location)

    assert.equal(snapshot.locationId, 42)
    assert.isTrue(snapshot.isFixedAgreed)
    assert.deepEqual(snapshot.address, {
      street: 'Av. Juárez',
      externalNumber: '',
      internalNumber: '',
      settlement: '',
      city: 'Ciudad de México',
      state: 'Ciudad de México',
      country: 'México',
      zipcode: '',
    })
  })
})

test.group('Cambio de domicilio — matriz de decisión, casos 1 a 20 (anexo A)', () => {
  test('caso 1 — PUT a L cambiando cualquiera de los 8 campos → si', ({ assert }) => {
    assert.isTrue(
      shouldInvalidateTeleworkChecklist(
        linked(L),
        chgUpdate(L, snap(10, false, { street: 'Calle Reforma' }))
      )
    )
  })

  test('caso 2 — PUT a L cambiando solo mayúsculas, espacios o acentos → no', ({ assert }) => {
    assert.isFalse(
      shouldInvalidateTeleworkChecklist(
        linked(L),
        chgUpdate(L, snap(10, false, { street: '  av.   juarez ' }))
      )
    )
  })

  test('caso 3 — PUT a L cambiando solo tipo, notas, internet, equipo o fijeza → no', ({ assert }) => {
    // Tipo, notas, internet y equipo no viven en el snapshot; la fijeza no cambia aquí.
    assert.isFalse(shouldInvalidateTeleworkChecklist(linked(L), chgUpdate(L, snap(10, false))))
  })

  test('caso 4 — DELETE de L → si', ({ assert }) => {
    assert.isTrue(shouldInvalidateTeleworkChecklist(linked(L), chgDelete(L)))
  })

  test('caso 5 — DELETE de otro lugar → no', ({ assert }) => {
    assert.isFalse(shouldInvalidateTeleworkChecklist(linked(L), chgDelete(OTRO)))
  })

  test('caso 6 — PUT a otro lugar no fijo cambiando domicilio → no', ({ assert }) => {
    assert.isFalse(
      shouldInvalidateTeleworkChecklist(
        linked(L),
        chgUpdate(OTRO, snap(20, false, { street: 'Calle 5 de Mayo' }))
      )
    )
  })

  test('caso 7 — POST de lugar no fijo (coworking secundario) → no', ({ assert }) => {
    assert.isFalse(
      shouldInvalidateTeleworkChecklist(linked(L), chgCreate(snap(60, false, { street: 'Calle 5 de Mayo' })))
    )
  })

  test('caso 8 — POST de lugar fijo con domicilio distinto al de L → si', ({ assert }) => {
    assert.isTrue(
      shouldInvalidateTeleworkChecklist(
        linked(L),
        chgCreate(snap(60, true, { street: 'Calle Reforma' }))
      )
    )
  })

  test('caso 9 — POST de lugar fijo con el mismo domicilio normalizado que L → no', ({ assert }) => {
    // Domicilio normalizado igual al de L: 'av. juarez' + '15'.
    assert.isFalse(
      shouldInvalidateTeleworkChecklist(
        linked(L),
        chgCreate(snap(60, true, { street: '  AV.   JÚAREZ  ' }))
      )
    )
  })

  test('caso 10 — PUT que marca como fijo a otro lugar con domicilio distinto → si', ({ assert }) => {
    assert.isTrue(
      shouldInvalidateTeleworkChecklist(
        linked(L),
        chgUpdate(OTRO, snap(20, true, { street: 'Calle Reforma' }))
      )
    )
  })

  test('caso 11 — sin lugar, fijo F: PUT a F cambiando domicilio → si', ({ assert }) => {
    assert.isTrue(
      shouldInvalidateTeleworkChecklist(
        fixed(F),
        chgUpdate(F, snap(30, true, { street: 'Calle Reforma' }))
      )
    )
  })

  test('caso 12 — sin lugar, fijo F: PUT a F que lo desmarca como fijo → si', ({ assert }) => {
    assert.isTrue(shouldInvalidateTeleworkChecklist(fixed(F), chgUpdate(F, snap(30, false))))
  })

  test('caso 13 — sin lugar, fijo F: DELETE de F → si', ({ assert }) => {
    assert.isTrue(shouldInvalidateTeleworkChecklist(fixed(F), chgDelete(F)))
  })

  test('caso 14 — sin lugar, fijo F: POST de otro fijo con domicilio distinto → si', ({ assert }) => {
    assert.isTrue(
      shouldInvalidateTeleworkChecklist(
        fixed(F),
        chgCreate(snap(60, true, { street: 'Calle Reforma' }))
      )
    )
  })

  test('caso 15 — sin lugar, fijo F: PUT que marca como fijo a otro con domicilio distinto → si', ({ assert }) => {
    assert.isTrue(
      shouldInvalidateTeleworkChecklist(
        fixed(F),
        chgUpdate(OTRO, snap(20, true, { street: 'Calle Reforma' }))
      )
    )
  })

  test('caso 16 — sin lugar, fijo F: POST o PUT de fijo con el mismo domicilio que F → no', ({ assert }) => {
    const mismoDomicilioQueF: Partial<TeleworkAddressInput> = { street: '  av.  juarez ' }

    assert.isFalse(
      shouldInvalidateTeleworkChecklist(fixed(F), chgCreate(snap(60, true, mismoDomicilioQueF)))
    )
    assert.isFalse(
      shouldInvalidateTeleworkChecklist(fixed(F), chgUpdate(OTRO, snap(20, true, mismoDomicilioQueF)))
    )
  })

  test('caso 17 — sin lugar, fijo F: cualquier operación sobre lugares no fijos → no', ({ assert }) => {
    assert.isFalse(shouldInvalidateTeleworkChecklist(fixed(F), chgCreate(snap(60, false))))
    assert.isFalse(
      shouldInvalidateTeleworkChecklist(
        fixed(F),
        chgUpdate(OTRO, snap(20, false, { street: 'Calle 5 de Mayo' }))
      )
    )
    assert.isFalse(shouldInvalidateTeleworkChecklist(fixed(F), chgDelete(OTRO)))
  })

  test('caso 18 — sin lugar, sin fijo: POST de un fijo (primer fijo) → no', ({ assert }) => {
    assert.isFalse(shouldInvalidateTeleworkChecklist(fixed(null), chgCreate(snap(11, true))))
  })

  test('caso 19 — sin lugar, sin fijo: PUT que marca como fijo un lugar existente → no', ({ assert }) => {
    assert.isFalse(shouldInvalidateTeleworkChecklist(fixed(null), chgUpdate(OTRO, NUEVO_FIJO)))
  })

  test('caso 20 — sin lugar, sin fijo: cualquier operación sobre lugares no fijos → no', ({ assert }) => {
    assert.isFalse(shouldInvalidateTeleworkChecklist(fixed(null), chgCreate(snap(60, false))))
    assert.isFalse(
      shouldInvalidateTeleworkChecklist(
        fixed(null),
        chgUpdate(OTRO, snap(20, false, { street: 'Calle 5 de Mayo' }))
      )
    )
    assert.isFalse(shouldInvalidateTeleworkChecklist(fixed(null), chgDelete(OTRO)))
  })
})
