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

// @ts-expect-error — slug inventado: no existe en el catálogo, debe fallar.
const madeUpSlug: EmployeeActionSlug = 'totally-made-up-slug-xyz'
void madeUpSlug
