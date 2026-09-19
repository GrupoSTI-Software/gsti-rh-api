# Reporte de asistencia sin departamento ni puesto — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el reporte de asistencia se genere siempre —tenga o no departamento y puesto el empleado— y que sus columnas de estructura muestren el alias cuando existe, el nombre cuando no hay alias, y nada cuando no hay dato.

**Architecture:** La regla "alias, si no nombre, si no vacío" está hoy escrita cuatro veces en `assist_service.ts` con tres comportamientos distintos: dos sitios correctos y dos rotos. Se extrae una única función pura a `app/utils/org_alias_display.ts` —la carpeta donde ya viven `org_alias_normalize.ts` y `org_alias_search_sql.ts`— se cubre con tests unitarios exhaustivos, y los dos sitios rotos pasan a consumirla. Toda la lógica queda en una pieza sin dependencias, testeable sin base de datos; los puntos de uso quedan en una línea que no se puede equivocar.

**Tech Stack:** AdonisJS 6 · Lucid · TypeScript estricto · Japa (`node ace test`) · ExcelJS

**Repo:** `gsti-rh-api` · **Rama:** `feature/USRH1788466831291-excel-asistencia-tolera-sin-departamento` · **Target:** `multitenant`

**HU:** USRH1788466831291 — *Evitar que el reporte de asistencia falle por un empleado sin departamento*

---

## Global Constraints

- **Cero texto de relleno.** Si no hay departamento o puesto, la celda queda vacía. Nunca `"Sin departamento"`, `"Sin posición"`, `"N/A"` ni ningún valor que simule un dato (regla de negocio 2).
- **Si hay dato, la celda nunca queda en blanco.** Alias cuando existe; nombre cuando no hay alias (regla de negocio 3).
- **No cambia nada más del archivo.** Ni columnas, ni encabezados, ni totales, ni orden, ni qué empleados entran a los reportes de empresa (regla de negocio 5).
- **No cambia la separación entre empresas ni los permisos.** Esta historia no toca quién puede pedir un reporte ni de quién.
- **Los registros de error no guardan nombres ni datos de la persona.**
- **TypeScript estricto, cero `any`.** `npm run typecheck` y `npm run lint` limpios antes de cada commit.
- **Nada se borra.** Si algún archivo se retirara, va a `__TO_DELETE__/` conservando su ruta (regla del `CLAUDE.md`). Este plan no retira archivos.
- **Ubicar por nombre de función, no por número de línea.** La Task 2 cambia el largo del archivo y recorre las líneas de la Task 3. Los números de este plan son del estado actual (`assist_service.ts` sin tocar).

---

## Alcance: la HU tenía razón sobre el Resumen de incidencias

Durante el análisis se reportó un supuesto hallazgo —que el Resumen de incidencias arrastraba el mismo defecto y que la HU se equivocaba al darlo por correcto—. **Ese hallazgo era falso** y se retira.

El Resumen de incidencias que el supervisor descarga se arma con `buildIncidentSummaryRow`, que resuelve el alias correctamente. La función defectuosa, `addRowIncidentCalendar`, **no la alcanza ninguna pantalla**: solo cuelga de las rutas síncronas viejas (`/get-excel-by-employee`, `/get-excel-by-position`, `/get-excel-by-department`, `/get-excel-all`), que la propia HU declara fuera de alcance: *"las rutas antiguas de descarga de Excel que ya no usa ninguna pantalla quedan fuera y se anotan como deuda"*.

Conclusión: **la tarjeta no necesita ninguna corrección de texto**, y la afirmación de la HU *"El Reporte de resumen de incidencias... se sigue generando igual que hoy"* se cumple sin hacer nada.

**Qué produjo el error.** La atribución de cada línea a su función se hizo con un patrón que no reconocía métodos `private`, así que la línea 1437 se le adjudicó a `generateAssistanceAllBuffer` (la última coincidencia previa, en `:1000`) cuando en realidad pertenece a `buildIncidentSummaryRow` (`:1434`, `private`). De esa atribución equivocada salió la tabla de "cuatro sitios, dos correctos" y con ella el falso hallazgo. La tabla de abajo ya está rehecha con la atribución verificada.

---

## Estado actual verificado

Todo lo de abajo se leyó contra el código el 2026-09-14, no se asume.

