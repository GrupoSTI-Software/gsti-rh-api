# Guardar contratos sin departamento ni puesto e importar sin relleno — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El contrato admite `NULL` en departamento y puesto, la copia al empleado solo lleva lo vigente de su empresa, y el importador Excel y la sincronización biométrica dejan de usar el relleno.

**Architecture:** Una migración DDL anulable con FK intactas; validador/modelo/controlador aceptan `null` con presencia leída de Vine; la copia reutiliza `EmployeeStructureService.verifyAssignable` una vez por campo; importador y sincronización asignan `null` en lugar del respaldo por nombre.

**Tech Stack:** AdonisJS 6 (Lucid, Vine), MySQL, TypeScript estricto.

**Spec:** `/Users/noeabelvargaslopez/Downloads/spec-USRH1789328927648.md` + `anexos-USRH1789328927648/anexo-a-borradores-de-codigo.md` (Anexo A, borradores verbatim — validar contra el código del día; drift de alcance/contrato/regla se escala a Wilvardo).

## Global Constraints

- Migración generada con `node ace make:migration employee_contracts --alter` (prefijo de 13 dígitos, nunca a mano); NUNCA `await this.schema`; una sentencia por columna; sin DML ni modelos en `up()`; orden lexicográfico (`naturalSort: false`); verificar con `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed` (nunca contra BD compartida, nunca dos migraciones a la vez).
- Reutilizar `EmployeeStructureService.verifyAssignable` — nunca reimplementar la consulta de pertenencia; si su firma falta o no devuelve booleano sin lanzar, detenerse y escalar.
- Contrato 422 Vine literal: `{ type: 'warning', title: 'Datos del contrato no válidos', message: 'Revisa los datos del contrato', detail, error, errors, key: 'datos-del-contrato-no-validos', code: 'EMP.CONTRACT.VAL_INPUT' }`; 500 saneado sin `error.message`/SQL/stack; logs solo con `error.code` e ids, nunca nombre/RFC/CURP/NSS/salario.
- TS estricto, cero `any` nuevo en lo tocado; no tocar `node_modules`; retiros de archivos vía `__TO_DELETE__/` con `git mv`.
- Nuevo catálogo `app/constants/employee_contract_error_codes.ts` espeja `employee_import_error_codes.ts` (prefijo `EMP.CONTRACT`); no enumera módulos/permisos; al final `node ace test unit --files="constants/"` debe pasar.
- No tocar: alta de empleado, borrados de depto/puesto, demo/seeders, `position_service`, `department_service`, `user_service`, etiquetas `|| 'Sin posición'`, exclusiones `<> 999`, `verifyInfo` del contrato, ramas de archivo, `BiometricEmployeeInterface.departmentId: number`.
- Rutas, permisos y `businessScope` de `start/routes/employee_contract_routes.ts` sin cambio; BO sin cambio (el formulario sigue exigiendo depto/puesto); despliegue sin DML (R9).

## Review Focus

- Multipart `''` llega como `null` (`convertEmptyStringsToNull`) y es estado legítimo, mientras `0`/`"abc"` debe dar 422 — un implementador podría tratar `''` como error o `0` como vacío.
- Carrera entre `verifyAssignable` y `save()`: el departamento se elimina después de verificado — el FK de MySQL debe rechazarlo y el 500 saneado no debe filtrar el nombre del constraint.
- Contratos legados que apuntan al 999 o a catálogos dados de baja se conservan como historia y la copia los ignora en silencio — un implementador podría bloquear el guardado o copiarlos.
- Umbral `0.6` de `findMostSimilar` en el importador: una coincidencia parcial ("Sistemas" vs "Sistemas y redes") asigna un departamento que el usuario no eligió.
- `down()` con filas `NULL` debe abortar con el conteo y no alterar la tabla — un implementador podría revertir inventando relleno.

---

### Task 1: Migración — `department_id` y `position_id` anulables

**Files:**
- Create: `database/migrations/<13 dígitos generados>_alter_employee_contracts_table.ts` (nombre lo genera `node ace make:migration`)
- Test: BD desechable `sae_pruebas` (no hay archivo de test; la evidencia es la salida de comandos)

