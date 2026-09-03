# Gobernar los gafetes con su permiso y retirar las casillas muertas — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementar este plan tarea por tarea. Los pasos usan checkbox (`- [ ]`) para seguimiento.

**HU:** `USRH1787433076993` · **Spec:** `spec-USRH1787433076993.md` · **Tipo Asana:** `CHORE` · **Rama actual:** `feature/USRH1787433076993-permiso-gafetes-catalogo`

**Goal:** Que la casilla `generate-badges` gobierne en el servidor las cuatro vías de gafete del backoffice, y que las cinco casillas de escritura/eliminación que ninguna operación del API exige desaparezcan del catálogo sin que ningún rol pierda una sola capacidad.

**Architecture:** Solo API (AdonisJS 6). Tres frentes: (1) el catálogo tipado `employees_permission_catalog.ts` deja de declarar cinco slugs y los presets dejan de repartirlos, con el tipo endurecido para que el fallo vuelva a ser de compilación y no de runtime; (2) las cuatro rutas de `badge.routes.ts` montan `middleware.permissionGate` sobre `generate-badges`, cuyas declaraciones se mudan del archivo de lectura al de escritura; (3) una migración de baja lógica marca `system_permission_deleted_at` en las cinco filas y en sus concesiones, con `down()` acotado por marca de tiempo literal.

**Tech Stack:** AdonisJS 6 · Lucid (migraciones + `adonis-lucid-soft-deletes`) · TypeScript estricto · Japa (`node ace test`) · MySQL.

## Global Constraints

Estas reglas aplican a **todas** las tareas. Ningún paso las repite.

- **Cero archivos del backoffice (`valanserh-bo` / `gsti-rh-bo`) en el diff.** Esta HU es solo API. En particular **no** se toca `sessionPermissions/domain/session-permission.const.ts`: las cinco claves retiradas quedan ahí declaradas e inertes, y su limpieza es deuda declarada con dueño Wilvardo en una HU aparte.
- **Idioma:** comentarios, docblocks, JSDoc, OpenAPI y mensajes de commit en **español**. Identificadores (variables, funciones, clases, claves de mapas) en **inglés**. Slugs en kebab-case inglés.
- **TypeScript estricto, cero `any`.**
- **Migraciones:** NUNCA usar `await` con `this.schema`. El DML va dentro de `this.defer(async (db) => { ... })` con `db.rawQuery`, que es el idioma vigente del repo (`database/migrations/1784573245783_curate_system_module_active.ts`).
- **Un solo `permissionGate` por ruta.** No apilar dos gates; la disyunción va dentro de `action` (`app/constants/permission_gate.ts:17-21`) y aquí **no hace falta**.
- **`GET /api/employee-badges/me` NUNCA lleva gate.** Es el gafete propio del colaborador, exento por diseño (`collaborator-own-badge`, `employees_permission_catalog.ts:659-668`). Añadirle `permissionGate` rompería la app del empleado.
- **No se toca** `SystemPermissionCatalogSyncService`, `SystemPermissionCatalogConsistencyService`, `commands/permissions_check_consistency.ts`, `role_preset_service.ts`, `session_permission_tree_service.ts`, `permission_gate_http.ts` ni `database/seeders/**`.
- **No se retira ninguno de los cinco `sensitive-*-write`** (superficie de `USRH1787204602831`, activa) ni ninguno de los seis `collaborator-*`.
- **No se cambia el contrato de la negativa del gate:** `{ title, detail, key }` con `key: 'PERM.DENIED'`, sin campo `code` (`app/helpers/permission_gate_http.ts:22-32`). Lo consumen más de cien rutas.
- **Commits:** Conventional Commits, tipo en minúsculas e inglés, descripción en español. Un commit por tarea.

## Correcciones al spec detectadas al validar (2026-08-28)

Se releyeron todas las anclas contra el estado real del repo. **Coinciden todas** las de `employees_permission_catalog.ts`, `role_presets.ts`, `badge.routes.ts`, `badge.controller.ts`, `physical_consent.controller.ts`, `role_service.ts`, los dos servicios de catálogo y el comando de coherencia. Tres divergencias que sí cambian el trabajo:

1. **El molde de migración que cita el spec no existe.** `database/migrations/1787157820195000_add_assist_origin_to_assists_table.ts` no está en el repo, y no hay ninguna migración con prefijo `1787`. La más alta es `1786737531066000_add_cfdi_issuance_fields_to_tenant_billing_profiles.ts`. Además ese molde era DDL simétrico y no cubría DML. **Molde real que usa este plan:** `database/migrations/1784573245783_curate_system_module_active.ts` — DML sobre tablas del mismo dominio (`system_modules`), con `this.defer` + `db.rawQuery`, docblock en español citando la HU y nota de idempotencia.

2. **El censo de tests que romperán está incompleto.** El spec anota cinco aserciones en un solo archivo. Rompen **cuatro archivos**:

| Archivo | Qué rompe | Por qué |
|---|---|---|
| `tests/unit/constants/employees_permission_catalog_granular.spec.ts` | 5 aserciones (`:71-74` por `responsable`/`asignados`, `:77` por `tab-consentimiento-write`) | Lo que el spec ya anotaba |
| `tests/unit/constants/system_permission_catalog.spec.ts:72-76` | `assert.lengthOf(actions, 124)` | El catálogo baja a 119 |
| `tests/unit/constants/employees_read_permission_declarations.spec.ts:15` | `assert.equal(keys.length, 119)` | Bajan a 116 al mudar las tres de gafete |
| `tests/unit/constants/employees_write_permission_declarations.spec.ts:15` | `assert.equal(keys.length, 147)` | Suben a 151 al recibir las cuatro |
| `tests/unit/routes/employees_expediente_read_permission_gate_routes.spec.ts:160-163` | Afirma `permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showEmployeeBadge\|getEmployeeBadgePdf\|getEmployeeBadgePng)` en `badge.routes.ts` | Esas tres claves dejan de existir |

   Los cinco son **reparación de lo que este cambio rompe**, no cobertura nueva. Verificados como NO afectados: `role_presets.spec.ts` (solo valida formato semver, `1.1.0` pasa), `employees_permission_catalog_slug_types.type_check.ts`, `employees_permission_catalog_integrity_guards.spec.ts`, `employees_permission_catalog_exception_profile.spec.ts` (`isAtLeast(…, 28)`), `employees_read_permission_declarations.spec.ts:55-60` (solo slugs `-read`), `tests/functional/employee_badge.spec.ts` (todos sus actores son `root`, que pasa por el atajo de bypass).

3. **`tabWrite` / `tabFull` ya excluyen `'consentimiento'`** (`role_presets.ts:48-50`, `:57-59`). El endurecimiento consiste en añadir `'responsable'` y `'asignados'` a la exclusión, no en crearla.

**Verificación previa que sigue pendiente y no se puede hacer desde el código:** consultar por tenant si existe algún rol con la exigencia del módulo `employees` encendida, `tab-foto-read` concedido y `generate-badges` ausente. Ese rol dejaría de descargar gafetes individuales. Es el efecto buscado de D-1, pero hay que reportárselo a Wilvardo antes de liberar. Sin acceso a las bases de los clientes no se resuelve aquí.

## File Structure

**NUEVO (1)**

- `database/migrations/<siguiente disponible>_soft_delete_retired_employee_permission_slugs.ts` — baja lógica de las cinco filas de `system_permissions` del módulo `employees` y de sus concesiones en `role_system_permissions`. Único artefacto con estado; reversible por `down()`.

**EDITADOS (10)**