| Función | Línea | `?.` | Fallback | Estado | ¿Qué descarga la alcanza? |
|---|---|---|---|---|---|
| `addRowCalendar` | `:2758`, `:2765` | **No** | `: ''` | **Roto** | **Viva.** Reporte de asistencia de un empleado y Exportación detallada |
| `addRowIncidentCalendar` | `:3012` | **No** | `: ''` | Roto | **Ninguna pantalla.** Solo las rutas síncronas viejas |
| `buildIncidentSummaryRow` | `:1437` | Sí | `: department` | Correcto | Viva. Resumen de incidencias |
| `addRowIncidentPayrollCalendar` | `:4129` | Sí | `: department` | Correcto | Viva. Exportación de nóminas |

**Cómo se determinó qué está vivo.** El panel de descargas pide un job y `report_job_service.ts` reparte por tipo de reporte: `assistance_employee` → `generateAssistanceEmployeeBuffer` (`:262`), `assistance_all` → `generateAssistanceAllBuffer` (`:293`), `assistance_incident_summary` → `generateIncidentSummaryBuffer` / `generateIncidentSummaryEmployeeBuffer` (`:278`, `:224`), `assistance_incident_summary_payroll` → los dos de nóminas (`:242`, `:198`).

Los dos primeros desembocan en `addRowCalendar` (`assist_service.ts:182` y `:1092`) — por eso **una sola corrección arregla las dos descargas**, tal como dice la HU. Los de incidencias desembocan en `buildIncidentSummaryRow`, que ya está bien.

**Los dos defectos, en las mismas líneas:**

1. **Truena.** `employee.department.departmentAlias` sin `?.` lanza `TypeError` cuando el empleado no tiene departamento —o cuando su departamento fue eliminado y el preload lo deja en `null`—, se pierde el archivo completo y la descarga falla.
2. **Borra el alias.** El segundo `department = ... : ''` devuelve cadena vacía cuando la condición `department === ''` es falsa, es decir **cuando sí hay alias**. Por eso la columna sale en blanco justo para quien tiene nombre corto capturado, y sale bien para quien no lo tiene.

**Encadenamiento hasta la celda (verificado):** `addRowCalendar:2807-2808` arma `{ department, position }` en la fila, y de ahí `rowData.department` / `rowData.position` van a las celdas.

**`positionAlias` aparece una sola vez en todo el archivo** (`:2765`, dentro de `addRowCalendar`). No existe una implementación correcta de puesto que copiar: la regla se aplica por analogía con la de departamento, que es lo que pide la HU (*"Con el puesto pasa lo mismo"*).

---

## File Structure

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `app/utils/org_alias_display.ts` | Única representación autoritativa de la regla "alias, si no nombre, si no vacío" para las columnas de estructura. Función pura, sin dependencias. | **Crear** |
| `tests/unit/utils/org_alias_display.spec.ts` | Cubre los cinco casos de la regla, incluidos los que hoy fallan. | **Crear** |
| `app/services/assist_service.ts` | Arma las filas de los Excel de asistencia. Solo cambian los dos bloques rotos; el resto del archivo no se toca. | **Modificar** (`addRowCalendar`, `addRowIncidentCalendar`) |
| `docs/superpowers/plans/2026-09-14-reporte-asistencia-sin-departamento-qa-api.md` | Manual de prueba manual de API, hermano de este plan. Lo construye la Task 5 siguiendo `~/.cursor/rules/manual-qa-api.mdc`. | **Crear** |
| `database/seeders/_tmp_do_not_commit_qa_seeder.ts` | Siembra los usuarios y empleados de las variantes de QA. Ya existe y está excluido del versionado en `.git/info/exclude`: se le agregan casos, no se crea otro. | **Modificar** (no se commitea) |

Se extrae a `app/utils/` y no a un método privado del servicio porque la regla la comparten cuatro reportes y `assist_service.ts` ya es un archivo grande: meterla ahí la deja tan difícil de probar como está hoy. La carpeta `app/utils/` ya tiene la familia `org_alias_*` y sus tests viven en `tests/unit/utils/`.

---

## Task 1: Helper único para la etiqueta de estructura

**Files:**
- Create: `app/utils/org_alias_display.ts`
- Test: `tests/unit/utils/org_alias_display.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `resolveOrgAliasDisplay(alias?: string | null, name?: string | null): string` — exportada desde `#utils/org_alias_display`. Devuelve siempre `string`, nunca `null` ni `undefined`. Las Tasks 2 y 3 la consumen con ese nombre exacto.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/unit/utils/org_alias_display.spec.ts`:

```ts
import { test } from '@japa/runner'
import { resolveOrgAliasDisplay } from '#utils/org_alias_display'

/**
 * USRH1788466831291 — la etiqueta de las columnas de estructura.
 * Regla 3: alias cuando existe, nombre cuando no hay alias.
 * Regla 2: sin dato, celda vacía y sin texto de relleno.
 */
test.group('Estructura — etiqueta de departamento y puesto (USRH1788466831291)', () => {
  test('con alias capturado devuelve el alias, no el nombre', ({ assert }) => {
    assert.equal(resolveOrgAliasDisplay('RRHH', 'Recursos Humanos'), 'RRHH')
  })

  test('sin alias devuelve el nombre', ({ assert }) => {
    assert.equal(resolveOrgAliasDisplay('', 'Recursos Humanos'), 'Recursos Humanos')
  })

  test('sin departamento asignado devuelve cadena vacia', ({ assert }) => {
    assert.equal(resolveOrgAliasDisplay(undefined, undefined), '')
  })

  test('con registro eliminado que llega nulo devuelve cadena vacia', ({ assert }) => {
    assert.equal(resolveOrgAliasDisplay(null, null), '')
  })

  test('con alias y nombre vacios devuelve cadena vacia', ({ assert }) => {
    assert.equal(resolveOrgAliasDisplay('', ''), '')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
node ace test unit --files="org_alias_display"
```

Esperado: FALLA. El error es de resolución de módulo (`Cannot find module '#utils/org_alias_display'`), porque el archivo todavía no existe.

- [ ] **Step 3: Escribir la implementación mínima**

Crear `app/utils/org_alias_display.ts`:

```ts
/**
 * Resuelve la etiqueta que se imprime en las columnas de estructura
 * (departamento y puesto) de los reportes de asistencia en Excel.
 *
 * Se muestra el alias cuando la empresa lo capturó y el nombre cuando no hay
 * alias (USRH1788466831291, regla 3). Cuando no hay ninguno de los dos —el
 * empleado no tiene departamento o puesto asignado, o su registro fue
 * eliminado del organigrama y ya no se carga— la celda queda vacía, sin
 * texto de relleno (regla 2).
 *
 * Los parámetros aceptan `null` y `undefined` a propósito: el departamento y
 * el puesto del empleado son opcionales, y el preload los deja sin valor
 * cuando el registro ya no existe. Quien llama pasa el acceso con `?.` y esta
 * funcion se encarga del resto.
 *
 * @param alias Alias capturado por la empresa para el registro.
 * @param name Nombre del registro.
 * @returns El alias, el nombre, o cadena vacía. Nunca `null` ni `undefined`.
 */
export function resolveOrgAliasDisplay(
  alias?: string | null,
  name?: string | null
): string {
  if (alias) {
    return alias
  }
  if (name) {
    return name
  }
  return ''
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

```bash
node ace test unit --files="org_alias_display"
```

Esperado: PASA, 5 de 5.

- [ ] **Step 5: Verificar tipos y estilo**

```bash
npm run typecheck && npm run lint
```

Esperado: ambos sin errores.

- [ ] **Step 6: Commit**

```bash
git add app/utils/org_alias_display.ts tests/unit/utils/org_alias_display.spec.ts
git commit -m "feat(USRH1788466831291): helper unico para la etiqueta de estructura

La regla alias-si-no-nombre estaba escrita cuatro veces en assist_service
con tres comportamientos distintos. Se extrae a una funcion pura con sus
tests; los puntos de uso la consumen en las tareas siguientes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Reporte de asistencia — deja de fallar y deja de borrar el alias

Es el corazón de la HU. `addRowCalendar` es la pieza que arma la fila **tanto del reporte de un empleado como de la Exportación detallada de toda la empresa**, así que esta única corrección arregla las dos descargas.

**Files:**
- Modify: `app/services/assist_service.ts:2758-2767` (dentro de `addRowCalendar`, que inicia en `:2726`)

**Interfaces:**
- Consumes: `resolveOrgAliasDisplay(alias?: string | null, name?: string | null): string` de `#utils/org_alias_display` (Task 1).
- Produces: nada nuevo. Las variables locales `department` y `position` conservan su nombre y su tipo `string`, y se siguen asignando a la fila en `:2807-2808` sin cambios.

- [ ] **Step 1: Agregar el import**

En el bloque de imports de `app/services/assist_service.ts`, junto a los demás `#utils`:

```ts
import { resolveOrgAliasDisplay } from '#utils/org_alias_display'
```

- [ ] **Step 2: Reemplazar el bloque roto**

