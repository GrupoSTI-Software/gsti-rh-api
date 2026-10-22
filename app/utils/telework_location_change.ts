import type EmployeeTeleworkLocation from '#models/employee_telework_location'
import { normalizeForSearch } from '#utils/org_alias_normalize'

/**
 * VLRH-H1791306078668 — regla pura "¿este cambio de lugar invalida la lista de verificación?".
 *
 * Decisión de Wilvardo (2026-10-22): el domicilio normalizado igual no invalida, y con lista
 * ligada marcar otro lugar como fijo invalida solo si su domicilio difiere del verificado.
 *
 * Reglas de negocio de la HU que esta regla implementa:
 * - R1 `Qué lugar se vigila`: la lista vigente se vigila sobre el lugar sobre el que se levantó.
 * - R2 `Lista sin lugar ligado`: la referencia es el fijo pactado activo (puede no existir);
 *   invalida si cambia su domicilio, si el fijo pasa a un lugar con domicilio distinto, si se le
 *   quita la marca de fijo o si se da de baja. El primer fijo y el fijo nuevo con el mismo
 *   domicilio no invalidan.
 * - R3 `Lista ligada y se marca otro lugar como fijo`: invalida solo si el domicilio de ese otro
 *   lugar es distinto al del lugar verificado.
 * - R4 `Lugares que no son la referencia`: agregar o modificar un lugar que no es el verificado ni
 *   queda como fijo no invalida.
 * - R5 `La baja del lugar vigilado invalida` con el mismo motivo (`cambio_de_domicilio`).
 * - R6 `Qué es cambio de domicilio`: cuentan los 8 campos del domicilio; no cuentan tipo de lugar,
 *   notas de conectividad, internet, equipo ni la marca de fijo (que solo pesa en R2 y R3).
 * - R7 `Comparación`: se ignoran espacios al inicio/fin y repetidos, mayúsculas y acentos; vacío
 *   es igual a sin dato; `ñ` se trata igual que `n`.
 *
 * El módulo es puro: no toca BD, HTTP ni el modelo (que solo entra como tipo).
 */

/** Los 8 campos que cuentan como "domicilio" (R6), ya mapeados a `string` (sin dato = ''). */
export interface TeleworkAddress {
  street: string
  externalNumber: string
  internalNumber: string
  settlement: string
  city: string
  state: string
  country: string
  zipcode: string
}

/** Foto inmutable de un lugar de teletrabajo en un momento del cambio. */
export interface TeleworkLocationSnapshot {
  locationId: number
  isFixedAgreed: boolean
  address: TeleworkAddress
}

/**
 * Contra qué se compara el cambio: el lugar verificado (`linked`) o el fijo pactado activo
 * (`fixed`, que puede no existir → `location` null).
 */
export interface TeleworkLocationReference {
  kind: 'linked' | 'fixed'
  location: TeleworkLocationSnapshot | null // en 'fixed' puede ser null (sin fijo)
}

/** El cambio ya persistido o por persistir: alta, edición o baja lógica del lugar. */
export type TeleworkLocationChange =
  | { operation: 'create'; after: TeleworkLocationSnapshot }
  | { operation: 'update'; before: TeleworkLocationSnapshot; after: TeleworkLocationSnapshot }
  | { operation: 'softDelete'; before: TeleworkLocationSnapshot }

/** Los 8 campos del domicilio, en el orden de la tabla del anexo A. */
const ADDRESS_FIELDS: readonly (keyof TeleworkAddress)[] = [
  'street',
  'externalNumber',
  'internalNumber',
  'settlement',
  'city',
  'state',
  'country',
  'zipcode',
]

/**
 * Normaliza un campo del domicilio para comparar (R7): reutiliza `normalizeForSearch`
 * (trim + NFD sin marcas + minúsculas, así `ñ` cae a `n`) y colapsa los espacios repetidos.
 * `null` y `undefined` son "sin dato" → ''.
 */
export function normalizeTeleworkAddressField(value: string | null | undefined): string {
  return normalizeForSearch(value ?? '').replace(/\s+/g, ' ')
}