**Interfaces:**
- Consumes: columnas actuales `INT UNSIGNED NOT NULL` + FK de `1741016429096` y `1741016440017`
- Produces: ambas columnas `INT UNSIGNED NULL` con las dos FK intactas; `down()` que aborta con conteo si hay `NULL`

- [ ] **Step 1: Generar la migración**

Run: `node ace make:migration employee_contracts --alter` (confirmar bandera con `node ace make:migration --help`)
Expected: archivo nuevo con prefijo de 13 dígitos; verificar que es el siguiente disponible con `ls database/migrations | grep -E '^[0-9]{13}_' | sort | tail -1`

- [ ] **Step 2: Escribir `up()` con dos `raw` sin `await` y `down()` con conteo en `defer`**

`up(): void` — dos sentencias `this.schema.raw('ALTER TABLE ... MODIFY COLUMN ... INT UNSIGNED NULL')` (una por columna, nota MySQL de `1784300000023`). `down()` en `this.defer`: `SELECT COUNT(*)` de filas con `NULL`; si > 0 lanza `Error('[USRH1789328927648] down() abortado: ${total} contratos sin departamento o sin puesto')`, si no dos `MODIFY ... NOT NULL`. Verbatim en Anexo A.1.

- [ ] **Step 3: Verificar `fresh --seed` sobre desechable y el `down()`**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed`
Expected: termina sin error; `SHOW CREATE TABLE employee_contracts` muestra ambas columnas `NULL` y las dos FK. Luego probar `down()` sobre la desechable: con un contrato en `NULL` aborta con el conteo y no altera; sin `NULL` revierte.

- [ ] **Step 4: Commit**

```bash
git add database/migrations/<archivo_generado>.ts
git commit -m "feat: Permitir contrato sin departamento ni puesto a nivel de esquema"
```

---

### Task 2: Validador, modelo y catálogo de códigos

**Files:**
- Modify: `app/validators/employee_contract.ts`
- Modify: `app/models/employee_contract.ts`
- Create: `app/constants/employee_contract_error_codes.ts`
- Test: `tests/functional/employee_contract_structure_optional.spec.ts` (se escribe en Task 7; aquí solo compilación)

**Interfaces:**
- Consumes: nada de Task 1 en código (solo esquema)
- Produces: `departmentId?: number | null`, `positionId?: number | null` aceptados; `EmployeeContract.departmentId: number | null`, `positionId: number | null`; `EMPLOYEE_CONTRACT_ERROR_CODES.VAL_INPUT = 'EMP.CONTRACT.VAL_INPUT'`

- [ ] **Step 1: Relajar ambos validadores a anulable-opcional**

En `createEmployeeContractValidator` y `updateEmployeeContractValidator`, cambiar las dos líneas a `vine.number().min(1).nullable().optional()` (Anexo A.2). No tocar ningún otro campo; el `update` sigue validando con `createEmployeeContractValidator` como hoy.

- [ ] **Step 2: Tipar el modelo como `number | null`**

En `app/models/employee_contract.ts`, `declare departmentId: number | null` y `declare positionId: number | null`. Relaciones `belongsTo` sin cambio.

- [ ] **Step 3: Crear el catálogo espejo de `employee_import_error_codes.ts`**

Crear `app/constants/employee_contract_error_codes.ts` con `EMPLOYEE_CONTRACT_ERROR_CODES = { VAL_INPUT: 'EMP.CONTRACT.VAL_INPUT' } as const` + tipo derivado (Anexo A.4).

- [ ] **Step 4: Verificar compilación y guardrail de constantes**

Run: `node ace test unit --files="constants/"` y `npx tsc --noEmit`
Expected: PASS, cero `any` nuevo.

- [ ] **Step 5: Commit**

```bash
git add app/validators/employee_contract.ts app/models/employee_contract.ts app/constants/employee_contract_error_codes.ts
git commit -m "feat: Aceptar contrato sin departamento ni puesto en validación y modelo"
```

---

### Task 3: Controlador — `store`/`update` con presencia Vine + 422 aditivo + Swagger

**Files:**
- Modify: `app/controllers/employee_contract_controller.ts` (`store`, `update`, dos `catch`, JSDoc `71-80` y `343-352`)
- Test: `tests/functional/employee_contract_structure_optional.spec.ts` (casos 1, 2, 3, 7)

**Interfaces:**
- Consumes: Task 2 (validador anulable, catálogo `VAL_INPUT`)
- Produces: `store` entrega `number | null`; `update` entrega objeto sin llaves cuando ausente; 422 `EMP.CONTRACT.VAL_INPUT`; 500 sin `error.message`

- [ ] **Step 1: Reescribir `store` para leer estructura de `data` validada**

`const data = await request.validateUsing(createEmployeeContractValidator)`; en el literal, `departmentId: data.departmentId ?? null`, `positionId: data.positionId ?? null` (retirar los dos `request.input`). Resto de campos sin cambio. (Anexo A.5; ancla actual `:176`, `:187-188`, `:209-210` — ubicar por nombre de método.)

- [ ] **Step 2: Reescribir `update` con presencia desde Vine**

Capturar `data`; armar el literal **sin** `departmentId` ni `positionId`; agregar solo `if ('departmentId' in data) employeeContract.departmentId = data.departmentId ?? null` (igual puesto). Nunca leer presencia de `request.input` ni del literal (siempre presente ⇒ siempre verdadero). (Anexo A.5.)

- [ ] **Step 3: Agregar rama `E_VALIDATION_ERROR` → 422 y sanear el 500 en ambos `catch`**

Tras `if (isFileIntakeError(error)) throw error`: si `error.code === 'E_VALIDATION_ERROR'` responder 422 con el cuerpo literal de Global Constraints (`detail`/`error` = `error.messages?.[0]?.message ?? ''`, `errors: error.messages`). El 500 conserva la llave `error` con texto fijo `'An unexpected error has occurred on the server'` y registra con `logger` solo `{ code: error.code, employeeContractId }`. (Anexo A.5.)

- [ ] **Step 4: Actualizar JSDoc Swagger de `store` y `update`**

`departmentId`/`positionId`: `required: false`, `nullable: true`; documentar la respuesta 422.

- [ ] **Step 5: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/controllers/employee_contract_controller.ts
git commit -m "feat: Guardar contrato sin estructura con error de validación claro"
```