Localizar la función `addRowCalendar` y **borrar estas diez líneas** (`:2758-2767`):

```ts
      let department = employee.department.departmentAlias
        ? employee.department.departmentAlias
        : ''
      department =
        department === '' && employee.department?.departmentName
          ? employee.department.departmentName
          : ''
      let position = employee.position.positionAlias ? employee.position.positionAlias : ''
      position =
        position === '' && employee.position?.positionName ? employee.position.positionName : ''
```

**Dejar en su lugar exactamente esto:**

```ts
      const department = resolveOrgAliasDisplay(
        employee.department?.departmentAlias,
        employee.department?.departmentName
      )
      const position = resolveOrgAliasDisplay(
        employee.position?.positionAlias,
        employee.position?.positionName
      )
```

Dos cambios y nada más: el `?.` evita el `TypeError` cuando el empleado no tiene el registro, y el helper conserva el alias en vez de borrarlo. `let` pasa a `const` porque ninguna de las dos variables se reasigna después.

- [ ] **Step 3: Verificar tipos**

```bash
npm run typecheck
```

Esperado: sin errores.

Si aparece un error tipo `Cannot assign to 'department' because it is a constant`, significa que la variable **sí** se reasigna más abajo en la función. En ese caso: devolver ese `const` a `let` (solo el que marque el error) y dejar el resto del cambio igual.

- [ ] **Step 4: Correr la suite unitaria completa**

```bash
node ace test unit
```

Esperado: PASA. No debe haber regresiones.

- [ ] **Step 5: Verificar estilo**

```bash
npm run lint
```

Esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
git add app/services/assist_service.ts
git commit -m "fix(USRH1788466831291): el reporte de asistencia ya no falla sin estructura

addRowCalendar accedia a department y position sin proteccion, lo que
tumbaba la generacion completa del archivo cuando el empleado no tenia
departamento o puesto. El segundo fallback devolvia cadena vacia cuando si
habia alias, dejando la columna en blanco justo para quien tenia nombre
corto capturado. Es la pieza que comparten el reporte por empleado y la
Exportacion detallada, asi que corrige las dos descargas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3 (severable): la ruta vieja del resumen de incidencias

**Esta tarea es opcional.** Corrige `addRowIncidentCalendar`, que tiene el mismo defecto que `addRowCalendar` pero **no la alcanza ninguna pantalla**: solo cuelga de las rutas síncronas viejas que la HU declara fuera de alcance y deja anotadas como deuda.

**A favor:** son seis líneas y el helper ya existe; dejarla rota mientras se arregla su gemela es raro, y si mañana alguien revive esa ruta hereda el bug.

**En contra:** es trabajo fuera de la HU. Tocar código que ninguna pantalla ejecuta no se puede verificar desde el producto, así que entra sin respaldo de QA.

**Recomendación:** hacerla, porque el costo es mínimo y el helper ya está. Si el equipo prefiere no tocar nada fuera de alcance, saltarla y dejar el `TODO` de la Task 4 también sobre este bloque.

**Files:**
- Modify: `app/services/assist_service.ts:3012-3016` (dentro de `addRowIncidentCalendar`, que inicia en `:3008`)

**Interfaces:**
- Consumes: `resolveOrgAliasDisplay` de `#utils/org_alias_display` (Task 1). El import ya quedó puesto en la Task 2; no se agrega otra vez.
- Produces: nada nuevo. La variable local `department` conserva nombre y tipo `string`.

> **Ojo con las líneas.** La Task 2 acortó el archivo, así que estas líneas ya no están en `:3012`. **Localizar por el nombre de la función `addRowIncidentCalendar`**, no por el número.

- [ ] **Step 1: Reemplazar el bloque roto**

Dentro de `addRowIncidentCalendar`, **borrar estas cinco líneas**:

```ts
    let department = filters.employee.department.departmentAlias ? filters.employee.department.departmentAlias : ''
    department =
      department === '' && filters.employee.department?.departmentName
        ? filters.employee.department.departmentName
        : ''
```

**Dejar en su lugar exactamente esto:**

```ts
    const department = resolveOrgAliasDisplay(
      filters.employee.department?.departmentAlias,
      filters.employee.department?.departmentName
    )
```

Esta función no resuelve puesto: el Resumen de incidencias no tiene columna de puesto. Solo va departamento.

- [ ] **Step 2: Verificar tipos**

```bash
npm run typecheck
```

Esperado: sin errores. Si aparece `Cannot assign to 'department' because it is a constant`, la variable se reasigna más abajo: devolver ese `const` a `let` y dejar el resto del cambio igual.

