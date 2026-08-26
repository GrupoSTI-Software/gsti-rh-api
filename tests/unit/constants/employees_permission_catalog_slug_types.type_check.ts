import type { EmployeeActionSlug } from '#constants/employees_permission_catalog'

/**
 * Verificación en tiempo de compilación (no es un test de Japa a propósito:
 * el nombre no matchea `*.spec.ts`, así que `node ace test` no lo recoge).
 * Se valida corriendo `npx tsc --noEmit`, que ya es parte del gate de este
 * proyecto.
 *
 * `EmployeeActionSlug` debe seguir siendo una unión de literales concretos
 * (no `string`): si algún día `tabActions`/`tabReadWrite` vuelve a anotar su
 * retorno como `ActionCatalogEntry<EmployeesSection>[]` (ensanchando el
 * slug), esta unión colapsaría a `string` y las dos líneas de abajo
 * dejarían de comportarse como se espera:
 *   - la asignación válida seguiría compilando (`string` acepta cualquier
 *     literal), sin señal de alarma.
 *   - la asignación inválida (`@ts-expect-error`) DEJARÍA de fallar, y
 *     `@ts-expect-error` reportaría "Unused '@ts-expect-error' directive"
 *     — ese es justo el error que hace fallar `tsc --noEmit` si la
 *     regresión vuelve a pasar.
 */
const validSlug: EmployeeActionSlug = 'tab-expediente-write'
void validSlug

const suppliesSlug: EmployeeActionSlug = 'manage-employee-supplies'
void suppliesSlug

const downloadSlug: EmployeeActionSlug = 'download-employee-contract'
void downloadSlug

const importVacationsSlug: EmployeeActionSlug = 'import-vacations'
void importVacationsSlug

const sensitiveIdentificacionRead: EmployeeActionSlug = 'sensitive-identificacion-read'
void sensitiveIdentificacionRead
const sensitiveContactoRead: EmployeeActionSlug = 'sensitive-contacto-read'
void sensitiveContactoRead
const sensitiveFinancieroRead: EmployeeActionSlug = 'sensitive-financiero-read'
void sensitiveFinancieroRead
const sensitiveSaludRead: EmployeeActionSlug = 'sensitive-salud-read'
void sensitiveSaludRead
const sensitiveBiometricoRead: EmployeeActionSlug = 'sensitive-biometrico-read'
void sensitiveBiometricoRead
const sensitiveIdentificacionWrite: EmployeeActionSlug = 'sensitive-identificacion-write'
void sensitiveIdentificacionWrite
const sensitiveContactoWrite: EmployeeActionSlug = 'sensitive-contacto-write'
void sensitiveContactoWrite
const sensitiveFinancieroWrite: EmployeeActionSlug = 'sensitive-financiero-write'
void sensitiveFinancieroWrite
const sensitiveSaludWrite: EmployeeActionSlug = 'sensitive-salud-write'
void sensitiveSaludWrite
const sensitiveBiometricoWrite: EmployeeActionSlug = 'sensitive-biometrico-write'
void sensitiveBiometricoWrite

// @ts-expect-error — slug inventado: no existe en el catálogo, debe fallar.
const madeUpSlug: EmployeeActionSlug = 'totally-made-up-slug-xyz'
void madeUpSlug