---

### Task 4: Servicio — `update` por presencia + copia solo viva y de la empresa

**Files:**
- Modify: `app/services/employee_contract_service.ts` (`update`, `setDepartmentAndPositionFromLastContract`)
- Test: `tests/functional/employee_contract_structure_optional.spec.ts` (casos 2, 4, 5, 6)

**Interfaces:**
- Consumes: Task 3 (objeto con llaves solo cuando presentes); `new EmployeeStructureService().verifyAssignable(resolution)` → `Promise<{ ok: true } | { ok: false; field; requestedId }>` (instancia, una llamada por campo, el otro en `null`, `businessUnitId = employee.businessUnitId`)
- Produces: `update()` conserva cuando la llave falta; copia que nunca escribe relleno ni `NULL` por borrado

- [ ] **Step 1: Hacer `update` sensible a presencia**

Reemplazar las dos asignaciones incondicionales por `if ('departmentId' in employeeContract) currentEmployeeContract.departmentId = employeeContract.departmentId ?? null` (igual puesto). `create` sin cambio. (Anexo A.6; ancla `:43-44`.)

- [ ] **Step 2: Reescribir `setDepartmentAndPositionFromLastContract` con `verifyAssignable`**

`async setDepartmentAndPositionFromLastContract(employeeContract: EmployeeContract): Promise<void>`: buscar último contrato vivo (`employeeContractStartDate desc`) y empleado vivo; si falta cualquiera, `return` (R4: sin contratos no se toca nada). Por campo: si el contrato trae valor no-`null`, distinto del empleado, y `verifyAssignable({ departmentId, positionId: null, businessUnitId: employee.businessUnitId, departmentIdToVerify: departmentId, positionIdToVerify: null })` devuelve `{ ok: true }` → asignar (igual para puesto). `save()` solo si `employee.$isDirty`. Retirar el respaldo por nombre `:224-242`. Agregar import de `EmployeeStructureService` según lo deje USRH1788466831270; conservar imports `Department`/`Position` (`verifyInfoExist`). Si la firma real difiere en forma, ajustar la llamada sin reimplementar la consulta; si no existe o lanza, detenerse y escalar.