- [ ] **Step 3: Confirmar que ya no queda ningún acceso capaz de tumbar un reporte**

```bash
grep -nE "= (filters\.)?employee\.(department|position)\.(department|position)Alias" app/services/assist_service.ts
```

Esperado: **cero resultados**. Antes de empezar este plan da exactamente 3 (`:2758`, `:2765`, `:3012`): son los accesos que lanzan el `TypeError`.

El patrón busca el **primer** acceso de la expresión, que es el que no está protegido. Un `grep` más suelto por `employee.department.departmentAlias` también engancha las ramas internas de los dos sitios correctos (`:1438` y `:4129`), y esas sí son seguras: su ternario ya evaluó `department?.departmentAlias` antes de entrar. No confundirlas con un hallazgo.

- [ ] **Step 4: Confirmar que ya no queda ningún fallback que borre el alias**

```bash
grep -n "department === ''" app/services/assist_service.ts
```

Esperado: **exactamente 2 resultados**, uno en `buildIncidentSummaryRow` (`:1437`, método `private`) y otro en `addRowIncidentPayrollCalendar` (`:4129`). Abrir los dos y confirmar que terminan en `: department` y no en `: ''` — son los sitios correctos que alimentan el Resumen de incidencias y la Exportación de nóminas, y que este plan no toca salvo que se haga la Task 4.

- [ ] **Step 5: Correr la suite unitaria y el lint**

```bash
node ace test unit && npm run lint
```

Esperado: ambos limpios.

- [ ] **Step 6: Commit**

```bash
git add app/services/assist_service.ts
git commit -m "fix(USRH1788466831291): mismo arreglo en la ruta vieja de incidencias

addRowIncidentCalendar tiene el mismo defecto que addRowCalendar, pero
solo cuelga de las rutas sincronas viejas que ninguna pantalla usa: el
resumen de incidencias que si se descarga se arma con
buildIncidentSummaryRow, que ya resuelve bien el alias. Se corrige por
higiene, no porque cambie lo que ve el usuario.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4 (severable): converger los dos sitios que ya eran correctos

> **DECIDIDO (2026-09-14): esta tarea NO entra.** El dueño de la historia optó por no tocar reportes que hoy funcionan y que la HU declara sin cambios. **Lo único que se ejecuta de esta tarea es el bloque "Si se salta"**: dejar el comentario de deuda sobre los dos sitios. Los Steps 1-5 de abajo quedan como referencia para cuando se retome.

**Esta tarea es opcional y se puede saltar sin afectar el arreglo.** Vale la pena decidirla conscientemente, no por omisión.

**A favor:** después de las Tasks 2 y 3 quedan dos copias más de la misma regla (`buildIncidentSummaryRow` y `addRowIncidentPayrollCalendar`). Están bien escritas hoy, pero son exactamente las copias que dejaron divergir a las otras dos hasta romperse. Convergerlas cierra la puerta.

**En contra:** alimentan el Resumen de incidencias y la Exportación de nóminas, dos reportes que la HU declara explícitamente que *"se siguen generando igual que hoy"*. El cambio es de comportamiento idéntico, pero obliga a re-probar esas descargas y a tocar código que la historia dejó fuera.

**Si se salta:** dejar anotada la deuda con un comentario sobre cada uno de los dos bloques, para que el siguiente que los toque sepa que hay una pieza autoritativa:

```ts
    // TODO(USRH1788466831291): misma regla que #utils/org_alias_display.
    // Converger al helper cuando se toque este reporte.
```

**Files:**
- Modify: `app/services/assist_service.ts` — `addRowIncidentPayrollCalendar` y `buildIncidentSummaryRow` (localizar por nombre de función)

**Interfaces:**
- Consumes: `resolveOrgAliasDisplay` de `#utils/org_alias_display` (Task 1).
- Produces: nada nuevo.

- [ ] **Step 1: Convertir `addRowIncidentPayrollCalendar`**

Borrar:

```ts
    let department = filters.employee.department?.departmentAlias ? filters.employee.department.departmentAlias : ''
    department =
      department === '' && filters.employee.department?.departmentName
        ? filters.employee.department.departmentName
        : department
```

Dejar:

```ts
    const department = resolveOrgAliasDisplay(
      filters.employee.department?.departmentAlias,
      filters.employee.department?.departmentName
    )
```

- [ ] **Step 2: Convertir `buildIncidentSummaryRow`** (método `private`, inicia en `:1434`)