| Archivo | Responsabilidad del cambio |
|---|---|
| `app/constants/role_presets.ts` | Endurecer el tipo de `tabWrite`/`tabFull`; quitar los cinco slugs de tres presets; subir `version` de esos tres |
| `app/constants/employees_permission_catalog.ts` | Extraer `tabReadEntry`, sustituir `tabActionsNoDelete` por `tabActionsReadOnly`, recortar tres pestañas a solo lectura, escribir el criterio de la regla 4 |
| `app/constants/employees_read_permission_declarations.ts` | Eliminar las tres declaraciones de gafete |
| `app/constants/employees_write_permission_declarations.ts` | Recibir las cuatro declaraciones de gafete sobre `generate-badges` |
| `app/modules/employee-badge/badge.routes.ts` | Montar los cuatro gates; reescribir el comentario de cabecera |
| `app/modules/employee-badge/badge.controller.ts` | `@swagger` de `bulk`: respuesta `403` |
| `app/modules/consent/physical/physical_consent.controller.ts` | Docblock: hacer explícita la exención de `owner` (solo comentario) |
| `tests/unit/constants/employees_permission_catalog_granular.spec.ts` | Reparar 5 aserciones |
| `tests/unit/constants/system_permission_catalog.spec.ts` | Reparar el conteo 124 → 119 |
| `tests/unit/constants/employees_read_permission_declarations.spec.ts` · `employees_write_permission_declarations.spec.ts` · `tests/unit/routes/employees_expediente_read_permission_gate_routes.spec.ts` | Reparar conteos y la aserción de gates de gafete |

**Orden de las tareas y por qué es ese.** Tarea 1 antes que Tarea 2 porque endurecer los tipos **primero** hace que el compilador señale los sitios que hay que tocar; al revés, retirar los slugs del catálogo no rompe el build (el `as EmployeeActionSlug` de `tabWrite`/`tabFull` anula la comprobación) y el fallo aparecería en runtime como `422 PLT.RP.MISSING_PERMISSIONS`. Tarea 3 fusiona la mudanza de declaraciones con el cableado de rutas porque separarlas deja el repo sin compilar entre commits.

---

## Task 1: Endurecer los tipos de preset y retirar los cinco slugs de los tres presets afectados

**Files:**
- Modify: `app/constants/role_presets.ts`
- Test: `tests/unit/constants/role_presets.spec.ts` (existente, no se edita; debe seguir en verde)

**Interfaces:**
- Consumes: `EmployeeActionSlug` de `#constants/employees_permission_catalog` (sin cambios en esta tarea).
- Produces: `type WritableTabSection` (interno, no exportado). `tabWrite(section: WritableTabSection): EmployeeActionSlug[]` y `tabFull(section: WritableTabSection): EmployeeActionSlug[]`. `tabRead(section: (typeof ALL_TAB_SECTIONS)[number]): EmployeeActionSlug` **no cambia de firma**: `read-only` la sigue llamando sobre las diecinueve secciones (`:192`).

**Contexto que necesitas.** `role_presets.ts` define cuatro plantillas de permisos que el cliente aplica de un clic. `tabRead`/`tabWrite`/`tabFull` construyen los slugs por concatenación con `as EmployeeActionSlug`. Ese cast **anula la comprobación de tipos**: hoy nada impide nombrar un slug que el catálogo no declara. Cuando eso pasa, `RolePresetService.list()` lanza `422 PLT.RP.MISSING_PERMISSIONS` al listar o previsualizar plantillas (`app/services/role_preset_service.ts:73-83`) — un fallo de runtime, en producción, no de build. Esta tarea convierte ese fallo silencioso en un error de compilación.

- [ ] **Paso 1: Endurecer las firmas de `tabWrite` y `tabFull`**

En `app/constants/role_presets.ts`, sustituye el bloque de `tabWrite` y `tabFull` (líneas 48-64) por:

```ts
/**
 * Secciones cuya escritura sí la gobierna un `tab-<section>-write` que el API
 * exige de verdad. Quedan fuera `consentimiento`, `responsable` y `asignados`
 * (USRH1787433076993): sus casillas de escritura y eliminación se retiraron
 * del catálogo porque ninguna operación del servidor las consultaba —lo real
 * es `register-physical-consent` para la primera y
 * `manage-responsible-edit` ∨ `manage-assigned-edit` para las otras dos—.
 * Excluirlas aquí convierte en error de compilación cualquier intento de
 * volver a repartirlas desde una plantilla; sin esta exclusión el
 * `as EmployeeActionSlug` de abajo lo dejaría pasar y reventaría en runtime
 * con 422 PLT.RP.MISSING_PERMISSIONS.
 */
type WritableTabSection = Exclude<
  (typeof ALL_TAB_SECTIONS)[number],
  'consentimiento' | 'responsable' | 'asignados'
>

function tabWrite(section: WritableTabSection): EmployeeActionSlug[] {
  return [
    `tab-${section}-read` as EmployeeActionSlug,
    `tab-${section}-write` as EmployeeActionSlug,
  ]
}

function tabFull(section: WritableTabSection): EmployeeActionSlug[] {
  return [
    ...tabWrite(section),
    `tab-${section}-delete` as EmployeeActionSlug,
  ]
}
```

No toques `tabRead` (líneas 44-46) ni `ALL_TAB_SECTIONS`.

- [ ] **Paso 2: Correr el compilador para que señale los cinco sitios**

Ejecuta: `npx tsc --noEmit`

Esperado: **FALLA** con cinco errores `TS2345 — Argument of type '"responsable"' / '"asignados"' is not assignable to parameter of type 'WritableTabSection'`, en `role_presets.ts` líneas 116, 118, 171, 221 y 222. Ésa es la señal de que el endurecimiento funciona. Apunta las líneas; son exactamente las que arregla el paso siguiente.

- [ ] **Paso 3: Ajustar los tres presets afectados**

Cuatro ediciones en el mismo archivo.

**3a — `HR_ADMIN_SLUGS`:** elimina la línea `'tab-consentimiento-write',` (línea 113), dejando solo `'tab-consentimiento-read',`. El bloque queda:

```ts
  ...tabFull('expediente'),
  'tab-consentimiento-read',
  ...tabFull('domicilio'),
  ...tabFull('bancos'),
  tabRead('responsable'),
  ...tabFull('zonas'),
  tabRead('asignados'),
  ...tabFull('biometricos'),
```

(Es decir: `...tabFull('responsable')` → `tabRead('responsable')` y `...tabFull('asignados')` → `tabRead('asignados')`, **sin** el spread, porque `tabRead` devuelve un slug suelto y no un arreglo.)

**3b — `BRANCH_SUPERVISOR_SLUGS`:** en la línea 171, `...tabWrite('asignados'),` → `tabRead('asignados'),`. El bloque queda:

```ts
  tabRead('responsable'),
  ...tabWrite('zonas'),
  tabRead('asignados'),
  ...tabWrite('anotaciones'),
```

**3c — `DATA_ENTRY_SLUGS`:** elimina `'tab-consentimiento-write',` (línea 220) y cambia las dos siguientes. El bloque queda:

```ts
  ...tabWrite('expediente'),
  'tab-consentimiento-read',
  tabRead('responsable'),
  tabRead('asignados'),
  ...tabWrite('certificaciones'),
```

**3d — No toques las descripciones de las plantillas.** La de `data-entry` (`:258`) menciona que captura "consentimiento, responsable, asignación" y **sigue siendo cierta**: ese preset conserva `register-physical-consent`, `manage-responsible-edit` y `manage-assigned-edit`, que son los permisos que el API sí exige para esas tres escrituras.

- [ ] **Paso 4: Subir la versión de las tres plantillas que cambiaron de contenido**

En el arreglo `ROLE_PRESETS`, cambia `version: '1.0.0'` por `version: '1.1.0'` en **hr-admin** (línea 232), **branch-supervisor** (línea 241) y **data-entry** (línea 259).

**`read-only` se queda en `'1.0.0'` (línea 250)**: solo usa `tabRead` sobre `ALL_TAB_SECTIONS` y su contenido no cambió ni un slug. Subirle la versión invalidaría vistas previas abiertas sin motivo.

- [ ] **Paso 5: Verificar que compila y que la suite de presets pasa**

Ejecuta: `npx tsc --noEmit`
Esperado: **sin errores**.

Ejecuta: `node ace test unit --files=role_presets`
Esperado: **PASSED**, 5 tests. En particular sigue pasando `write implica read y delete implica write en la misma sección tab-*`: ya no hay ningún `tab-responsable-write` ni `tab-asignados-write` en ninguna plantilla, así que ese bucle no tiene nada que comprobar para esas secciones.

- [ ] **Paso 6: Commit**

```bash
git add app/constants/role_presets.ts
git commit -m "refactor: Endurecer el tipo de tabWrite/tabFull y retirar las casillas muertas de tres plantillas"
```