- [ ] **Step 3: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/services/employee_contract_service.ts
git commit -m "feat: Copiar al empleado solo estructura vigente de su empresa"
```

---

### Task 5: Importador Excel sin relleno

**Files:**
- Modify: `app/services/employee_service.ts` (`importFromExcel` ~`:2787-2793`, llamada ~`:3056`, creación ~`:3082-3083`, firma `updateExistingEmployee` ~`:3929-3939`, llamadas ~`:3985-3988`, `mapDepartmentBySimilarity` ~`:4165`, `mapPositionBySimilarity` ~`:4189`, bloque comentado ~`:3022-3023`)
- Test: `tests/functional/employees/employees_import_excel_without_structure.spec.ts` (casos CA8–CA10)

**Interfaces:**
- Consumes: `findMostSimilar<T>` sin cambio; `createEmployee` ya acepta `number | null` sin cambio
- Produces: `mapDepartmentBySimilarity(name, departments): number | null`, `mapPositionBySimilarity(name, positions): number | null` — sin respaldo, `null` cuando vacío o sin coincidencia

- [ ] **Step 1: Retirar el respaldo `defaultDepartment`/`defaultPosition` de `importFromExcel`**

Eliminar el bloque que busca por `includes('sin departamento')`/`includes('sin posición')`; quitar ambos de la llamada a `updateExistingEmployee`; en creación llamar `mapDepartmentBySimilarity(employeeData.department, departments)` y `mapPositionBySimilarity(employeeData.position, positions)`. Ajustar el bloque comentado a la firma nueva. (Ubicar por nombre de método: las líneas se movieron ~90.)

- [ ] **Step 2: Adelgazar `updateExistingEmployee` y conservar su guarda**

Quitar `defaultDepartment: any` y `defaultPosition: any` de la firma; actualizar las dos llamadas internas a la firma de dos args; conservar `if (departmentId !== null)` / `if (positionId !== null)` (es lo que hace que la actualización conserve, CA10).

- [ ] **Step 3: Tipar `map*BySimilarity` sin respaldo**

Firmas del Anexo A.8 con `departments: Pick<Department, 'departmentId' | 'departmentName'>[]` (igual puestos); `if (!name) return null`; exacto → id; si no `findMostSimilar(..., 0.6)` → id o `null`. Cero `any` nuevo en lo tocado; no tocar `findMostSimilar` ni filtros de empresa (SEG-7).

- [ ] **Step 4: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/employee_service.ts
git commit -m "feat: Importar empleados sin departamento ni puesto como sin asignar"
```

---

### Task 6: Sincronización biométrica sin relleno (validar vigencia antes de programar)

**Files:**
- Modify: `app/controllers/employee_controller.ts` (`synchronization` ~`:422`, `synchronizationBySelection` ~`:7067`) — SOLO si los métodos existen en la rama
- Test: revisión de código + grep (sin prueba automatizada: llama a API externa por axios, CA11 declarado)

**Interfaces:**
- Consumes: `BiometricEmployeeInterface` sin modificar; `verify` solo crea si el código no existe, sin cambio
- Produces: empleados nuevos creados con `departmentId = null`, `positionId = null`; ningún `withOut*` por nombre

- [ ] **Step 1: Validar si la tarea sigue vigente**

Run: `grep -n "async synchronization" app/controllers/employee_controller.ts`
Expected: si no hay coincidencias, las rutas fueron retiradas por USRH1790276646847 — marcar esta tarea N/A en el PR y saltar a Task 7. Si existen, continuar.

- [ ] **Step 2: Retirar respaldo por nombre y asignar `null` explícito**

En cada método: eliminar el bloque `withOutDepartmentId`/`withOutPositionId` con las dos consultas por nombre; donde se asignaban, poner `employee.departmentId = null` / `employee.positionId = null` con el comentario de que los ids de BioTime no son de Valanserh. No tocar control de acceso (SEG-8, deuda anotada).