Borrar:

```ts
    let department = filters.employee.department?.departmentAlias
      ? filters.employee.department.departmentAlias
      : ''
    department =
      department === '' && filters.employee.department?.departmentName
        ? filters.employee.department.departmentName
        : department
```

Dejar:

```ts
    const department = resolveOrgAliasDisplay(
      filters.employee.department?.departmentAlias,
      filters.employee.department?.departmentName
    )
```

- [ ] **Step 3: Confirmar que la regla quedó en un solo lugar**

```bash
grep -c "departmentAlias" app/services/assist_service.ts
```

Esperado: `0`. Toda referencia al alias pasa ahora por el helper.

- [ ] **Step 4: Verificar tipos, tests y estilo**

```bash
npm run typecheck && node ace test unit && npm run lint
```

Esperado: todo limpio.

- [ ] **Step 5: Commit**

```bash
git add app/services/assist_service.ts
git commit -m "refactor(USRH1788466831291): una sola representacion de la regla de alias

Los dos sitios que ya eran correctos pasan al helper. Comportamiento
identico; cierra la divergencia que rompio a los otros dos.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Manual de prueba manual de API (hermano del plan)

Todo plan de este repo entrega su manual de QA hermano. Esta tarea lo construye.

**Regla que manda:** `~/.cursor/rules/manual-qa-api.mdc` (`alwaysApply`). Leerla antes de escribir; lo de abajo son las constantes ya resueltas, no un reemplazo de la regla.

**Files:**
- Create: `docs/superpowers/plans/2026-09-14-reporte-asistencia-sin-departamento-qa-api.md`
- Modify: `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (no versionado; es el mismo archivo que ya usan los demás manuales — **no crear uno nuevo**)

**Interfaces:**
- Consumes: el comportamiento entregado por las Tasks 2 y 3.
- Produces: nada que consuma otra tarea.

### Constantes del proyecto (tomadas de `2026-09-10-grupos-tenants-api-qa-api.md`)

| Dato | Valor |
|---|---|
| URL base local | `http://127.0.0.1:3333` |
| Seeder QA | `database/seeders/_tmp_do_not_commit_qa_seeder.ts` |
| Comando del seeder | `node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts` |
| Dominio de pruebas | `@gsti-tests.local` |
| Contraseña de prueba | `password` |
| Auth | Se asume resuelta por el cliente (`Authorization: Bearer <token>`); no se documenta el login |

### Endpoints del flujo (verificados en `start/routes/assist_routes.ts`)

El reporte es asíncrono: se pide, se consulta el estado y se descarga.

| Paso | Endpoint |
|---|---|
| Pedir | `POST /api/v1/assists/reports` |
| Consultar estado | `GET /api/v1/assists/reports/:id/status` |
| Descargar | `GET /api/v1/assists/reports/:id/download` |

Tipos de reporte que toca esta historia: `assistance_employee` (reporte de asistencia de un empleado), `assistance_all` (Exportación detallada de toda la empresa) y `assistance_incident_summary` (Resumen de incidencias).

### Lo que siembra el seeder

Dos usuarios, uno por variante:

| | Correo | Contraseña | Variante |
|---|---|---|---|
| **A** | `qa-reporte-estructura-supervisor@gsti-tests.local` | `password` | Supervisor de la empresa de prueba, con permiso de descarga |
| **B** | `qa-reporte-estructura-otra-empresa@gsti-tests.local` | `password` | Usuario de otra empresa: pide el reporte de un empleado ajeno |

Cuatro empleados con checadas en el periodo, uno por caso de la historia:

| Código de nómina | Estructura |
|---|---|
| `QA-EST-01` | Sin departamento y sin puesto |
| `QA-EST-02` | Con departamento y puesto dados de baja en el organigrama |
| `QA-EST-03` | Con departamento y puesto **con alias** capturado |
| `QA-EST-04` | Con departamento y puesto **sin alias** |

Los ids no se hardcodean. El manual los entrega con su consulta:

```sql
SELECT employee_id AS id FROM employees
WHERE employee_payroll_code = 'QA-EST-01' AND employee_deleted_at IS NULL;
```

### Escenarios (uno por variante, solo lo que la HU pide validar)