---

## Task 2: Retirar los cinco slugs del catálogo y escribir el criterio que impide que vuelvan

**Files:**
- Modify: `app/constants/employees_permission_catalog.ts`
- Test: `tests/unit/constants/employees_permission_catalog_granular.spec.ts`
- Test: `tests/unit/constants/system_permission_catalog.spec.ts`

**Interfaces:**
- Consumes: `type TabSection` (interno del archivo, `:47-50`), `ActionCatalogEntry` de `#constants/permission_catalog_types`.
- Produces: `function tabReadEntry<S extends TabSection>(section: S, label: string)` y `function tabActionsReadOnly<S extends TabSection>(section: S, label: string)` — ambas internas, no exportadas. Deja de existir `tabActionsNoDelete`. `EmployeeActionSlug` (`:719`) pierde cinco miembros de su unión: `'tab-consentimiento-write'`, `'tab-responsable-write'`, `'tab-responsable-delete'`, `'tab-asignados-write'`, `'tab-asignados-delete'`.

**Contexto que necesitas.** Este archivo es la fuente única de qué casillas ofrece la pantalla de Roles y permisos para el módulo Colaboradores. `EMPLOYEES_PERMISSION_CATALOG` se arma con un arreglo literal `as const` que intercala objetos sueltos con llamadas a tres helpers generadores. **El riesgo número uno de esta tarea es TS2590.** El docblock de `:88-99` documenta por qué `tabActionsWithDelete` y `tabActionsNoDelete` son dos funciones sin ramas en vez de una con `if`: como `boolean` no es un tipo literal, TypeScript infiere el retorno de una función con rama como la **unión** de las dos formas posibles para todas las llamadas; al combinar ~19 de esas llamadas en un solo arreglo `as const`, la unión se multiplica y el compilador se rinde con `TS2590 — union type too complex to represent`. El helper nuevo tiene que ser igual de plano: sin condicionales, con `as const` en cada entrada y en el arreglo devuelto, e inferido desde el argumento.

- [ ] **Paso 1: Extraer el constructor de la entrada `read`**

En `app/constants/employees_permission_catalog.ts`, sustituye la función `tabReadWrite` completa (líneas 65-86) por el par siguiente. El docblock de `:52-64` que la precede se conserva tal cual, encima de `tabReadWrite`.

```ts
/**
 * Entrada `tab-<section>-read`, común a toda pestaña. Extraída de
 * `tabReadWrite` (USRH1787433076993) porque tres pestañas ahora declaran solo
 * la consulta y necesitan construirla sin arrastrar la de escritura.
 *
 * Genérica en `S` y con `as const` en el objeto por la misma razón que sus
 * consumidoras: anotar el retorno ensancharía `slug` a `string` y ese
 * ensanchamiento se filtraría a `EmployeeActionSlug`.
 */
function tabReadEntry<S extends TabSection>(section: S, label: string) {
  return {
    slug: `tab-${section}-read` as const,
    displayName: `Consultar ${label}`,
    kind: 'read' as const,
    section,
    exceptionProfile: 'standard' as const,
    legacyEquivalence: { systemPermissionSlug: 'read' as const, relation: 'broader' as const },
  } as const
}

function tabReadWrite<S extends TabSection>(section: S, label: string, writeLegacySlug?: string) {
  const read = tabReadEntry(section, label)
  const write = {
    slug: `tab-${section}-write` as const,
    displayName: `Modificar ${label}`,
    kind: 'write' as const,
    section,
    exceptionProfile: 'standard' as const,
    legacyEquivalence: {
      systemPermissionSlug: writeLegacySlug ?? 'update-information',
      relation: 'broader' as const,
    },
  } as const
  return [read, write] as const
}
```

- [ ] **Paso 2: Sustituir `tabActionsNoDelete` por `tabActionsReadOnly`**

En el mismo archivo, sustituye la función `tabActionsNoDelete` y su comentario (líneas 118-121) por:

```ts
/**
 * Pestañas de las que solo se declara la consulta (USRH1787433076993). Su
 * escritura la gobierna un permiso distinto que el API sí exige:
 * `register-physical-consent` para consentimiento
 * (`app/modules/consent/physical/physical_consent.controller.ts:13`), y
 * `manage-responsible-edit` ∨ `manage-assigned-edit` para responsable y
 * asignados (`app/constants/employees_write_permission_declarations.ts`,
 * entradas `createUserResponsibleEmployee` / `updateUserResponsibleEmployee` /
 * `deleteUserResponsibleEmployee`). Declarar aquí un `-write` o un `-delete`
 * para ellas produce una casilla que el cliente puede marcar y desmarcar sin
 * que cambie nada.
 *
 * Sin ramas, igual que sus dos hermanas y por la misma razón (TS2590, ver el
 * docblock de `tabActionsWithDelete`).
 */
function tabActionsReadOnly<S extends TabSection>(section: S, label: string) {
  return [tabReadEntry(section, label)] as const
}
```

`tabActionsNoDelete` desaparece: tras el paso 3 no le queda ningún sitio de llamada y dejarla sería código muerto.

- [ ] **Paso 3: Recortar las tres pestañas en el arreglo del catálogo**

En el bloque `// --- B) Pestañas del expediente`, tres sustituciones:

- Línea 366, el comentario de cabecera del bloque:
  ```ts
  // --- B) Pestañas del expediente (nuevas) — 16 con delete + consentimiento,
  //         responsable y asignados solo de consulta (USRH1787433076993) ---
  ```
- Línea 378: `...tabActionsWithDelete('responsable', 'Responsable'),` → `...tabActionsReadOnly('responsable', 'Responsable'),`
- Línea 380: `...tabActionsWithDelete('asignados', 'Asignados'),` → `...tabActionsReadOnly('asignados', 'Asignados'),`
- Línea 388: `...tabActionsNoDelete('consentimiento', 'Consentimiento'),` → `...tabActionsReadOnly('consentimiento', 'Consentimiento'),`

**No toques** la entrada suelta `register-physical-consent` de las líneas 357-364: es una de las 28 legacy con `relation: 'exact'` y no tiene nada que ver con `tab-consentimiento-write`.

- [ ] **Paso 4: Escribir el criterio de la regla 4 en el propio catálogo**

Inserta este bloque justo después del docblock de cabecera del archivo (es decir, después de la línea 19 `*/` y antes de `export type EmployeesSection`):

```ts
/**
 * Criterio de declaración (USRH1787433076993, regla de negocio 4). Ninguna
 * acción de este catálogo puede quedar declarada sin que al menos una
 * operación real del API la exija —vía `middleware.permissionGate` o vía
 * comprobación explícita en controlador—, salvo excepción escrita aquí por
 * nombre y con motivo. Una casilla que el servidor nunca consulta le miente
 * al cliente en la pantalla de Roles y permisos: la marca, la desmarca y no
 * pasa nada.
 *
 * Excepciones vigentes, por nombre y con motivo:
 *
 * 1. `manage-responsible-read`, `manage-assigned-read`, `manage-files`,
 *    `read-only-files`, `show-face-id`, `show-fingers` y
 *    `reveal-sensitive-data`. Sin consumidor en el API, pero sí lo tienen en
 *    el backoffice, donde condicionan pantalla. Producen efecto, no son
 *    casillas muertas.
 * 2. `sensitive-identificacion-write`, `sensitive-contacto-write`,
 *    `sensitive-financiero-write`, `sensitive-salud-write` y
 *    `sensitive-biometrico-write`. Superficie declarada por adelantado de
 *    USRH1787204602831, que es quien les añade el consumidor. Dueña: esa HU.
 * 3. Los seis `collaborator-*` de la sección F. Llevan bloque `exemption`,
 *    `SystemPermissionCatalogSyncService.ensureAction` los ignora y nunca
 *    tienen fila en `system_permissions`. Son apartados documentales, no
 *    permisos.
 *
 * Retirados por esta HU, con baja lógica en base de datos (no borrado) y por
 * tanto reversibles: `tab-consentimiento-write`, `tab-responsable-write`,
 * `tab-responsable-delete`, `tab-asignados-write` y `tab-asignados-delete`.
 * Lo que de verdad gobierna esas escrituras es `register-physical-consent` y
 * `manage-responsible-edit` ∨ `manage-assigned-edit`, que no se tocan.
 */
```