- [ ] **Step 3: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/controllers/employee_controller.ts
git commit -m "feat: Crear empleados de biométricos sin departamento ni puesto"
```

---

### Task 7: Pruebas — 10 casos nuevos + regresiones + grep del DoD

**Files:**
- Create: `tests/functional/employee_contract_structure_optional.spec.ts` (7 casos: CA1–CA7)
- Create: `tests/functional/employees/employees_import_excel_without_structure.spec.ts` (3 casos: CA8–CA10, molde `employees_sensitive_import_excel_http.spec.ts`)
- Test: regresiones sin editar (lista abajo)

**Interfaces:**
- Consumes: Tasks 1–6
- Produces: 10 casos en verde; grep del DoD limpio salvo etiquetas ajenas

- [ ] **Step 1: Escribir el spec de contrato con fixture propio de dos empresas**

Empresas A/B; `DA1`, `DA2`, `PA1`, `PA2` en A; `DB1`, `PB1` en B; empleado `E` de A en `DA1`/`PA1`; tipo de contrato; usuario con permisos de alta/edición/borrado de contratos (molde `tests/functional/employees/employees_write_permission_gate.spec.ts`); folios únicos por corrida; aserciones por delta (la suite no aísla entre specs). Casos: (1) `POST` sin estructura → 201, contrato `NULL`, `E` intacto [CA1]; (2) `POST DA2/PA2` → `E` los toma, `PUT null` → contrato `NULL`, `E` conserva [CA2]; (3) `PUT` sin llaves → conserva [CA3]; (4) borrar reciente deja antiguo con depto dado de baja → `E` conserva [CA4]; (5) `POST DB1` con header A → 400 legado + contrato legado `DB1/PB1` no se propaga al borrar el reciente [CA5 + SEG-9 dos empresas]; (6) borrar único contrato → `E` conserva [CA6]; (7) `departmentId: 0` en `POST` y `PUT` → 422 con `key`/`code`, sin SQL, nada guardado [CA7]. Esqueleto en Anexo A.9.

- [ ] **Step 2: Escribir el spec de importador (3 casos)**

(1) fila nueva con celda vacía + departamento real "Sin departamento" en la empresa → `department_id NULL` [CA8]; (2) fila nueva con nombre exacto `DA2` → id [CA9]; (3) reimportar existente en `DA1/PA1` con celdas vacías → conserva [CA10].

- [ ] **Step 3: Correr los 10 casos nuevos en verde**

Run: `node ace test functional --files="employee_contract_structure_optional.spec.ts"` y `node ace test functional --files="employees_import_excel_without_structure.spec.ts"`
Expected: PASS.

- [ ] **Step 4: Correr las regresiones sin editar**

Run (uno por comando): `employees_write_permission_gate.spec.ts` (usa `DELETE /api/employee-contracts/1`), `employees_downloads_imports_permission_gate.spec.ts`, `employees_sensitive_import_excel_http.spec.ts`, `tests/unit/controllers/employee_import_excel_controller.spec.ts`, `employee_edicion_sin_estructura.spec.ts`, `employee_structure_service.spec.ts`
Expected: PASS. (Nota: `tests/functional/employees/employees_structure_optional_write.spec.ts` no existe — no buscarlo.)

- [ ] **Step 5: Pasar el grep del DoD y lint**

Run: `grep -n "Sin departamento\|Sin posición\|defaultDepartment\|defaultPosition\|withOutDepartmentId\|withOutPositionId" app/controllers/employee_controller.ts app/services/employee_service.ts app/services/employee_contract_service.ts`
Expected: solo etiquetas `employee_service.ts:6078,7335-7336` y comentarios ajenos. Luego lint en verde.

- [ ] **Step 6: Commit**

```bash
git add tests/functional/employee_contract_structure_optional.spec.ts tests/functional/employees/employees_import_excel_without_structure.spec.ts
git commit -m "test: Cubrir contrato e importación sin estructura ni relleno"
```

---

### Task 8: Manual de QA de API (regla `manual-qa-api` + `manual-qa-execution`)

**Files:**
- Create: `docs/superpowers/qa/<fecha>-USRH1789328927648-contrato-sin-estructura-qa-api.md` (misma carpeta que los demás manuales QA del API; no crear seeder nuevo)
- Test: el manual lo recorre una persona, no el agente (por defecto sin Playwright/`webapp-testing`)

**Interfaces:**
- Consumes: Tasks 1–7 ya en verde; constantes del repo tomadas de un manual anterior del mismo API o del código (URL base local, esquema de auth, envelope de éxito/error, seeder QA, dominio y contraseña de prueba)
- Produces: playbook con Problema/Solución/Ejemplo, Preparar, escenarios con `Objetivo:` + endpoint + response exacto, Limpieza (si aplica), Checklist

- [ ] **Step 1: Tomar las constantes del proyecto desde un manual anterior del mismo API**

Abrir un manual QA anterior del API y anotar URL base local, esquema de auth, forma del envelope de éxito y de error, dónde vive el seeder QA y con qué comando se corre, dominio y contraseña de usuarios de prueba. Sin estas, no redactar.

- [ ] **Step 2: Escribir Problema / Solución / Ejemplo + Preparar**

Dos párrafos en lenguaje llano + una línea `Ejemplo:` cotidiana (2-4 líneas, cero términos de negocio/técnicos). Luego Preparar: un solo comando de seeder existente con usuarios `qa-<feature>-<variante>@<dominio>` (uno por variante: con/sin permiso), roles/permisos/datos imprescindibles, y tabla de usuarios con su variante. Los ids de URL se entregan con la consulta que los resuelve (p. ej. `SELECT ... WHERE ...`), nunca hardcodeados.

- [ ] **Step 3: Escribir un escenario por variante, cada uno con `Objetivo:` + endpoint + response exacto**

Un escenario por CA verificable (CA1–CA10; CA11 declarado sin prueba automatizada por axios externo; CA12 de esquema como nota, no como escenario): primero la línea `Objetivo:` en lenguaje llano (qué se comprueba y por qué importa, sin repetir endpoint/status; si es variante dice qué cambia vs el anterior), después método + ruta + body pegable completo y status + body exactos (nunca "debería fallar"). Tras cada response, lista `campo`: qué es en palabras simples (valores fijos enumerados y traducidos, p. ej. `null` = sin asignar); cada dato se explica una sola vez. Archivo Excel (CA8–CA10): endpoint de plantilla, columnas obligatorias/vacías y qué significa vacía, tabla de filas literales (`<fecha-hora>` en lo único por corrida), qué produce cada fila y los números del resumen para ese archivo exacto, campo del formulario y cómo se envía. Sin rutas de archivos, clases, servicios, validadores, middlewares ni "revisa el código". Auth asumida resuelta.

- [ ] **Step 4: Verificar que cada escenario trae su `Objetivo:` y cerrar con Limpieza + Checklist**

Cada escenario se marca contra su objetivo, no contra los pasos; el no provocable en base sembrada se declara no verificable con motivo. Si se tocó un interruptor global, avisar antes del primer escenario y cerrar con paso de limpieza que lo restaura. Checklist con una casilla por escenario. Entregar ambiente levantado + playbook; no automatizar el recorrido salvo que se pida explícitamente para esa vez.

---

## Self-Review

- **Spec coverage:** R1→Tasks 1–3 (CA1); R2→Task 3 (CA2/CA3); R3→Task 4 (CA2/CA4/CA5); R4→Task 4 (CA6); R5→Tasks 3–4 sin relajar `verifyInfoExist` (CA5); R6→Task 3 catch 422 (CA7); R7→Task 5 (CA8–CA10); R8→Task 6 con validación de vigencia (CA11 declarado); R9→Task 1 sin DML + Global Constraints; esquema/CA12→Task 1; API §10→Task 3; SEG-1–9→Tasks 3–6 + Task 7 paso 5.
- **Step scan:** cada paso produce una sola cosa razonable (firma + valores exactos del spec en tests, comando + salida esperada en verificaciones); sin "TBD" ni cuerpos que firma+test ya determinen (los borradores viven en el Anexo, el plan solo cita firmas).
- **Type consistency:** `number | null` en validador/modelo/controlador/servicio/importador; `verifyAssignable` siempre de instancia con `businessUnitId` del empleado y un campo en `null`; `VAL_INPUT`/`EMP.CONTRACT.VAL_INPUT` idénticos en Tasks 2, 3 y 7.
- **Review Focus:** los cinco riesgos están arriba, cada uno con su pin: `''`-vs-`0`→Task 3+7.7; carrera verificada→500 saneado Task 3; legados silenciosos→Task 4+7.4/7.5; umbral 0.6→Task 5 (sin cambio de umbral, documentado); `down()` abortivo→Task 1.3.
- **Proportion:** el plan es más corto que spec+anexo; los cuerpos están en el Anexo, aquí solo decisiones (archivos, firmas, literales, comandos).