| # | Variante | Qué verifica |
|---|---|---|
| 1 | `QA-EST-01`, reporte de asistencia | El archivo llega. Departamento y puesto vienen vacíos, sin texto de relleno |
| 2 | `QA-EST-02`, reporte de asistencia | Mismo resultado con la estructura dada de baja |
| 3 | `QA-EST-03`, reporte de asistencia | Las dos columnas traen **el alias** |
| 4 | `QA-EST-04`, reporte de asistencia | Las dos columnas traen **el nombre** |
| 5 | Exportación detallada de la empresa | `QA-EST-03` y `QA-EST-04` salen con su columna correcta en el mismo archivo |
| 6 | Usuario **B** pide `QA-EST-01` | Misma respuesta que si el empleado no existiera; no se genera archivo |

El Resumen de incidencias **no entra**: esta historia no lo cambia. La regla del manual excluye regresiones.

**Corrección (2026-09-14).** El escenario 5 decía originalmente "los cuatro empleados". Es imposible: la Exportación detallada recorre departamento → puesto → empleado, así que un empleado sin departamento —o con el suyo dado de baja— **nunca entra a ese archivo**. Es conducta preexistente que esta historia no toca, y que la propia HU ya describía: *"en los reportes de toda la empresa todavía no ocurre, porque ahí los empleados sin departamento ni siquiera entran al archivo"*. Los sumará la historia USRH1788466831333. Por eso el escenario 5 solo verifica `QA-EST-03` y `QA-EST-04`, y el manual declara en una línea por qué los otros dos no aparecen ahí.

- [ ] **Step 1: Sembrar las variantes**

Agregar al seeder existente los dos usuarios y los cuatro empleados de las tablas de arriba, con checadas en el periodo de prueba. Para `QA-EST-02`, sembrar el departamento y el puesto y darlos de baja después de asignarlos, para que el empleado quede apuntando a registros dados de baja.

- [ ] **Step 2: Correr el seeder y resolver los ids**

```bash
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Esperado: termina sin error. Confirmar que las cuatro consultas de id devuelven una fila cada una.

- [ ] **Step 3: Derivar el response exacto de cada escenario**

**Este manual lo ejecuta y valida un humano**, no esta sesión. Aun así la regla exige responses literales: nada de "debería fallar". Para escribirlos con precisión sin correr el ambiente, leer el contrato real de cada endpoint en el código —status, forma del envelope de éxito y de error, nombre de cada campo— y transcribirlo.

El manual no menciona código en ninguna parte: leerlo es cómo se investiga, no lo que se publica.

Como el reporte se entrega como archivo, el response del paso de descarga se documenta por su status y su tipo de contenido, y lo que se verifica se describe como lo que el humano abre y ve en el archivo (qué columna, con qué valor).

- [ ] **Step 4: Escribir el manual**

Crear `docs/superpowers/plans/2026-09-14-reporte-asistencia-sin-departamento-qa-api.md` con la estructura mínima que fija la regla:

1. **Problema / Solución / Ejemplo** — dos párrafos en lenguaje llano más una línea `Ejemplo:` de 2-4 líneas que lleve el caso a un contexto cotidiano (tienda, escuela, casa) que se entienda sin conocer el producto.
2. **Preparar** — el comando del seeder, la tabla de usuarios y las consultas de id.
3. **Un escenario por variante** — endpoint, body y response exacto; después de cada response, la lista en lenguaje de negocio de qué significa cada dato **que ese escenario estrena**. Un dato se explica una sola vez, en el primer escenario donde aparece; los siguientes remiten con `(Los datos son los ya explicados en el Escenario N.)`.
4. **Checklist** — una casilla por escenario.

Sin sección de limpieza: esta historia no enciende ninguna bandera global.

- [ ] **Step 5: Verificar que el manual no menciona código**

```bash
grep -v "db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts" docs/superpowers/plans/2026-09-14-reporte-asistencia-sin-departamento-qa-api.md | grep -c "app/\|#utils\|#models\|#services\|middleware\|Vine\|Lucid\|\.ts" || echo "0 menciones de codigo: correcto"
```

El patrón excluye primero la única línea que la regla obliga a incluir —el comando del seeder, cuya ruta termina en `.ts`— y solo entonces cuenta el resto del archivo. Sin ese filtro el patrón nunca puede dar cero: se dispara con su propio comando obligatorio.

Esperado: `0` seguido de `0 menciones de codigo: correcto` (grep imprime el conteo y, como es cero, también dispara el `|| echo` de la derecha). Quien prueba no abre el repo: la regla prohíbe rutas de archivos, nombres de clases, servicios o validadores, y cualquier "revisa el código de X".

- [ ] **Step 6: Commit**

El seeder **no se versiona** (su nombre lo dice). Solo entra el manual.

```bash
git add docs/superpowers/plans/2026-09-14-reporte-asistencia-sin-departamento-qa-api.md
git commit -m "docs(USRH1788466831291): manual de prueba manual de API