- [ ] **Paso 5: Correr los tests de catálogo para ver caer las aserciones**

Ejecuta: `node ace test unit --files=employees_permission_catalog_granular`
Esperado: **FALLA** el test `declara read+write(+delete) por pestaña; consentimiento sin delete`, por `tab-responsable-write` ausente.

Ejecuta: `node ace test unit --files=system_permission_catalog`
Esperado: **FALLA** el test `Empleados enumera las 28 legacy…` con `expected 119 to have a length of 124`.

Ejecuta: `npx tsc --noEmit`
Esperado: **sin errores** — si sale `TS2590 — union type too complex to represent`, la causa es que `tabActionsReadOnly` quedó con una rama o sin algún `as const`; revísala contra el paso 2.

- [ ] **Paso 6: Reparar las cinco aserciones del test granular**

En `tests/unit/constants/employees_permission_catalog_granular.spec.ts`, sustituye el test completo de las líneas 50-81 por:

```ts
  test('declara read+write(+delete) por pestaña; consentimiento, responsable y asignados solo read', ({
    assert,
  }) => {
    const tabs = [
      'foto',
      'trabajo',
      'persona',
      'condicion-medica',
      'periodos-lactancia',
      'expediente',
      'domicilio',
      'bancos',
      'zonas',
      'biometricos',
      'anotaciones',
      'dispositivos',
      'evaluaciones',
      'assessments',
      'ruta-carrera',
      'certificaciones',
    ]
    for (const tab of tabs) {
      assert.exists(EMPLOYEES_PERMISSION_CATALOG.find((a) => a.slug === `tab-${tab}-read`))
      assert.exists(EMPLOYEES_PERMISSION_CATALOG.find((a) => a.slug === `tab-${tab}-write`))
      assert.exists(EMPLOYEES_PERMISSION_CATALOG.find((a) => a.slug === `tab-${tab}-delete`))
    }

    // USRH1787433076993: la escritura de estas tres la gobierna otro permiso
    // que el API sí exige, así que su -write y su -delete quedaron retirados.
    for (const tab of ['consentimiento', 'responsable', 'asignados']) {
      assert.exists(
        EMPLOYEES_PERMISSION_CATALOG.find((a) => a.slug === `tab-${tab}-read`),
        `tab-${tab}-read`
      )
      assert.isUndefined(
        EMPLOYEES_PERMISSION_CATALOG.find((a) => a.slug === `tab-${tab}-write`),
        `tab-${tab}-write`
      )
      assert.isUndefined(
        EMPLOYEES_PERMISSION_CATALOG.find((a) => a.slug === `tab-${tab}-delete`),
        `tab-${tab}-delete`
      )
    }
  })
```

**No toques** el bloque de las líneas 92-133 (`declara listado nuevo, descargas, sensibles…`): lista `generate-badges` entre los declarados y **sigue válido**, porque `generate-badges` se cablea, no se retira.

- [ ] **Paso 7: Reparar el conteo del test de catálogo del sistema**

En `tests/unit/constants/system_permission_catalog.spec.ts`, líneas 72-76, sustituye:

```ts
    assert.lengthOf(
      actions,
      119,
      '28 legacy + 51 pestaña + 1 suministros + 5 listado + 18 descargas + 10 sensibles + 6 exemption'
    )
```

La aritmética: las pestañas pasan de 56 a 51 porque `responsable` y `asignados` bajan de tres entradas a una (−4) y `consentimiento` de dos a una (−1). Total 124 − 5 = 119. Las aserciones vecinas de `legacy` (28) y `exempt` (6) **no cambian**.

- [ ] **Paso 8: Verificar que todo pasa**

Ejecuta: `node ace test unit --files=employees_permission_catalog_granular`
Esperado: **PASSED**, 8 tests.

Ejecuta: `node ace test unit --files=system_permission_catalog`
Esperado: **PASSED**.

Ejecuta: `npx tsc --noEmit`
Esperado: **sin errores**.

- [ ] **Paso 9: Commit**

```bash
git add app/constants/employees_permission_catalog.ts \
        tests/unit/constants/employees_permission_catalog_granular.spec.ts \
        tests/unit/constants/system_permission_catalog.spec.ts
git commit -m "refactor: Retirar del catálogo las cinco casillas de Colaboradores que ninguna ruta exige"
```

---

## Task 3: Cablear `generate-badges` en las cuatro rutas de gafete del backoffice

**Files:**
- Modify: `app/constants/employees_read_permission_declarations.ts:61-63`
- Modify: `app/constants/employees_write_permission_declarations.ts`
- Modify: `app/modules/employee-badge/badge.routes.ts`
- Modify: `app/modules/employee-badge/badge.controller.ts` (solo el bloque `@swagger` de `bulk`)
- Test: `tests/unit/constants/employees_read_permission_declarations.spec.ts:11-15`
- Test: `tests/unit/constants/employees_write_permission_declarations.spec.ts:13-15`
- Test: `tests/unit/routes/employees_expediente_read_permission_gate_routes.spec.ts:143-176`

**Interfaces:**
- Consumes: `employeesStandard(action: string | readonly string[]): PermissionGateOptions` — el helper local de cada archivo de declaraciones (`:5-11` en ambos, idénticos). `generate-badges` como miembro de `EmployeeActionSlug` (sigue declarado tras la Tarea 2).
- Produces: cuatro claves nuevas en `EMPLOYEES_WRITE_PERMISSION_DECLARATIONS`: `showEmployeeBadge`, `getEmployeeBadgePdf`, `getEmployeeBadgePng`, `bulkEmployeeBadges`, las cuatro con `{ module: 'employees', action: 'generate-badges', bypass: 'standard' }`. Desaparecen las tres homónimas de `EMPLOYEES_READ_PERMISSION_DECLARATIONS`.

**Contexto que necesitas.** Hoy hay dos criterios distintos sobre la misma acción más un hueco: las tres rutas individuales de gafete se gobiernan con `tab-foto-read`, y `POST /bulk` no se gobierna con nada —solo tiene el rate-limit—, así que la descarga masiva de documentos con foto, nombre y número de empleado la ejecuta cualquier usuario con sesión sobre todo el personal de su alcance de empresa. Las cuatro pasan a `generate-badges`, que es la casilla que el backoffice ya usa para mostrar u ocultar el botón.

**Es sustitución, no disyunción.** No dejes `['generate-badges', 'tab-foto-read']`: `tab-foto-read` está en los cuatro presets, así que un OR reproduciría el defecto —desmarcar la casilla de gafetes seguiría sin producir efecto para casi todos los roles—.

**Es `middleware.permissionGate`, no `evaluateEnforced`.** `evaluate` corta en `module-not-enforced` y OTORGA (`app/services/permission_gate_service.ts:43-46`), y el interruptor de exigencia por empresa nace apagado. Usar `evaluateEnforced` en `/bulk` lo dejaría más estricto que sus tres hermanas y negaría hoy mismo a roles que hoy descargan. Con `permissionGate` las cuatro superficies quedan bajo el mismo criterio y cierran a la vez, el día que la empresa encienda el interruptor.

- [ ] **Paso 1: Eliminar las tres declaraciones del archivo de lectura**

En `app/constants/employees_read_permission_declarations.ts`, borra las líneas 61-63:

```ts
  showEmployeeBadge: employeesStandard('tab-foto-read'),
  getEmployeeBadgePdf: employeesStandard('tab-foto-read'),
  getEmployeeBadgePng: employeesStandard('tab-foto-read'),
```

`tab-foto-read` conserva sus demás rutas y solo pierde estas tres: pasa a decidir sobre lo que su nombre dice, la fotografía.

- [ ] **Paso 2: Añadir las cuatro declaraciones al archivo de escritura**

En `app/constants/employees_write_permission_declarations.ts`, inserta este bloque justo después de `importShiftAssignmentsExcel:` (línea 38) y antes de `syncDepartments:`:

```ts
  // Gafetes del backoffice (USRH1787433076993): las cuatro vías —consultar,
  // PDF, PNG y lote— las gobierna `generate-badges`, que es la casilla que el
  // backoffice ya usaba para mostrar u ocultar el botón. Antes las tres
  // individuales colgaban de `tab-foto-read` —el permiso de ver la
  // fotografía, no el de generar el documento— y el lote no comprobaba nada.
  // El gafete propio del colaborador (`GET /me`) queda fuera a propósito: es
  // exención de diseño (`collaborator-own-badge`).
  showEmployeeBadge: employeesStandard('generate-badges'),
  getEmployeeBadgePdf: employeesStandard('generate-badges'),
  getEmployeeBadgePng: employeesStandard('generate-badges'),
  bulkEmployeeBadges: employeesStandard('generate-badges'),
```

Y actualiza el docblock del mapa (líneas 16-20) añadiendo el frente nuevo a la enumeración:

```ts
/**
 * Mapa acumulado de declaraciones de permiso de escritura del módulo Empleados
 * (orden 7 + Persona/Domicilio/Bancos + Condición médica/Lactancia/Incapacidades + Expediente/Certificaciones + Turnos/Excepciones/Vacaciones + Biométricos/Dispositivos + Evaluaciones/Assessments/Ruta de carrera + Zonas/Anotaciones/Bonificaciones/Responsable/Activos + Gafetes del backoffice).
 * Fuente única que consumen las rutas; no concede nada ni enciende la exigencia del módulo.
 */
```

- [ ] **Paso 3: Montar los cuatro gates en las rutas**

Sustituye `app/modules/employee-badge/badge.routes.ts` completo por:

```ts
import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

const employeeBadgeBulkRateLimit = limiter.define('employee-badge-bulk', (ctx) => {
  return limiter.allowRequests(3).every('1 minute').usingKey(`user:${ctx.auth.user!.userId}`)
})

/**
 * Gafete del trabajador (USRH1784686362321). Espejo `providers.routes.ts`.
 *
 * Las cuatro vías del backoffice —consultar, PDF, PNG y lote— las gobierna
 * `generate-badges` (USRH1787433076993): la casilla que el backoffice ya
 * usaba para mostrar u ocultar el botón decide ahora también en el servidor.
 * Antes las tres individuales colgaban de `tab-foto-read`, que es el permiso
 * de ver la fotografía y no el de generar un documento con foto, nombre y
 * número de empleado; y `/bulk` no comprobaba nada más allá del rate-limit.
 *
 * `/me` NO lleva gate y no debe llevarlo: es el gafete propio del
 * colaborador, exento por diseño (`collaborator-own-badge`,
 * `employees_permission_catalog.ts`). Añadírselo rompería la app del empleado.
 *
 * `/me` y `/bulk` se registran ANTES de `/:employeeId`: Adonis resuelve en
 * orden de registro y de otro modo `/me` matchearía como `employeeId`.
 */
router
  .group(() => {
    router.get('/me', '#modules/employee-badge/badge.controller.me')
    router
      .post('/bulk', '#modules/employee-badge/badge.controller.bulk')
      .use(employeeBadgeBulkRateLimit)
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.bulkEmployeeBadges))
    router
      .get('/:employeeId', '#modules/employee-badge/badge.controller.show')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.showEmployeeBadge))
    router
      .get('/:employeeId/pdf', '#modules/employee-badge/badge.controller.pdf')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.getEmployeeBadgePdf))
    router
      .get('/:employeeId/png', '#modules/employee-badge/badge.controller.png')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.getEmployeeBadgePng))
  })
  .prefix('/api/employee-badges')
  .use(middleware.auth())
  .use(middleware.businessScope())
```

El gate de `/bulk` va **después** de `employeeBadgeBulkRateLimit`, y el orden de registro de las rutas no se reordena.

- [ ] **Paso 4: Documentar la respuesta 403 en el `@swagger` de `bulk`**

En `app/modules/employee-badge/badge.controller.ts`, dentro del bloque `@swagger` de `bulk`, inserta el `'403'` justo después del `'401'` (líneas 426-427) y antes del `'404'`:

```
   *       '401':
   *         description: Sin autenticación.
   *       '403':
   *         description: |
   *           Sin el permiso `generate-badges` del módulo Empleados, con la
   *           exigencia del módulo encendida en la empresa.
   *         content:
   *           application/json:
   *             example:
   *               title: Sin permiso
   *               detail: No tienes permiso para realizar esta operación.
   *               key: PERM.DENIED
   *       '404':
```

Es la forma literal que emite `respondPermissionGateDenial` (`app/helpers/permission_gate_http.ts:27-31`). **No toques el cuerpo del método `bulk` (líneas 453-469) ni su `catch`**: el gate corre en el middleware, antes de entrar al método.

- [ ] **Paso 5: Correr los tests para ver caer las aserciones**

Ejecuta: `node ace test unit --files=employees_read_permission_declarations`
Esperado: **FALLA** con `expected 116 to equal 119`.

Ejecuta: `node ace test unit --files=employees_write_permission_declarations`
Esperado: **FALLA** con `expected 151 to equal 147`.

Ejecuta: `node ace test unit --files=employees_expediente_read_permission_gate_routes`
Esperado: **FALLA** el test `GET de lactancia, consentimiento y gafete declaran sus gates`, por `badge.routes.ts: showEmployeeBadge`.

- [ ] **Paso 6: Reparar los dos conteos de declaraciones**

En `tests/unit/constants/employees_read_permission_declarations.spec.ts`, líneas 11-15:

```ts
  test('declara exactamente 116 operaciones con module employees y bypass standard', ({
    assert,
  }) => {
    const keys = Object.keys(EMPLOYEES_READ_PERMISSION_DECLARATIONS)
    assert.equal(keys.length, 116)
```

En `tests/unit/constants/employees_write_permission_declarations.spec.ts`, líneas 13-15:

```ts
  test('declara exactamente 151 operaciones con module employees y bypass standard', ({ assert }) => {
    const keys = Object.keys(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS)
    assert.equal(keys.length, 151)
```

El resto de ambos tests no cambia: el bucle que comprueba `module`, `bypass` y pertenencia al catálogo sigue pasando, porque `generate-badges` está declarado en el catálogo.

- [ ] **Paso 7: Mudar la aserción de gates de gafete al mapa de escritura**

En `tests/unit/routes/employees_expediente_read_permission_gate_routes.spec.ts`, quita la entrada de gafete del arreglo del test de lectura (líneas 160-163) y renombra ese test; luego añade uno propio para las cuatro vías. El grupo de las líneas 143-193 queda:

```ts
test.group('lactancia/consentimiento/foto — PermissionGate lectura expediente', () => {
  test('GET de lactancia y consentimiento declaran sus gates', async ({ assert }) => {
    const routes = [
      {
        file: 'start/routes/employee_lactation_periods_routes.ts',
        keys: [
          'indexLactationPeriods',
          'lactationComplianceReport',
          'listAllLactationConflicts',
          'listLactationConflicts',
          'indexLactationEvidences',
        ],
      },
      {
        file: 'app/modules/consent/physical/physical_consent.routes.ts',
        keys: ['getEmployeeConsentStatus'],
      },
    ]

    for (const { file, keys } of routes) {
      const content = await readFile(join(process.cwd(), file), 'utf8')
      for (const key of keys) {
        assert.include(
          content,
          `permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.${key})`,
          `${file}: ${key}`
        )
      }
    }
  })

  // USRH1787433076993: el gafete dejó de colgar de `tab-foto-read`. Las cuatro
  // vías del backoffice las gobierna `generate-badges`, declarado en el mapa
  // de escritura porque su `kind` es `write`.
  test('las cuatro vías de gafete del backoffice declaran generate-badges', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'app/modules/employee-badge/badge.routes.ts'),
      'utf8'
    )
    for (const key of [
      'showEmployeeBadge',
      'getEmployeeBadgePdf',
      'getEmployeeBadgePng',
      'bulkEmployeeBadges',
    ]) {
      assert.include(
        content,
        `permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.${key})`,
        key
      )
    }
    assert.notInclude(content, 'EMPLOYEES_READ_PERMISSION_DECLARATIONS')
  })

  test('gafete/me y consentimiento download-url no declaran gate de lectura', async ({
    assert,
  }) => {
    const badges = await readFile(
      join(process.cwd(), 'app/modules/employee-badge/badge.routes.ts'),
      'utf8'
    )
    const me = badges.split('\n').find((l) => l.includes('badge.controller.me'))
    assert.notInclude(me!, 'permissionGate')
    const consent = await readFile(
      join(process.cwd(), 'app/modules/consent/physical/physical_consent.routes.ts'),
      'utf8'
    )
    const dl = consent.split('\n').find((l) => l.includes('evidence-download-url'))
    assert.notInclude(dl!, 'READ_PERMISSION')
  })
})
```