/** ¿Es el mismo domicilio? Compara los 8 campos normalizados (R6, R7). */
export function isSameTeleworkAddress(a: TeleworkAddress, b: TeleworkAddress): boolean {
  return ADDRESS_FIELDS.every(
    (field) => normalizeTeleworkAddressField(a[field]) === normalizeTeleworkAddressField(b[field])
  )
}

/**
 * Mapea la fila del modelo a la foto que usa la regla: los campos nullable caen a ''
 * (sin dato) y la fijeza viaja como booleano.
 */
export function toTeleworkLocationSnapshot(
  location: EmployeeTeleworkLocation
): TeleworkLocationSnapshot {
  return {
    locationId: location.employeeTeleworkLocationId,
    isFixedAgreed: location.employeeTeleworkLocationIsFixedAgreed,
    address: {
      street: location.employeeTeleworkLocationStreet ?? '',
      externalNumber: location.employeeTeleworkLocationExternalNumber ?? '',
      internalNumber: location.employeeTeleworkLocationInternalNumber ?? '',
      settlement: location.employeeTeleworkLocationSettlement ?? '',
      city: location.employeeTeleworkLocationCity ?? '',
      state: location.employeeTeleworkLocationState ?? '',
      country: location.employeeTeleworkLocationCountry ?? '',
      zipcode: location.employeeTeleworkLocationZipcode ?? '',
    },
  }
}

/**
 * Decide si el cambio invalida la lista vigente. `referenced` es la referencia (`R`) ya
 * resuelta por quien llama: en `linked` siempre trae snapshot, porque esa capa ya filtró el
 * lugar vivo del colaborador; en `fixed` puede ser null.
 *
 * Fórmula (regla pura del §7 del spec):
 * ```
 * linked:  create     -> after.isFixedAgreed && !same(after.address, R.address)
 *          update     -> before.locationId === R.locationId
 *                          ? !same(before.address, after.address)
 *                          : !before.isFixedAgreed && after.isFixedAgreed && !same(after.address, R.address)
 *          softDelete -> before.locationId === R.locationId
 * fixed:   create     -> after.isFixedAgreed && R !== null && !same(after.address, R.address)
 *          update     -> (R !== null && before.locationId === R.locationId)
 *                          ? (!after.isFixedAgreed || !same(before.address, after.address))
 *                          : (after.isFixedAgreed && R !== null && !same(after.address, R.address))
 *          softDelete -> R !== null && before.locationId === R.locationId
 * ```
 */
export function shouldInvalidateTeleworkChecklist(
  reference: TeleworkLocationReference,
  change: TeleworkLocationChange
): boolean {
  const referenced = reference.location

  if (reference.kind === 'linked') {
    // Contrato de `linked`: quien arma la referencia ya filtró el lugar vivo; sin foto no hay
    // nada que vigilar y el cambio no invalida.
    if (referenced === null) return false

    if (change.operation === 'create') {
      return (
        change.after.isFixedAgreed &&
        !isSameTeleworkAddress(change.after.address, referenced.address)
      )
    }

    if (change.operation === 'update') {
      if (change.before.locationId === referenced.locationId) {
        return !isSameTeleworkAddress(change.before.address, change.after.address)
      }
      return (
        !change.before.isFixedAgreed &&
        change.after.isFixedAgreed &&
        !isSameTeleworkAddress(change.after.address, referenced.address)
      )
    }

    return change.before.locationId === referenced.locationId
  }

  if (change.operation === 'create') {
    return (
      change.after.isFixedAgreed &&
      referenced !== null &&
      !isSameTeleworkAddress(change.after.address, referenced.address)
    )
  }

  if (change.operation === 'update') {
    if (referenced !== null && change.before.locationId === referenced.locationId) {
      return (
        !change.after.isFixedAgreed ||
        !isSameTeleworkAddress(change.before.address, change.after.address)
      )
    }
    return (
      change.after.isFixedAgreed &&
      referenced !== null &&
      !isSameTeleworkAddress(change.after.address, referenced.address)
    )
  }

  return referenced !== null && change.before.locationId === referenced.locationId
}