Seis escenarios: empleado sin estructura, con estructura dada de baja,
con alias y sin alias en el reporte de asistencia; la Exportacion
detallada de la empresa; y el aislamiento entre empresas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verificación del desarrollador (antes de entregar a QA)

Esto **no** es el manual de QA —ese lo construye la Task 5 y sigue su propia regla, que excluye regresiones a propósito—. Esta lista es el humo que corre quien implementa antes de pasar la rama, e incluye a propósito los reportes vecinos que no deben haber cambiado.

**Reporte de asistencia de un empleado** — *Asistencia por empleados → detalle → reporte del periodo*

- [ ] Empleado **sin departamento ni puesto**: el archivo llega al panel de descargas. Las celdas de departamento y puesto están vacías. Nombre, fechas, turno e incidencias, completos.
- [ ] Empleado cuyo **departamento y puesto fueron eliminados** del organigrama: mismo resultado.
- [ ] Empleado cuyo **departamento y puesto tienen alias**: las columnas muestran **el alias**.
- [ ] Empleado cuyo **departamento y puesto no tienen alias**: las columnas muestran **el nombre**.
- [ ] Ninguna celda dice `"Sin departamento"`, `"Sin posición"` ni `"N/A"`.
- [ ] Reporte de un empleado **de otra empresa**: misma respuesta que si el empleado no existiera, y no se genera archivo.

**Exportación detallada de toda la empresa** — *menú de acciones del monitor*

- [ ] Se descarga igual que hoy, con las mismas columnas, encabezados, totales y orden.
- [ ] Las columnas de departamento y puesto muestran el alias donde lo hay.

**Resumen de incidencias — no debe cambiar nada**

Se arma con `buildIncidentSummaryRow`, que ya resuelve bien el alias y que este plan no toca (salvo Task 4, que es un refactor sin cambio de comportamiento).

- [ ] De empresa y por empleado: se descargan y muestran el departamento exactamente como hoy, con alias donde lo hay.

**Exportación de nóminas** (solo si se hizo la Task 4)

- [ ] De empresa y por empleado: se descargan y muestran el departamento exactamente como hoy.

**Exportación de permisos**

- [ ] Conserva su `"N/A"` actual en las columnas de estructura. **No es parte de esta historia** y no debe haber cambiado.

---

## Fuera de alcance (anotado, no se toca)

- **La Exportación de permisos** mantiene su `"N/A"` (`assist_service.ts:4924` y `:4953`). Decisión de la HU.
- **Las rutas antiguas de descarga de Excel** que ya no usa ninguna pantalla quedan como deuda.
- **El acceso limitado** puede pedir el reporte de cualquier empleado de su empresa, no solo de los que tiene a su cargo. Al dejar de fallar, el reporte de los empleados sin estructura también le queda disponible. La HU no amplía ni cierra esa regla; queda anotada para atenderse aparte.
- **Departamento o puesto eliminado:** la celda queda vacía y no muestra el nombre del registro dado de baja. Mostrarlo exigiría cambiar cómo se carga el empleado. Supuesto a confirmar con Wilvardo.

---

## Pendientes con Wilvardo

- [ ] **Retirar el falso hallazgo.** Se le escaló que el Resumen de incidencias estaba roto y que la HU se equivocaba. No era cierto: ese reporte funciona bien y la tarjeta **no necesita ninguna corrección de texto**. Ver *Alcance* arriba.
- [ ] Confirmar que ninguna fórmula, tablero o carga del cliente depende de que la columna de departamento nunca venga vacía, ni de que muestre el nombre cuando hay alias.
- [ ] Confirmar el supuesto de la HU: si el departamento o el puesto fue eliminado, la celda queda vacía y no muestra el nombre del registro dado de baja.
- [ ] Decidir las Tasks 3 y 4, ambas severables y fuera del alcance estricto de la HU.
- [ ] Confirmar qué debe imprimir un departamento con varios alias. El campo de alias guarda una lista separada por comas, así que un departamento con tres alias imprime los tres en la celda. **No es una regresión de esta HU** — los dos reportes que ya eran correctos (`buildIncidentSummaryRow` y `addRowIncidentPayrollCalendar`) imprimen la misma columna cruda hoy —, es una pregunta de producto: ¿la celda debe mostrar la lista completa, o solo el primer alias?