El tercer test —el que exige que `/me` no lleve gate— se conserva intacto y es la red que protege la regla 2.

- [ ] **Paso 8: Verificar que todo pasa**

Ejecuta: `npx tsc --noEmit`
Esperado: **sin errores**. Si sale `Property 'showEmployeeBadge' does not exist on type …READ_PERMISSION_DECLARATIONS`, quedó una referencia huérfana: búscala con `rg -n "READ_PERMISSION_DECLARATIONS.(showEmployeeBadge|getEmployeeBadgePdf|getEmployeeBadgePng)" app start tests`.

Ejecuta: `node ace test unit`
Esperado: **PASSED**, suite completa en verde.

- [ ] **Paso 9: Commit**

```bash
git add app/constants/employees_read_permission_declarations.ts \
        app/constants/employees_write_permission_declarations.ts \
        app/modules/employee-badge/badge.routes.ts \
        app/modules/employee-badge/badge.controller.ts \
        tests/unit/constants/employees_read_permission_declarations.spec.ts \
        tests/unit/constants/employees_write_permission_declarations.spec.ts \
        tests/unit/routes/employees_expediente_read_permission_gate_routes.spec.ts
git commit -m "feat: Gobernar las cuatro vías de gafete del backoffice con el permiso generate-badges"
```

---

## Task 4: Migración de baja lógica de las cinco casillas y de sus concesiones

**Files:**
- Create: `database/migrations/<siguiente disponible>_soft_delete_retired_employee_permission_slugs.ts`

**Interfaces:**
- Consumes: nada del código de la aplicación. Es DML puro sobre `system_modules`, `system_permissions` y `role_system_permissions`.
- Produces: filas de `system_permissions` con `system_permission_deleted_at` poblado y sus concesiones en `role_system_permissions` con `role_system_permission_deleted_at` poblado, ambas con la misma marca literal.

**Contexto que necesitas.** Retirar los cinco slugs del catálogo (Tarea 2) deja sus filas vivas en base de datos sin declaración que las respalde. `node ace permissions:check-consistency` las lista bajo "Registrado en BD, ya no declarado en el catálogo" y sale con `exitCode = 1`. La salida es baja lógica, no borrado, y basta por tres anclas verificadas:

1. `SystemPermissionCatalogConsistencyService.checkModuleActions` filtra `whereNull('system_permission_deleted_at')` (`app/services/system_permission_catalog_consistency_service.ts:107-109`). Una fila dada de baja no entra en `registeredPermissions`, luego no entra en `registeredNotDeclared` (`:141-148`), luego el comando no pone `exitCode = 1` (`commands/permissions_check_consistency.ts:65-73`). **Sin lista blanca y sin excepción escrita en el servicio.**
2. `SystemPermissionCatalogSyncService.ensureAction` busca `.withTrashed()` y devuelve `false` si encuentra la fila (`app/services/system_permission_catalog_sync_service.ts:98-106`). La baja **sobrevive a `db:seed`**: no se recrea en la siguiente pasada.
3. `role_system_permissions` tiene FK a `system_permissions` (`database/migrations/1716931908935_create_role_system_permissions_table.ts:12`). Un borrado duro exigiría cascada; la baja lógica lo evita y conserva la evidencia de qué tenía concedido cada rol.

**Por qué la marca de tiempo es una constante literal y no `NOW()`.** El `down()` revierte acotando por `= RETIRED_AT`, no por `IS NOT NULL`. Es lo que impide revivir una fila que ya estaba dada de baja por otro motivo antes de esta migración. Con `NOW()` evaluado dos veces las dos marcas no coincidirían y `down()` no encontraría nada.

- [ ] **Paso 1: Averiguar el número de migración libre**

Ejecuta: `ls database/migrations | sort | tail -5`

Al validar este plan (2026-08-28) la más alta era `1786737531066000_add_cfdi_issuance_fields_to_tenant_billing_profiles.ts`, así que el nombre a usar es:

```
database/migrations/1786737531070000_soft_delete_retired_employee_permission_slugs.ts
```

**Nunca fijes un número absoluto sin correr antes ese `ls`**: el resto del set de HUs toca el mismo directorio y el número puede haber avanzado. Si aparece algo mayor, usa el siguiente múltiplo de mil por encima.

- [ ] **Paso 2: Escribir la migración**

Crea el archivo con este contenido exacto:

```ts
import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1787433076993 — Baja lógica de las cinco casillas de permiso del módulo
 * Empleados que ninguna operación del API exigía.
 *
 * El catálogo tipado dejó de declararlas (`employees_permission_catalog.ts`);
 * sin esta baja sus filas quedarían vivas en `system_permissions` sin
 * declaración que las respalde y `permissions:check-consistency` saldría con
 * exitCode = 1. Se marcan, no se borran: `role_system_permissions` tiene FK a
 * `system_permissions`, la baja sobrevive a `db:seed`
 * (`SystemPermissionCatalogSyncService.ensureAction` busca `.withTrashed()`)
 * y la evidencia de qué tenía concedido cada rol se conserva.
 *
 * Cero pérdida de capacidad: la edición de esas secciones la deciden
 * `register-physical-consent` y `manage-responsible-edit` ∨
 * `manage-assigned-edit`, que no se tocan aquí.
 *
 * Idempotente en las dos direcciones: el filtro `IS NULL` de `up()` hace que
 * una segunda corrida no toque nada, y la condición `= RETIRED_AT` de
 * `down()` hace que una segunda reversión tampoco. Esa condición es además lo
 * que impide revivir una fila que ya estaba dada de baja por otro motivo
 * antes de esta migración: por eso la marca es una constante literal del
 * archivo y no un `NOW()` evaluado dos veces.
 */
const RETIRED_SLUGS = [
  'tab-consentimiento-write',
  'tab-responsable-write',
  'tab-responsable-delete',
  'tab-asignados-write',
  'tab-asignados-delete',
] as const

/** Marca única de la corrida: `down()` revive exactamente lo que dio de baja `up()`. */
const RETIRED_AT = '2026-08-28 00:00:00'

const SLUG_PLACEHOLDERS = RETIRED_SLUGS.map(() => '?').join(', ')

export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      // Si la instalación no tiene el módulo `employees`, el JOIN no resuelve
      // ninguna fila y la migración termina sin hacer nada ni fallar.
      await db.rawQuery(
        `UPDATE \`system_permissions\` AS \`sp\`
         INNER JOIN \`system_modules\` AS \`sm\`
           ON \`sp\`.\`system_module_id\` = \`sm\`.\`system_module_id\`
         SET \`sp\`.\`system_permission_deleted_at\` = ?
         WHERE \`sm\`.\`system_module_slug\` = 'employees'
           AND \`sm\`.\`system_module_deleted_at\` IS NULL
           AND \`sp\`.\`system_permission_slug\` IN (${SLUG_PLACEHOLDERS})
           AND \`sp\`.\`system_permission_deleted_at\` IS NULL`,
        [RETIRED_AT, ...RETIRED_SLUGS]
      )

      // Solo las concesiones de las filas que acaba de marcar el UPDATE de
      // arriba: `sp.system_permission_deleted_at = RETIRED_AT` las identifica
      // sin necesidad de arrastrar ids entre consultas, y deja fuera las de
      // cualquier fila dada de baja antes por otro motivo.
      await db.rawQuery(
        `UPDATE \`role_system_permissions\` AS \`rsp\`
         INNER JOIN \`system_permissions\` AS \`sp\`
           ON \`rsp\`.\`system_permission_id\` = \`sp\`.\`system_permission_id\`
         SET \`rsp\`.\`role_system_permission_deleted_at\` = ?
         WHERE \`sp\`.\`system_permission_deleted_at\` = ?
           AND \`sp\`.\`system_permission_slug\` IN (${SLUG_PLACEHOLDERS})
           AND \`rsp\`.\`role_system_permission_deleted_at\` IS NULL`,
        [RETIRED_AT, RETIRED_AT, ...RETIRED_SLUGS]
      )
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE \`role_system_permissions\`
         SET \`role_system_permission_deleted_at\` = NULL
         WHERE \`role_system_permission_deleted_at\` = ?`,
        [RETIRED_AT]
      )

      await db.rawQuery(
        `UPDATE \`system_permissions\`
         SET \`system_permission_deleted_at\` = NULL
         WHERE \`system_permission_deleted_at\` = ?`,
        [RETIRED_AT]
      )
    })
  }
}
```

Nota sobre la regla del proyecto: aquí **no** hay `await this.schema`. El DML va en `this.defer(async (db) => …)`, que es el idioma que ya usan 75 migraciones del repo, y `db` no es el getter `schema`, así que no hay riesgo de doble ejecución.

- [ ] **Paso 3: Comprobar que el comando de coherencia falla ANTES de migrar**

Ejecuta: `node ace permissions:check-consistency`

Esperado: **`exitCode = 1`**, y bajo la sección "Registrado en BD, ya no declarado en el catálogo (módulo Empleados)" aparecen los cinco: `tab-consentimiento-write`, `tab-responsable-write`, `tab-responsable-delete`, `tab-asignados-write`, `tab-asignados-delete`. **Pega la salida literal**: es el segundo de los tres resultados que exige la prueba manual 1 del spec.

Si sale `exitCode = 0`, la base de datos local no tiene esas filas sembradas y la prueba no es concluyente; corre `node ace db:seed` primero y repite.

- [ ] **Paso 4: Correr la migración y comprobar que el comando queda limpio**

Ejecuta: `node ace migration:run`
Esperado: la migración aparece como `migrated`.

Ejecuta: `node ace permissions:check-consistency`
Esperado: **`exitCode = 0`**, y esa sección imprime `(ninguno)`. **Pega la salida literal.**

- [ ] **Paso 5: Comprobar que `db:seed` no revive las filas**

Ejecuta: `node ace db:seed` — dos veces seguidas.

Después consulta:

```sql
SELECT system_permission_slug, system_permission_deleted_at
FROM system_permissions
WHERE system_permission_slug IN (
  'tab-consentimiento-write','tab-responsable-write','tab-responsable-delete',
  'tab-asignados-write','tab-asignados-delete'
);
```

Esperado: las cinco filas con `system_permission_deleted_at = '2026-08-28 00:00:00'`, y **ninguna fila nueva** con `NULL`. Es la prueba de que `ensureAction` respeta la baja por su `.withTrashed()`.

- [ ] **Paso 6: Probar el rollback antes de subir**

Ejecuta: `node ace migration:rollback --batch=<el batch de esta migración>`

Después:

```sql
SELECT system_permission_slug, system_permission_deleted_at
FROM system_permissions
WHERE system_permission_slug IN (
  'tab-consentimiento-write','tab-responsable-write','tab-responsable-delete',
  'tab-asignados-write','tab-asignados-delete'
);
```

Esperado: las cinco con `system_permission_deleted_at = NULL`, y sus concesiones en `role_system_permissions` también revividas.

Ejecuta: `node ace permissions:check-consistency`
Esperado: **`exitCode = 1`** otra vez, listando los cinco. Esa ida y vuelta es la prueba de la reversibilidad que exige la regla 7.

Vuelve a aplicarla: `node ace migration:run` → `exitCode = 0` de nuevo.

- [ ] **Paso 7: Comprobar que ningún preset quedó nombrando un slug retirado**

Con la migración aplicada, pide `GET /api/role-presets` y la vista previa de las cuatro plantillas (`hr-admin`, `branch-supervisor`, `read-only`, `data-entry`).

Esperado: **200** en las cinco llamadas, **cero 422**. Un `422` con `key: "plantilla-permisos-faltantes"` y `code: "PLT.RP.MISSING_PERMISSIONS"` significaría que se escapó un `tabWrite`/`tabFull` en la Tarea 1; `resolveEmployeesPermissionIds` filtra `whereNull('system_permission_deleted_at')` (`role_preset_service.ts:113-115`) y es la segunda red que lo detecta contra base de datos.

Comprueba también que las tres plantillas que cambiaron devuelven `version: "1.1.0"` y que `read-only` sigue en `"1.0.0"`.

- [ ] **Paso 8: Comprobar que una vista previa vieja ya no se puede aplicar**

Es el efecto que protege la regla 9 de la HU: quien tenía una vista previa abierta con el contenido anterior no debe poder aplicarla a ciegas.

Pide `POST /api/role-presets/role-presets/apply` para la plantilla `hr-admin` con `expectedPresetVersion: "1.0.0"` (la versión previa al despliegue).

Esperado: **409** con cuerpo:

```json
{
  "title": "Versión de plantilla obsoleta",
  "detail": "La plantilla \"hr-admin\" ya no coincide con la versión previsualizada.",
  "key": "plantilla-version-obsoleta",
  "code": "PLT.RP.STALE_PRESET_VERSION"
}
```

Y **ninguna concesión escrita**: verifica que las filas de `role_system_permissions` del rol destino no cambiaron. Repite con `expectedPresetVersion: "1.1.0"` y esperado **200**. Para `read-only`, `"1.0.0"` debe seguir siendo la versión aceptada.

- [ ] **Paso 9: Commit**

```bash
git add database/migrations/*_soft_delete_retired_employee_permission_slugs.ts
git commit -m "feat: Dar de baja lógica las cinco casillas retiradas y sus concesiones"
```

---

## Task 5: Corregir el docblock de la exención del consentimiento físico y cerrar la verificación

**Files:**
- Modify: `app/modules/consent/physical/physical_consent.controller.ts:407-411`

**Interfaces:** ninguna. Es un cambio de comentario, con **cero cambio de comportamiento**.

**Contexto que necesitas.** La validación del spec reportó que este controlador exime solo a `root` mientras el resto del módulo exime a `root` y `owner`. **Se refutó:** el fallback del controlador es `RoleService.hasAccess` (`:421`), y `app/services/role_service.ts:170` hace `if (role.roleSlug === 'root' || role.roleSlug === 'owner') return true`. `owner` ya queda exento, un nivel más abajo, y el efecto neto es idéntico al perfil `standard` del resto del módulo. Lo único defectuoso es el comentario, que menciona a `root` y calla a `owner`. Se corrige porque cuesta una línea y porque un comentario que describe mal una regla de acceso es exactamente el tipo de cosa que esta HU está arreglando.

- [ ] **Paso 1: Reescribir el docblock**

En `app/modules/consent/physical/physical_consent.controller.ts`, sustituye el docblock de las líneas 407-411 por:

```ts
  /**
   * `root` y `owner` quedan exentos, aunque por vías distintas: `root` por el
   * atajo de aquí mismo, y `owner` un nivel más abajo, en el
   * `if (role.roleSlug === 'root' || role.roleSlug === 'owner')` de
   * `RoleService.hasAccess` (`app/services/role_service.ts:170`). El efecto
   * neto coincide con el perfil `standard` que usa el resto del módulo: no
   * hay asimetría (verificado en USRH1787433076993). El resto de roles
   * necesita la fila real en `role_system_permissions` para el slug indicado.
   * Server-side SIEMPRE (S2): el BO solo oculta el botón, esto es lo que de
   * verdad protege.
   */
```

**No toques el cuerpo de `assertHasPermission` (líneas 412-429)** ni ninguna otra parte del flujo de consentimiento físico.

- [ ] **Paso 2: Verificación final del repo**

Ejecuta, en este orden:

```bash
npx tsc --noEmit
npm run lint
node ace test unit
```

Esperado: los tres **sin errores** y la suite de unidad en verde. `tsc --noEmit` además valida `tests/unit/constants/employees_permission_catalog_slug_types.type_check.ts`, que es la guarda de que `EmployeeActionSlug` sigue siendo una unión de literales y no colapsó a `string`.

Comprueba que no se coló ningún archivo del backoffice:

```bash
git diff --stat origin/multitenant...HEAD
```

Esperado: **10 archivos editados y 1 nuevo**, todos bajo `app/`, `database/migrations/` y `tests/`. Cero rutas de `valanserh-bo` / `gsti-rh-bo`.

- [ ] **Paso 3: Las pruebas manuales del gate, con el interruptor en sus dos estados**

Estas cuatro cierran las pruebas manuales del spec que no cubrió la Tarea 4. Pega el resultado literal de cada una en el PR.

**3a — Interruptor APAGADO (el estado de hoy, y el del día del despliegue).** Con la exigencia del módulo `employees` en `false`, pide las cuatro rutas con un rol no privilegiado y **sin** `generate-badges`:

- `GET /api/employee-badges/:employeeId`
- `GET /api/employee-badges/:employeeId/pdf`
- `GET /api/employee-badges/:employeeId/png`
- `POST /api/employee-badges/bulk`

Esperado: las cuatro **200**. Es el comportamiento de hoy y **no debe cambiar** el día del despliegue: `evaluate` corta en `module-not-enforced` y otorga.

**3b — Interruptor ENCENDIDO, con la casilla concedida.** Enciende la exigencia en una empresa de prueba (`app/services/platform_system_module_service.ts:74` es el único escritor) y concede `generate-badges` al rol. Pide las cuatro rutas.

Esperado: las cuatro **200**, con el mismo cuerpo y el mismo stream que antes. El rate-limit de `/bulk` (3 por minuto) sigue aplicando igual: a la cuarta petición del mismo minuto, **429**.

**3c — Interruptor ENCENDIDO, sin la casilla.** Quítale `generate-badges` al rol y repite las cuatro.

Esperado: las cuatro **403**, con cuerpo literal:

```json
{
  "title": "Sin permiso",
  "detail": "No tienes permiso para realizar esta operación.",
  "key": "PERM.DENIED"
}
```

Y **no se abre ningún stream ni se genera ningún PDF**: la negativa sale del middleware, antes de entrar al controlador. Ésta es la que cierra el hueco: `POST /bulk` es la vía que hoy responde 200 a cualquier autenticado.

**3d — El gafete propio del colaborador sigue saliendo.** Con un usuario colaborador cuyo rol **no** tiene `generate-badges` y con el interruptor encendido, pide `GET /api/employee-badges/me`.

Esperado: **200** con su gafete, exactamente como hoy. Esa ruta no monta gate y no debe montarlo (regla 2).

- [ ] **Paso 4: Comprobar que el backoffice no se rompió, sin recompilar nada**

Abre el listado de empleados y la tarjeta del colaborador con un rol no privilegiado.

Esperado: el botón de gafete se comporta igual que antes, y **no aparece** el error `v-can: permiso desconocido` en la consola del navegador. Es la prueba de que retirar los cinco slugs no toca la superficie del backoffice: las cinco claves siguen declaradas ahí, inertes, y `generate-badges` sigue emitiéndose en el árbol de permisos de la sesión.

- [ ] **Paso 5: Comprobar el criterio que manda sobre toda la HU — que nadie pierda nada**

Toma un rol de prueba al que se le hubiera concedido `tab-responsable-write` y `tab-consentimiento-write` **antes** del cambio. Con la migración aplicada:

1. Verifica que sigue pudiendo editar el responsable de un colaborador — lo decide `manage-responsible-edit` ∨ `manage-assigned-edit`, que no se tocaron.
2. Verifica que sigue pudiendo registrar el consentimiento firmado en papel — lo decide `register-physical-consent`, que tampoco se tocó.
3. Verifica en base de datos que sus filas quedaron con `role_system_permission_deleted_at` poblado:

```sql
SELECT rsp.role_id, sp.system_permission_slug, rsp.role_system_permission_deleted_at
FROM role_system_permissions rsp
JOIN system_permissions sp ON sp.system_permission_id = rsp.system_permission_id
WHERE sp.system_permission_slug IN (
  'tab-consentimiento-write','tab-responsable-write','tab-responsable-delete',
  'tab-asignados-write','tab-asignados-delete'
);
```

Esperado: todas con fecha, ninguna con `NULL`.

4. Vuelve a resolver el árbol de permisos del rol y comprueba que las cinco claves retiradas ya no aparecen.

- [ ] **Paso 6: Commit**

```bash
git add app/modules/consent/physical/physical_consent.controller.ts
git commit -m "docs: Aclarar que owner también queda exento del gate de consentimiento físico"
```

---

## DoD

- [ ] Los cinco slugs fuera del catálogo, con el criterio de la regla 4 y las tres familias de excepciones escritos en el propio archivo (Tarea 2, paso 4).
- [ ] `tabWrite` / `tabFull` endurecidos a `WritableTabSection`; cero `as EmployeeActionSlug` que pueda nombrar un slug inexistente (Tarea 1).
- [ ] Los tres presets afectados ajustados y con `version` en `1.1.0`; `read-only` intacto en `1.0.0`.
- [ ] Las cuatro rutas de gafete con `permissionGate` sobre `generate-badges`; `/me` sin gate.
- [ ] Las tres declaraciones de gafete mudadas al archivo de escritura, más `bulkEmployeeBadges` nueva; ninguna referencia huérfana a las claves eliminadas del archivo de lectura.
- [ ] Migración de baja lógica corrida, con `down()` probado; segunda pasada de `db:seed` sin recrear filas.
- [ ] Los **cinco archivos de test** reparados y la suite de unidad en verde: 5 aserciones del catálogo granular, el conteo 124 → 119, los conteos 119 → 116 y 147 → 151, y la aserción de gates de gafete mudada al mapa de escritura.
- [ ] `node ace permissions:check-consistency` → `exitCode = 0`, con los **tres** resultados pegados en el PR: antes del cambio (0), con el catálogo recortado y sin migrar (1, listando los cinco), tras migrar (0).
- [ ] Las ocho pruebas manuales, con resultado literal en el PR.
- [ ] Las cuatro plantillas responden 200 en lista y vista previa (cero 422), y aplicar `hr-admin` con `expectedPresetVersion: "1.0.0"` responde 409 `PLT.RP.STALE_PRESET_VERSION` sin escribir ninguna concesión.
- [ ] Docblock del consentimiento físico corregido; cero cambio de comportamiento en ese flujo.
- [ ] `@swagger` de `bulk` con la respuesta 403; OpenAPI y JSDoc en español.
- [ ] Cero archivos del backoffice en el diff.
- [ ] TS estricto, cero `any`; `npx tsc --noEmit` y `npm run lint` limpios.
- [ ] **En el PR, decirlo así:** la protección se declara ahora y entra en vigor cuando cada empresa enciende la exigencia del módulo. No venderlo como "cerrado hoy".
- [ ] Consulta por tenant de la combinación de riesgo —exigencia encendida + `tab-foto-read` sin `generate-badges`—, con resultado reportado a Wilvardo.
- [ ] Confirmar a la HU `USRH1787433076991` que `generate-badges` **se queda** (no se retira de ningún lado), y a la `USRH1787433076992` que el lado del API del lote de gafetes queda cerrado aquí para que no lo duplique.
- [ ] PR aprobado por Wilvardo · staging · producción.

## Lo que NO debe pasar

Repaso rápido antes de abrir el PR. Cada punto es un modo de falla real, no una hipótesis.

- Que un preset quede nombrando un slug retirado → `422 PLT.RP.MISSING_PERMISSIONS` al listar o previsualizar plantillas.
- Que `/me` acabe con gate → rompe la app del empleado.
- Que `check-consistency` quede en `exitCode = 1`.
- Que la migración borre filas en vez de darlas de baja.
- Que se toque `session-permission.const.ts` del backoffice.
- Que se retire alguno de los cinco `sensitive-*-write`.
- Que se cambie el contrato `{ title, detail, key }` de la negativa del gate.
- Que se use `evaluateEnforced` en lugar de `permissionGate` en `/bulk` → lo dejaría más estricto que sus tres hermanas y negaría hoy mismo a roles que hoy descargan.
- Que las tres rutas individuales queden con `['generate-badges', 'tab-foto-read']` en OR → reproduce el defecto que la HU viene a cerrar.
