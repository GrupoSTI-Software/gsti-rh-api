# Blindar la liberación de la persona del alta fallida — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la compensación del alta de empleado fallida (`EmployeeService.releasePersonIfOrphan`) solo pueda borrar un expediente que **nunca** tuvo vínculo con la empresa y que **nació dentro de una ventana corta**, en los seis puntos desde los que se dispara más el catch de la sincronización biométrica, sin cambiar una sola respuesta del API y dejando registro interno de cada decisión.

**Architecture:** Un predicado único (`resolvePersonRelease` en `app/helpers/person_release_guard.ts`) decide con dos consultas por PK: la persona existe y no está liberada; no tiene fila —viva o dada de baja— en `employees`, `users` ni `customers`; y `person_created_at` cae dentro de la ventana (`PERSON_RELEASE_WINDOW_MINUTES`, default 60, saturada a [1, 1440], con tolerancia de 120 s hacia el futuro) definida en `app/constants/person_release.constants.ts`. `releasePersonIfOrphan` pasa a recibir un `PersonReleaseContext { actorUserId, businessUnitScope }` obligatorio, consume el predicado, registra ambos desenlaces con `ScopeDeniedLogService` (best-effort) y nunca lanza. El compilador obliga a tocar los seis llamadores; el catch de `syncCreate` deja de usar `deletePersonById` y pasa por el mismo método.

**Tech Stack:** AdonisJS 6 · Lucid · Luxon · TypeScript estricto · Japa (`node ace test`) · MySQL (BD desechable `sae_pruebas`) · Mongo (`log_scope_denied`, se stubbea en tests)

**Repo:** `gsti-rh-api` · **Rama:** `feature/USRH1789698261608-blindar-liberacion-persona` · **Target:** `multitenant`

**HU:** USRH1789698261608 — *Blindar la liberación de la persona del alta fallida* · **Spec:** `~/Downloads/spec-USRH1789698261608.md` + anexos A, B, C

---

## Global Constraints

Copiadas del spec (§4, §12, §14, Anexo B). Cada tarea las hereda.

- **Regla 1.** Solo se libera un expediente que **nunca** haya tenido vínculo: sin fila en `employees`, `users` ni `customers` por `person_id`, **con o sin** `*_deleted_at`. Los tres `whereNotExists` van **sin** `whereNull('*_deleted_at')`.
- **Regla 2.** Además, solo si `person_created_at` está dentro de los **60 minutos previos** (default). La ventana se acota por **ambos** lados: hacia el futuro solo se toleran **120 s** de desfase de reloj (`PERSON_RELEASE_FUTURE_TOLERANCE_SECONDS`, no configurable).
- **Regla 3.** Ventana configurable por entorno: `PERSON_RELEASE_WINDOW_MINUTES`, `Env.schema.number.optional()`, default **60** en código, saturada a **[1, 1440]** con `logger.warn` al recortar. Ausente, vacía o no numérica → 60, nunca `NaN`. **No** va en `system_settings`.
- **Regla 4.** Si no se cumplen 1 y 2, no se borra nada: el expediente queda exactamente igual.
- **Regla 5.** El reintento legítimo del capturista sigue igual: persona recién creada y sin vínculo → se libera (`person_deleted_at` no nulo).
- **Regla 6.** Cada decisión deja registro en `log_scope_denied` vía `ScopeDeniedLogService.log` con `domain: 'person'`; rechazo → `action: 'release-orphan'`, concesión → `action: 'release-orphan-granted'`. `not-found` (no existe, ya liberada, id no entero o `<= 0`) **no** se registra: la compensación corre dos veces por diseño (`employee_service.ts:803` + `employee_controller.ts:1272`) y registrarlo metería un falso positivo en cada alta fallida legítima. El registro es best-effort y **jamás** condiciona la decisión.
- **Regla 7.** Cero cambios observables: mismo status, mismo cuerpo, mismas claves i18n en las cinco respuestas de `store`. El booleano de `releasePersonIfOrphan` se descarta en los seis puntos. **No** se distingue "no existe" de "no es liberable" en nada observable. **No** se registra el motivo desagregado (`linked`/`stale`) en Mongo: solo en `logger.warn` de aplicación.
- **Regla 8.** Los seis puntos (`employee_controller.ts:1145, :1179, :1196, :1211, :1272` y `employee_service.ts:803`) más el catch de `syncCreate` (`employee_service.ts:287`) pasan por el predicado. `deletePersonById` queda **sin llamadores** y `@deprecated`; **no se borra** ni él ni `cleanupOrphanPersons` (D3: código muerto, deuda registrada).
- **`PersonReleaseContext` es obligatorio, no opcional.** `actorUserId: null` **no** es motivo de rechazo (es trazabilidad, no autorización). `businessUnitScope: []` **no** cambia la decisión. **Prohibido** escribir "fail-closed por scope" en código, comentarios o PR: `people` no tiene `business_unit_id`.
- **`personId` no entero se normaliza y se niega**, con doble cinturón: `Number(...)` en los cuatro llamadores que pasan el valor crudo de `request.input('personId')` (`:1145, :1179, :1196, :1211`) **y** normalización dentro del helper.
- **Fail-closed en excepciones:** cualquier error dentro del predicado o del método → `return false`, `logger.error` con mensaje y `personId`, **nunca** la fila de `people`. Jamás se propaga.
- **Sin PII en ningún log:** solo `requestedId`, `actorUserId`, `businessUnitScope`, `action`, `domain`. Ni correo, CURP, RFC, NSS, nombre, ni `person_created_at` de la víctima.
- **`logger` de Adonis, nunca `console.*`.** Se sustituyen los `console.error` de `releasePersonIfOrphan` y del catch de `syncCreate`.
- **Nombre fijado:** `app/constants/person_release.constants.ts` (con sufijo `.constants.ts`, justificado en §7 del spec). No se renombra.
- **Fuente única:** una sola query de vínculos en todo el repo (la del helper). **No** reutilizar `personIsCollaborator` (semántica contraria). **No** tocar `app/helpers/person_is_collaborator.ts`, `app/models/person.ts`, `app/validators/person.ts`, `app/services/scope_denied_log_service.ts`, rutas, migraciones, seeders, i18n, `.env`, `.env.test`.
- **Sin transacción en la compensación** (no hay nada que atomizar; §2 del spec).
- **TypeScript estricto, cero `any` nuevo.** `npm run typecheck` y `npm run lint` limpios antes de cada commit.
- **Nada se retira a `__TO_DELETE__/`**: ningún archivo sale del repo.
- **No commitear `pnpm-lock.yaml` ni `pnpm-workspace.yaml`** (modificados por causas ajenas). Cada commit lista sus archivos; nunca `git add -A`.
- **Commits:** `fix(USRH1789698261608): <qué cambia en presente>`; cierre con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Tests contra `sae_pruebas`:** `node ace test` fija `NODE_ENV=test` y lee `.env.test` solo. La BD debe estar sembrada (`NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed`) **una sola vez** antes de arrancar, nunca en paralelo con otra migración.
- **Ubicar por nombre de función, no por número de línea.** Los números son del estado en `09a6fe7b` y sirven para orientarse.

---

## Estado actual verificado (2026-09-18, `multitenant` @ `09a6fe7b`)

Cada ancla del spec coincide con el código. Hallazgos que **ajustan** el plan respecto al spec:

| Hallazgo | Evidencia | Qué cambia |
|---|---|---|
| **`env.get()` no es "en caliente".** Devuelve primero `#values` (validado al arrancar) y solo cae a `process.env` si la variable no estaba definida al boot. | `node_modules/@adonisjs/env/build/index.js:287-295` | Regla 3 de la HU ("sin liberar versión") se cumple con la variable de entorno. El punto del DoD "surte efecto **sin reiniciar**" **no** se promete: cambiar la variable exige reiniciar el proceso, como toda variable de entorno en Adonis 6. Los tests usan `env.set()` (mismo molde que `tests/functional/assist_punch_time_window.spec.ts:199-210`). Se anota en el PR. |
| **CA-9 cambia comportamiento en la sincronización biométrica.** Hoy el catch de `syncCreate` borra vía `deletePersonById` **cualquier** persona, incluida la preexistente que llegó con `employee.personId`. Tras D2, la preexistente cae fuera de ventana y se conserva. | `employee_service.ts:283-293` | **Gate antes de la Tarea 4:** Noé confirma que conservar la persona preexistente no rompe la sincronización. El spec (§16 R4) lo pide antes de escribir código. |
| Rama real: `feature/USRH1789698261608-blindar-liberacion-persona` (el spec dice `…-alta-fallida`). | `git branch` | Drift trivial. Se usa la rama real. |
| `BiometricEmployeeInterface.personId` es opcional; el comentario `:209` dice "viene del frontend" pero llega del API de biométricos (`employee_controller.ts:375-390`). | `app/interfaces/biometric_employee_interface.ts:19` | Se corrige el comentario en la Tarea 4. |
| `config/database.ts:17` fija `timezone: 'Z'`; `person_created_at` es `autoCreate`, `notNullable` (`person.ts:247`). | leído | Los tests de BD fuerzan `person_created_at` con `UPDATE` directo y márgenes de **±2 días** para no depender de zonas horarias; los bordes finos (60 s, 121 s) se prueban en el predicado puro sin BD. |

### Los seis puntos + el catch, tal como están hoy

| # | Ancla | Código actual | Contexto disponible |
|---|---|---|---|
| 1 | `employee_controller.ts:1145` | `await employeeService.releasePersonIfOrphan(personId)` (estructura faltante) | `auth`, `businessUnitScope` destructurados en `store` (`:1076`) |
| 2 | `:1179` | ídem (estructura de otra empresa) | ídem |
| 3 | `:1196` | ídem (`verifyInfoExist`) | ídem |
| 4 | `:1211` | ídem (`verifyInfo`) | ídem |
| 5 | `:1272` | `await employeeService.releasePersonIfOrphan(failedPersonId)` (catch global; `:1269` ya castea) | ídem |
| 6 | `employee_service.ts:803` | `await this.releasePersonIfOrphan(personIdCandidate)` (catch de `create`) | ninguno: `create(employee, usersResponsible, SNDeviceList = '')` no tiene `HttpContext` |
| — | `employee_service.ts:287` | `await this.deletePersonById(personIdToDelete)` (catch de `syncCreate`) | ninguno: `syncCreate(employee)` lo llama `verify(employee, employeeService)` (`:4578`) desde `synchronization` (`:474`) y `synchronizationBySelection` (`:6954`), donde ya existe `allowedIds` (`:375`, `:6878`) y `auth` |

`personId` en `store` sale de `request.input('personId')` (`:1097`) **sin castear**: puede llegar como `"123"`.

### Moldes que se copian

- Constantes con saturación: `app/modules/assist-ingestion/assist_ingestion.constants.ts:79-140` (`saturate` y `readNumber` se pegan literal).
- Helper predicado: `app/helpers/person_is_collaborator.ts`, `app/helpers/employee_tenant_scope.ts`.
- Stub del log en tests: `tests/unit/services/scope_denied_log_service.spec.ts:12-20` (se reemplaza `LogStore.set` y se restaura en teardown).
- Override de entorno en tests: `tests/functional/assist_punch_time_window.spec.ts:199-210` (`env.set` + restauración en `finally`).
- Fixtures de persona/empleado por tabla: `tests/unit/helpers/person_is_collaborator.spec.ts:36-94`.
- Spec de contenido (grep sobre el fuente): `tests/unit/controllers/employees_expediente_read_shared_surface.spec.ts`.

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `app/constants/person_release.constants.ts` (**nuevo**) | Constantes de la ventana, tolerancia de futuro, `saturate`, `readNumber`, `getPersonReleaseWindowMinutes()`, `isWithinPersonReleaseWindow()` (predicado puro de tiempo, sin BD) | 1 |
| `start/env.ts` | Declara `PERSON_RELEASE_WINDOW_MINUTES` | 1 |
| `.env.example` | Documenta la variable | 1 |
| `tests/unit/constants/person_release_constants.spec.ts` (**nuevo**) | Default, saturación, ventana bilateral, lectura viva | 1 |
| `app/helpers/person_release_guard.ts` (**nuevo**) | `PersonReleaseContext`, `PersonReleaseDenialReason`, `PersonReleaseDecision`, `resolvePersonRelease()` — la ÚNICA query de vínculos | 2 |
| `tests/unit/helpers/person_release_guard.spec.ts` (**nuevo**) | El predicado contra BD: not-found, linked (3 tablas × vivo/baja), stale, releasable, id como string | 2 |
| `app/services/employee_service.ts` | `releasePersonIfOrphan` reescrito; `create()` recibe contexto y lo pasa en su catch | 3 |
| `app/controllers/employee_controller.ts` | Los cinco puntos de `store` + tercer argumento de `create` | 3 |
| `tests/unit/services/employee_store_transactional.spec.ts` | Arreglo de firma + 6 casos nuevos del método | 3 |
| `app/services/employee_service.ts` | `syncCreate()` recibe contexto, su catch pasa por `releasePersonIfOrphan`; `deletePersonById` `@deprecated`; comentarios corregidos | 4 |
| `app/controllers/employee_controller.ts` | `verify()` recibe y propaga el contexto; `synchronization` y `synchronizationBySelection` lo arman con `allowedIds` | 4 |
| `tests/unit/services/employee_sync_create_release.spec.ts` (**nuevo**) | CA-9: preexistente se conserva, creada en el acto se libera | 4 |
| `tests/unit/services/employee_release_person_surface.spec.ts` (**nuevo**) | Spec de contenido: cero llamadas de un argumento, cero llamadores de `deletePersonById`, cero `console.*` en las zonas | 4 |
| `docs/superpowers/plans/2026-09-18-blindar-liberacion-persona-alta-fallida-qa-api.md` (**nuevo**) | Manual de QA de API, hermano de este plan, según `~/.cursor/rules/manual-qa-api.mdc` | 5 |
| `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (no versionado, en `.git/info/exclude`) | Bloque `seedLiberacionPersonaQa` con la empresa, el capturista y los cuatro expedientes protegidos del manual | 5 |

---

## Preparación (una sola vez)

- [ ] Confirmar que estás en la rama y limpio (salvo `pnpm-lock.yaml` / `pnpm-workspace.yaml`):

```bash
git status --short && git branch --show-current
```

- [ ] Sembrar la BD desechable (nunca en paralelo con otra migración):

```bash
NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed
```

- [ ] Verificar que la suite base afectada está en verde antes de tocar nada:

```bash
node ace test unit --files="employee_store_transactional" --files="scope_denied_log_service" --files="person_is_collaborator"
```

Expected: todo PASS. Si `employee_store_transactional` falla en `getTemplateEmployee` ("La BD de pruebas no tiene empleados"), la siembra no dejó empleados: revisar la siembra antes de continuar, no adaptar el plan.

---

### Task 1: Constantes de la ventana y configuración

**Files:**
- Create: `app/constants/person_release.constants.ts`
- Modify: `start/env.ts:146` (tras `ASSIST_PUNCH_TIME_FUTURE_TOLERANCE_SECONDS`)
- Modify: `.env.example:252` (tras `ADMS_QUARANTINE_RETENTION_DAYS=`)
- Test: `tests/unit/constants/person_release_constants.spec.ts`

**Interfaces:**
- Consumes: `env` de `#start/env`, `logger` de `@adonisjs/core/services/logger`, `DateTime` de `luxon`.
- Produces (los usa la Tarea 2):
  - `PERSON_RELEASE_WINDOW_MINUTES_DEFAULT = 60`, `PERSON_RELEASE_WINDOW_MINUTES_MIN = 1`, `PERSON_RELEASE_WINDOW_MINUTES_CAP = 1_440`, `PERSON_RELEASE_FUTURE_TOLERANCE_SECONDS = 120`
  - `getPersonReleaseWindowMinutes(): number`
  - `isWithinPersonReleaseWindow(createdAt: DateTime | null | undefined): boolean`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/unit/constants/person_release_constants.spec.ts`:

```ts
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
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
node ace test unit --files="person_release_constants"
```

Expected: FAIL — `Cannot find module '#constants/person_release.constants'` (o error de tipos de `env.get('PERSON_RELEASE_WINDOW_MINUTES')` al compilar).

- [ ] **Step 3: Crear las constantes**

Crear `app/constants/person_release.constants.ts`:

```ts
import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'
import env from '#start/env'

/**
 * Ventana de frescura de la compensación del alta fallida (USRH1789698261608).
 *
 * La persona nace en `POST /api/persons`, otra petición HTTP que no deja rastro
 * del actor ni del acto: `person_created_at` es la ÚNICA señal disponible en
 * MySQL para distinguir "la persona que se acaba de crear para este alta" de
 * "cualquier persona del sistema". La ventana no prueba el acto, lo aproxima.
 *
 * Los topes duros viven en código: aflojar la ventana más allá de un día exige
 * cambiar código y pasar por revisión. No es configuración de negocio — no vive
 * en `system_settings` y no se publica.
 */
export const PERSON_RELEASE_WINDOW_MINUTES_DEFAULT = 60
export const PERSON_RELEASE_WINDOW_MINUTES_MIN = 1
export const PERSON_RELEASE_WINDOW_MINUTES_CAP = 1_440

/**
 * Tolerancia de desfase de reloj hacia el FUTURO, en segundos. NO es
 * configurable: es presupuesto de desfase entre nodos del API, no una perilla
 * de negocio. Sin esta cota, un `person_created_at` futuro ensancharía la
 * ventana en vez de cerrarla.
 */
export const PERSON_RELEASE_FUTURE_TOLERANCE_SECONDS = 120

function saturate(value: number, min: number, max: number, variable: string): number {
  const saturated = Math.min(Math.max(value, min), max)
  if (saturated !== value) {
    logger.warn(
      { variable, configured: value, applied: saturated, min, max },
      'Valor de configuración fuera del intervalo permitido; se aplica el tope de código.'
    )
  }
  return saturated
}

/**
 * Número de configuración, tolerante a que llegue como texto: el esquema de
 * entorno lo valida al arrancar, pero un valor puesto con `env.set` llega crudo.
 */
function readNumber(raw: unknown, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

/**
 * Ventana vigente, en minutos, ya saturada al tope del producto.
 * Se lee en CADA evaluación y no se cachea en módulo.
 */
export function getPersonReleaseWindowMinutes(): number {
  return saturate(
    readNumber(env.get('PERSON_RELEASE_WINDOW_MINUTES'), PERSON_RELEASE_WINDOW_MINUTES_DEFAULT),
    PERSON_RELEASE_WINDOW_MINUTES_MIN,
    PERSON_RELEASE_WINDOW_MINUTES_CAP,
    'PERSON_RELEASE_WINDOW_MINUTES'
  )
}

/**
 * Predicado puro de frescura, acotado por AMBOS lados. Fallo CERRADO: una fecha
 * ausente, inválida o en el futuro más allá de la tolerancia no es liberable.
 *
 * `person_created_at` es `notNullable` y `autoCreate` (`app/models/person.ts`),
 * así que el caso nulo solo se alcanza con datos corruptos — y ante la duda no
 * se libera. La cota superior existe porque un timestamp futuro ensancharía la
 * ventana: es la dirección peligrosa del sesgo.
 */
export function isWithinPersonReleaseWindow(createdAt: DateTime | null | undefined): boolean {
  if (!createdAt || !createdAt.isValid) {
    return false
  }

  const ageInMinutes = DateTime.now().diff(createdAt, 'minutes').minutes
  if (!Number.isFinite(ageInMinutes)) {
    return false
  }

  // Edad negativa = fecha en el futuro. Se tolera solo el desfase de reloj.
  const futureToleranceInMinutes = PERSON_RELEASE_FUTURE_TOLERANCE_SECONDS / 60
  if (ageInMinutes < -futureToleranceInMinutes) {
    return false
  }

  return ageInMinutes <= getPersonReleaseWindowMinutes()
}
```

- [ ] **Step 4: Declarar la variable en `start/env.ts`**

Localizar `ASSIST_PUNCH_TIME_FUTURE_TOLERANCE_SECONDS: Env.schema.number.optional(),` (`:146`) y agregar **justo después**:

```ts
  /**
   * Ventana de frescura, en minutos, dentro de la cual la compensación del alta
   * de empleado fallida puede liberar a la persona recién creada
   * (USRH1789698261608). Sin definir aplica el default del accesor (60 min).
   * El valor se satura al intervalo [1, 1440] fijado en código: fuera de rango
   * no interrumpe el alta, se satura y queda en bitácora. No es configuración
   * de negocio: no vive en `system_settings` y no se publica.
   */
  PERSON_RELEASE_WINDOW_MINUTES: Env.schema.number.optional(),
```

- [ ] **Step 5: Documentar en `.env.example`**

Al final del archivo, tras `ADMS_QUARANTINE_RETENTION_DAYS=` y su línea en blanco, agregar:

```
# Ventana de frescura, en minutos, para liberar a la persona de un alta de empleado
# fallida (USRH1789698261608). Default 60. Se satura a [1, 1440]: aflojarla más
# exige cambiar código y PR.
PERSON_RELEASE_WINDOW_MINUTES=60
```

- [ ] **Step 6: Correr el test y verificar que pasa**

```bash
node ace test unit --files="person_release_constants"
```

Expected: PASS, 9 casos. Además, en la salida debe aparecer al menos un `logger.warn` con `"variable":"PERSON_RELEASE_WINDOW_MINUTES"` (el caso de saturación).

- [ ] **Step 7: Typecheck y lint**

```bash
npm run typecheck && npx eslint app/constants/person_release.constants.ts start/env.ts tests/unit/constants/person_release_constants.spec.ts
```

Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add app/constants/person_release.constants.ts start/env.ts .env.example tests/unit/constants/person_release_constants.spec.ts
git commit -m "fix(USRH1789698261608): ventana de frescura configurable para liberar la persona del alta fallida

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: El predicado único de liberabilidad

**Files:**
- Create: `app/helpers/person_release_guard.ts`
- Test: `tests/unit/helpers/person_release_guard.spec.ts`

**Interfaces:**
- Consumes: `isWithinPersonReleaseWindow(createdAt)` de la Tarea 1; `Person` de `#models/person`.
- Produces (los usan las Tareas 3 y 4):
  - `interface PersonReleaseContext { actorUserId: number | null; businessUnitScope: number[] }`
  - `type PersonReleaseDenialReason = 'not-found' | 'linked' | 'stale'`
  - `type PersonReleaseDecision = { releasable: true; person: Person } | { releasable: false; reason: PersonReleaseDenialReason }`
  - `resolvePersonRelease(personId: number): Promise<PersonReleaseDecision>` — **nunca lanza por datos de entrada**; sí puede lanzar si la BD falla (el llamador lo atrapa).

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/unit/helpers/person_release_guard.spec.ts`:

```ts
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import BusinessUnit from '#models/business_unit'
import Person from '#models/person'
import User from '#models/user'
import { ensureRole } from '#tests/helpers/ensure_role'
import { resolvePersonRelease } from '#helpers/person_release_guard'

/**
 * USRH1789698261608 — predicado único de liberabilidad de la persona.
 *
 * Contra la BD real (mismo criterio que person_is_collaborator.spec):
 *  - `not-found`: no existe, ya liberada, id no entero o <= 0 (bordes 1-3).
 *  - `linked`: fila en employees / users / customers, viva O dada de baja
 *    (regla 1: haber sido excluye; ahí estaba el agujero).
 *  - `stale`: creada fuera de la ventana, o en el futuro (reglas 2, CA-5).
 *  - `releasable`: sin vínculo alguno y recién creada (regla 5).
 *
 * Las fechas forzadas usan ±2 días para no depender de zona horaria; los
 * bordes finos viven en person_release_constants.spec (predicado puro).
 */
test.group('resolvePersonRelease', (group) => {
  let businessUnitId: number
  const createdPersonIds: number[] = []
  const createdEmployeeIds: number[] = []
  const createdDepartmentIds: number[] = []
  const createdPositionIds: number[] = []
  const createdUserIds: number[] = []
  const createdCustomerIds: number[] = []

  const stamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

  group.setup(async () => {
    const bu = await BusinessUnit.query()
      .whereNull('business_unit_deleted_at')
      .where('business_unit_active', 1)
      .firstOrFail()
    businessUnitId = bu.businessUnitId
  })

  group.teardown(async () => {
    if (createdCustomerIds.length) {
      await db.from('customers').whereIn('customer_id', createdCustomerIds).delete()
    }
    if (createdUserIds.length) {
      await db.from('users').whereIn('user_id', createdUserIds).delete()
    }
    if (createdEmployeeIds.length) {
      await db.from('employees').whereIn('employee_id', createdEmployeeIds).delete()
    }
    if (createdPositionIds.length) {
      await db.from('positions').whereIn('position_id', createdPositionIds).delete()
    }
    if (createdDepartmentIds.length) {
      await db.from('departments').whereIn('department_id', createdDepartmentIds).delete()
    }
    if (createdPersonIds.length) {
      await db.from('people').whereIn('person_id', createdPersonIds).delete()
    }
  })

  async function createPerson(prefix: string): Promise<Person> {
    const person = await Person.create({
      personFirstname: 'Release',
      personLastname: 'Guard',
      personSecondLastname: prefix,
      personEmail: `person-release-${prefix}-${stamp()}@gsti-tests.local`,
    })
    createdPersonIds.push(person.personId)
    return person
  }

  async function setPersonCreatedAt(personId: number, createdAt: DateTime) {
    await db
      .from('people')
      .where('person_id', personId)
      .update({ person_created_at: createdAt.toUTC().toFormat('yyyy-MM-dd HH:mm:ss') })
  }

  async function createEmployeeFor(personId: number, prefix: string, opts?: { softDeleted?: boolean }) {
    const s = stamp()
    const now = new Date()
    const [departmentId] = await db.table('departments').insert({
      department_sync_id: s,
      department_code: `DEP-PRG-${s}`,
      department_name: `Dep ${prefix}`,
      company_id: businessUnitId,
      business_unit_id: businessUnitId,
      department_active: 1,
      department_created_at: now,
    })
    createdDepartmentIds.push(Number(departmentId))
    const [positionId] = await db.table('positions').insert({
      position_sync_id: s,
      position_code: `POS-PRG-${s}`,
      position_name: `Pos ${prefix}`,
      company_id: businessUnitId,
      business_unit_id: businessUnitId,
      position_active: 1,
      position_created_at: now,
    })
    createdPositionIds.push(Number(positionId))
    const [employeeId] = await db.table('employees').insert({
      employee_sync_id: `EMP-PRG-${s}`,
      employee_code: `EMP-PRG-${s}`,
      employee_first_name: 'Release',
      employee_last_name: 'Guard',
      employee_second_last_name: prefix,
      company_id: businessUnitId,
      business_unit_id: businessUnitId,
      department_id: Number(departmentId),
      position_id: Number(positionId),
      person_id: personId,
      employee_type_id: 1,
      employee_work_schedule: 'Onsite',
      employee_business_email: `emp-prg-${prefix}-${s}@gsti-tests.local`,
      employee_deleted_at: opts?.softDeleted ? now : null,
      employee_created_at: now,
    })
    createdEmployeeIds.push(Number(employeeId))
  }

  async function createUserFor(personId: number, prefix: string, opts?: { softDeleted?: boolean }) {
    const role = await ensureRole('root')
    const user = new User()
    user.userEmail = `user-prg-${prefix}-${stamp()}@gsti-tests.local`
    user.userPassword = 'ReleaseGuardTest123!'
    user.userActive = 1
    user.roleId = role.roleId
    user.personId = personId
    user.userEmailType = 'institutional'
    await user.save()
    createdUserIds.push(user.userId)
    if (opts?.softDeleted) {
      await user.delete()
    }
  }

  async function createCustomerFor(personId: number, opts?: { softDeleted?: boolean }) {
    const now = new Date()
    const [customerId] = await db.table('customers').insert({
      customer_uuid: `cust-prg-${stamp()}`,
      person_id: personId,
      customer_created_at: now,
      customer_deleted_at: opts?.softDeleted ? now : null,
    })
    createdCustomerIds.push(Number(customerId))
  }

  async function personDeletedAt(personId: number): Promise<unknown> {
    const row = await db
      .from('people')
      .where('person_id', personId)
      .select('person_deleted_at')
      .first()
    return row?.person_deleted_at ?? null
  }

  // --- not-found (bordes 1, 2, 3) ---

  test('un id no entero o no positivo se niega sin tocar la base', async ({ assert }) => {
    for (const bad of [0, -1, Number.NaN, 1.5]) {
      const decision = await resolvePersonRelease(bad)
      assert.isFalse(decision.releasable)
      if (!decision.releasable) assert.equal(decision.reason, 'not-found', String(bad))
    }
  })

  test('una persona inexistente cae en not-found', async ({ assert }) => {
    const decision = await resolvePersonRelease(2_147_483_000)
    assert.isFalse(decision.releasable)
    if (!decision.releasable) assert.equal(decision.reason, 'not-found')
  })

  test('una persona ya liberada cae en not-found (idempotencia del doble disparo)', async ({
    assert,
  }) => {
    const person = await createPerson('released')
    await person.delete()
    const decision = await resolvePersonRelease(person.personId)
    assert.isFalse(decision.releasable)
    if (!decision.releasable) assert.equal(decision.reason, 'not-found')
  })

  test('un id que llega como texto se normaliza y resuelve igual', async ({ assert }) => {
    const person = await createPerson('string-id')
    const decision = await resolvePersonRelease(String(person.personId) as unknown as number)
    assert.isTrue(decision.releasable)
  })

  // --- linked (regla 1, CA-2, CA-3) ---

  test('empleado vivo → linked', async ({ assert }) => {
    const person = await createPerson('emp-live')
    await createEmployeeFor(person.personId, 'emp-live')
    const decision = await resolvePersonRelease(person.personId)
    assert.isFalse(decision.releasable)
    if (!decision.releasable) assert.equal(decision.reason, 'linked')
  })

  test('ex-empleado (employee_deleted_at no nulo) → linked', async ({ assert }) => {
    const person = await createPerson('emp-gone')
    await createEmployeeFor(person.personId, 'emp-gone', { softDeleted: true })
    const decision = await resolvePersonRelease(person.personId)
    assert.isFalse(decision.releasable)
    if (!decision.releasable) assert.equal(decision.reason, 'linked')
  })

  test('usuario vivo → linked', async ({ assert }) => {
    const person = await createPerson('user-live')
    await createUserFor(person.personId, 'user-live')
    const decision = await resolvePersonRelease(person.personId)
    assert.isFalse(decision.releasable)
    if (!decision.releasable) assert.equal(decision.reason, 'linked')
  })

  test('ex-usuario (user_deleted_at no nulo) → linked', async ({ assert }) => {
    const person = await createPerson('user-gone')
    await createUserFor(person.personId, 'user-gone', { softDeleted: true })
    const decision = await resolvePersonRelease(person.personId)
    assert.isFalse(decision.releasable)
    if (!decision.releasable) assert.equal(decision.reason, 'linked')
  })

  test('cliente vivo → linked', async ({ assert }) => {
    const person = await createPerson('cust-live')
    await createCustomerFor(person.personId)
    const decision = await resolvePersonRelease(person.personId)
    assert.isFalse(decision.releasable)
    if (!decision.releasable) assert.equal(decision.reason, 'linked')
  })

  test('ex-cliente (customer_deleted_at no nulo) → linked', async ({ assert }) => {
    const person = await createPerson('cust-gone')
    await createCustomerFor(person.personId, { softDeleted: true })
    const decision = await resolvePersonRelease(person.personId)
    assert.isFalse(decision.releasable)
    if (!decision.releasable) assert.equal(decision.reason, 'linked')
  })

  // --- stale (regla 2, CA-4, CA-5) ---

  test('sin vínculo pero creada hace días → stale', async ({ assert }) => {
    const person = await createPerson('stale')
    await setPersonCreatedAt(person.personId, DateTime.now().minus({ days: 2 }))
    const decision = await resolvePersonRelease(person.personId)
    assert.isFalse(decision.releasable)
    if (!decision.releasable) assert.equal(decision.reason, 'stale')
  })

  test('sin vínculo pero con fecha en el futuro → stale', async ({ assert }) => {
    const person = await createPerson('future')
    await setPersonCreatedAt(person.personId, DateTime.now().plus({ days: 2 }))
    const decision = await resolvePersonRelease(person.personId)
    assert.isFalse(decision.releasable)
    if (!decision.releasable) assert.equal(decision.reason, 'stale')
  })

  // --- releasable (regla 5, CA-1) ---

  test('sin vínculo alguno y recién creada → releasable, con la fila para borrar', async ({
    assert,
  }) => {
    const person = await createPerson('fresh')
    const decision = await resolvePersonRelease(person.personId)
    assert.isTrue(decision.releasable)
    if (decision.releasable) {
      assert.equal(decision.person.personId, person.personId)
      // El predicado decide, no borra: la persona sigue intacta.
      assert.isNull(await personDeletedAt(person.personId))
    }
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
node ace test unit --files="person_release_guard"
```

Expected: FAIL — `Cannot find module '#helpers/person_release_guard'`.

- [ ] **Step 3: Crear el helper**

Crear `app/helpers/person_release_guard.ts`:

```ts
import Person from '#models/person'
import { isWithinPersonReleaseWindow } from '#constants/person_release.constants'

/**
 * Contexto del acto que dispara la liberación.
 *
 * `releasePersonIfOrphan` es un método de servicio sin `HttpContext`: el actor
 * y su scope no se pueden leer ahí dentro, se pasan. De paso el compilador
 * obliga a tocar los seis puntos de invocación, así que no queda ninguno sin
 * blindar por olvido.
 *
 * Los nombres calzan uno a uno con `ScopeDeniedLogEntry`
 * (`app/services/scope_denied_log_service.ts`).
 */
export interface PersonReleaseContext {
  /** Usuario autenticado que disparó el alta. `null` si la sesión no resolvió. */
  actorUserId: number | null
  /** Unidades de negocio del actor al momento de la petición. */
  businessUnitScope: number[]
}

/** Motivo de la negativa. Solo ids y etiquetas: nunca viaja dato personal. */
export type PersonReleaseDenialReason =
  /** No existe, o ya fue liberada (soft delete) por la compensación previa. */
  | 'not-found'
  /** Tiene o tuvo vínculo como empleado, usuario o cliente — vivo o dado de baja. */
  | 'linked'
  /** Se creó fuera de la ventana de frescura: no pudo nacer de este acto. */
  | 'stale'

export type PersonReleaseDecision =
  | { releasable: true; person: Person }
  | { releasable: false; reason: PersonReleaseDenialReason }

/**
 * Decide si una persona puede liberarse por la compensación del alta fallida
 * (USRH1789698261608). Fuente ÚNICA: la consume `EmployeeService.releasePersonIfOrphan`
 * para los seis puntos del alta y para el catch de `syncCreate`.
 *
 * El criterio NO es "creada en esta misma petición": la persona nace en otra
 * petición HTTP que no registra actor ni acto, así que esa prueba no existe hoy.
 * `people` tampoco tiene marca de empresa: esto no es aislamiento por cuenta.
 */
export async function resolvePersonRelease(personId: number): Promise<PersonReleaseDecision> {
  // El `personId` llega del payload sin castear (`employee_controller.store`):
  // se normaliza aquí para que un "123" no se caiga por el tipo y rompa el
  // reintento legítimo en silencio.
  const id = Number(personId)
  if (!Number.isInteger(id) || id <= 0) {
    return { releasable: false, reason: 'not-found' }
  }

  // Sin `withTrashed()`: el mixin SoftDeletes filtra `person_deleted_at`, así
  // que una persona ya liberada cae en `not-found` y la compensación conserva
  // su idempotencia.
  const person = await Person.query().where('person_id', id).first()
  if (!person) {
    return { releasable: false, reason: 'not-found' }
  }

  // Vínculo ALGUNA VEZ: sin `whereNull('*_deleted_at')` en ninguna de las tres.
  // Ahí estaba el agujero: la baja del colaborador hace soft delete sobre
  // `employees`, no sobre `people`.
  const unlinked = await Person.query()
    .where('person_id', id)
    .whereNotExists((query) => {
      query.from('employees').whereRaw('employees.person_id = people.person_id')
    })
    .whereNotExists((query) => {
      query.from('users').whereRaw('users.person_id = people.person_id')
    })
    .whereNotExists((query) => {
      query.from('customers').whereRaw('customers.person_id = people.person_id')
    })
    .first()

  if (!unlinked) {
    return { releasable: false, reason: 'linked' }
  }

  if (!isWithinPersonReleaseWindow(person.personCreatedAt)) {
    return { releasable: false, reason: 'stale' }
  }

  return { releasable: true, person: unlinked }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
node ace test unit --files="person_release_guard"
```

Expected: PASS, 13 casos. Si **"sin vínculo alguno y recién creada → releasable"** falla con `stale`, Lucid no está entregando `personCreatedAt` como `DateTime` válido en UTC (§14 del spec, punto a verificar): imprimir `person.personCreatedAt.toISO()` y `DateTime.now().toISO()` en el caso, comparar y escalar antes de seguir — significa que el reintento legítimo se rompería en ese entorno.

- [ ] **Step 5: Typecheck y lint**

```bash
npm run typecheck && npx eslint app/helpers/person_release_guard.ts tests/unit/helpers/person_release_guard.spec.ts
```

Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add app/helpers/person_release_guard.ts tests/unit/helpers/person_release_guard.spec.ts
git commit -m "fix(USRH1789698261608): predicado único de liberabilidad — vínculo alguna vez y ventana de frescura

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `releasePersonIfOrphan` reescrito y el camino del alta (`store` + `create`)

**Files:**
- Modify: `app/services/employee_service.ts` — imports (`:60-80`), `create()` firma (`:702`), catch de `create` (`:803`), `releasePersonIfOrphan` (`:2600-2631`)
- Modify: `app/controllers/employee_controller.ts` — import, `store` (`:1138`, `:1145`, `:1179`, `:1196`, `:1211`, `:1254`, `:1272`)
- Test: `tests/unit/services/employee_store_transactional.spec.ts`

**Interfaces:**
- Consumes: `resolvePersonRelease`, `PersonReleaseContext` (Tarea 2); `ScopeDeniedLogService.log(entry)` (`app/services/scope_denied_log_service.ts:29`); `logger` ya importado en el servicio (`:74`).
- Produces (los usa la Tarea 4):
  - `EmployeeService.releasePersonIfOrphan(personId: number, context: PersonReleaseContext): Promise<boolean>`
  - `EmployeeService.create(employee: Employee, usersResponsible: User[], releaseContext: PersonReleaseContext, SNDeviceList: string = '')`

- [ ] **Step 1: Ajustar el spec existente a la firma nueva y agregar los casos que fallan**

Editar `tests/unit/services/employee_store_transactional.spec.ts`.

**1a.** Imports: agregar tras `import { ensureRole } from '#tests/helpers/ensure_role'`:

```ts
import { LogStore } from '#models/MongoDB/log_store'
import type { PersonReleaseContext } from '#helpers/person_release_guard'
import { DateTime } from 'luxon'
```

**1b.** Tras `const STAMP = ...` agregar:

```ts
/** Contexto de traza fijo: el actor no decide nada (borde 9 del Anexo B). */
const RELEASE_CONTEXT: PersonReleaseContext = { actorUserId: 7, businessUnitScope: [1] }

type CapturedLog = { collection: string; payload: Record<string, unknown> }

/**
 * Captura lo que iría a Mongo sin tocar Mongo. Mismo molde que
 * scope_denied_log_service.spec: se reemplaza `LogStore.set` y se restaura
 * en el cleanup del caso.
 */
function captureScopeDeniedLog(cleanup: (fn: () => void) => void): CapturedLog[] {
  const original = LogStore.set
  const captured: CapturedLog[] = []
  LogStore.set = async (collectionName: string, logData: Record<string, unknown>) => {
    captured.push({ collection: collectionName, payload: logData })
  }
  cleanup(() => {
    LogStore.set = original
  })
  return captured
}

async function personDeletedAt(personId: number): Promise<unknown> {
  const row = await db
    .from('people')
    .where('person_id', personId)
    .select('person_deleted_at')
    .first()
  return row?.person_deleted_at ?? null
}
```

**1c.** Las tres llamadas existentes cambian de firma:

- `await assert.rejects(() => service.create(payload, []))` → `await assert.rejects(() => service.create(payload, [], RELEASE_CONTEXT))`
- `const released = await service.releasePersonIfOrphan(person.personId)` → `const released = await service.releasePersonIfOrphan(person.personId, RELEASE_CONTEXT)`
- `const created = await service.create(payload, [responsibleUser])` → `const created = await service.create(payload, [responsibleUser], RELEASE_CONTEXT)`

**1d.** Agregar al final del archivo un grupo nuevo:

```ts
test.group('EmployeeService.releasePersonIfOrphan — blindaje (USRH1789698261608)', () => {
  test('reintento legítimo: persona recién creada y sin vínculo se libera y se registra la concesión', async ({
    assert,
    cleanup,
  }) => {
    const captured = captureScopeDeniedLog(cleanup)
    const person = await createTestPerson('grant')
    cleanup(() => hardDeletePerson(person.personId))

    const released = await getService().releasePersonIfOrphan(person.personId, RELEASE_CONTEXT)

    assert.isTrue(released)
    assert.isNotNull(await personDeletedAt(person.personId))
    assert.lengthOf(captured, 1)
    assert.equal(captured[0].collection, 'log_scope_denied')
    assert.equal(captured[0].payload.domain, 'person')
    assert.equal(captured[0].payload.action, 'release-orphan-granted')
    assert.equal(captured[0].payload.requested_id, person.personId)
    assert.equal(captured[0].payload.actor_user_id, RELEASE_CONTEXT.actorUserId)
    assert.deepEqual(captured[0].payload.business_unit_scope, RELEASE_CONTEXT.businessUnitScope)
    // CA-12: ni datos personales ni el motivo desagregado.
    assert.notProperty(captured[0].payload, 'reason')
    assert.notProperty(captured[0].payload, 'person_email')
    assert.notProperty(captured[0].payload, 'person_created_at')
  })

  test('ex-empleado (employee_deleted_at no nulo): no se libera y se registra el rechazo', async ({
    assert,
    cleanup,
  }) => {
    const captured = captureScopeDeniedLog(cleanup)
    const person = await createTestPerson('ex-emp')
    const template = await getTemplateEmployee()
    const [employeeId] = await db.table('employees').insert({
      employee_sync_id: `EXEMP-${STAMP}`,
      employee_code: `EXEMP-${STAMP}`,
      employee_first_name: 'AltaTrx',
      employee_last_name: 'Test',
      employee_second_last_name: 'ex-emp',
      company_id: template.companyId,
      business_unit_id: template.businessUnitId,
      department_id: template.departmentId,
      position_id: template.positionId,
      person_id: person.personId,
      employee_type_id: template.employeeTypeId,
      employee_work_schedule: 'Onsite',
      employee_business_email: `exemp-${STAMP}@gsti-tests.local`,
      employee_created_at: new Date(),
      employee_deleted_at: new Date(),
    })
    cleanup(async () => {
      await db.from('employees').where('employee_id', Number(employeeId)).delete()
      await hardDeletePerson(person.personId)
    })

    const released = await getService().releasePersonIfOrphan(person.personId, RELEASE_CONTEXT)

    assert.isFalse(released)
    assert.isNull(await personDeletedAt(person.personId))
    assert.lengthOf(captured, 1)
    assert.equal(captured[0].payload.domain, 'person')
    assert.equal(captured[0].payload.action, 'release-orphan')
    assert.equal(captured[0].payload.requested_id, person.personId)
    assert.notProperty(captured[0].payload, 'reason')
  })

  test('ex-usuario (user_deleted_at no nulo): no se libera', async ({ assert, cleanup }) => {
    const captured = captureScopeDeniedLog(cleanup)
    const person = await createTestPerson('ex-user')
    const user = new User()
    user.userEmail = `alta-trx-ex-user-${STAMP}@gsti-tests.local`
    user.userPassword = 'AltaTrxTest123!'
    user.userActive = 1
    const role = await ensureRole('root')
    user.roleId = role.roleId
    user.personId = person.personId
    user.userEmailType = 'institutional'
    await user.save()
    await user.delete()
    cleanup(async () => {
      await db.from('users').where('user_id', user.userId).delete()
      await hardDeletePerson(person.personId)
    })

    const released = await getService().releasePersonIfOrphan(person.personId, RELEASE_CONTEXT)

    assert.isFalse(released)
    assert.isNull(await personDeletedAt(person.personId))
    assert.lengthOf(captured, 1)
    assert.equal(captured[0].payload.action, 'release-orphan')
  })

  test('ex-cliente (customer_deleted_at no nulo): no se libera', async ({ assert, cleanup }) => {
    const captured = captureScopeDeniedLog(cleanup)
    const person = await createTestPerson('ex-cust')
    const now = new Date()
    const [customerId] = await db.table('customers').insert({
      customer_uuid: `cust-trx-${STAMP}`,
      person_id: person.personId,
      customer_created_at: now,
      customer_deleted_at: now,
    })
    cleanup(async () => {
      await db.from('customers').where('customer_id', Number(customerId)).delete()
      await hardDeletePerson(person.personId)
    })

    const released = await getService().releasePersonIfOrphan(person.personId, RELEASE_CONTEXT)

    assert.isFalse(released)
    assert.isNull(await personDeletedAt(person.personId))
    assert.lengthOf(captured, 1)
    assert.equal(captured[0].payload.action, 'release-orphan')
  })

  test('sin vínculo pero fuera de ventana: no se libera y se registra el rechazo', async ({
    assert,
    cleanup,
  }) => {
    const captured = captureScopeDeniedLog(cleanup)
    const person = await createTestPerson('stale')
    cleanup(() => hardDeletePerson(person.personId))
    await db
      .from('people')
      .where('person_id', person.personId)
      .update({
        person_created_at: DateTime.now().minus({ days: 2 }).toUTC().toFormat('yyyy-MM-dd HH:mm:ss'),
      })

    const released = await getService().releasePersonIfOrphan(person.personId, RELEASE_CONTEXT)

    assert.isFalse(released)
    assert.isNull(await personDeletedAt(person.personId))
    assert.lengthOf(captured, 1)
    assert.equal(captured[0].payload.action, 'release-orphan')
  })

  test('idempotencia: el segundo disparo sobre la persona ya liberada no borra ni registra', async ({
    assert,
    cleanup,
  }) => {
    const captured = captureScopeDeniedLog(cleanup)
    const person = await createTestPerson('twice')
    cleanup(() => hardDeletePerson(person.personId))
    const service = getService()

    const first = await service.releasePersonIfOrphan(person.personId, RELEASE_CONTEXT)
    const second = await service.releasePersonIfOrphan(person.personId, RELEASE_CONTEXT)

    assert.isTrue(first)
    assert.isFalse(second)
    // CA-7: una sola concesión y ningún registro del not-found.
    assert.lengthOf(captured, 1)
    assert.equal(captured[0].payload.action, 'release-orphan-granted')
  })

  test('el registro es best-effort: si Mongo falla la decisión ocurre igual (CA-11)', async ({
    assert,
    cleanup,
  }) => {
    const original = LogStore.set
    LogStore.set = async () => {
      throw new Error('Mongo no disponible')
    }
    cleanup(() => {
      LogStore.set = original
    })
    const person = await createTestPerson('mongo-down')
    cleanup(() => hardDeletePerson(person.personId))

    const released = await getService().releasePersonIfOrphan(person.personId, RELEASE_CONTEXT)

    assert.isTrue(released)
    assert.isNotNull(await personDeletedAt(person.personId))
  })
})
```

- [ ] **Step 2: Correr el spec y verificar que falla por compilación**

```bash
node ace test unit --files="employee_store_transactional"
```

Expected: FAIL — error de TypeScript: `Expected 1 arguments, but got 2` en `releasePersonIfOrphan` y `create`.

- [ ] **Step 3: Reescribir `releasePersonIfOrphan` en el servicio**

En `app/services/employee_service.ts`, agregar imports junto a los demás `#helpers` / `#services` (p. ej. tras `import { isSensitiveDataWriteError } from '#helpers/sensitive_data_write_api_error'`):

```ts
import ScopeDeniedLogService from '#services/scope_denied_log_service'
import { resolvePersonRelease, type PersonReleaseContext } from '#helpers/person_release_guard'
```

Reemplazar **completo** el método `releasePersonIfOrphan` (JSDoc incluido, `:2593-2631`) por:

```ts
  /**
   * Libera (soft delete) a la persona del alta de empleado fallida para que el
   * capturista pueda reintentar sin chocar con "el correo ya está registrado"
   * (USRH1785436961832), ahora blindada (USRH1789698261608).
   *
   * Solo procede si la persona no tiene NI HA TENIDO vínculo alguno —empleado,
   * usuario o cliente, vivo o dado de baja— y nació dentro de la ventana de
   * frescura. Cualquier otro caso se niega en silencio y queda trazado. No
   * comprueba de qué empresa es la persona: `people` no tiene esa marca.
   *
   * @param personId Persona candidata; llega del payload del alta o del API de biométricos.
   * @param context Actor y scope del acto, para la traza de la decisión. No decide nada.
   * @returns `true` solo si la persona quedó liberada. Nunca lanza.
   */
  async releasePersonIfOrphan(
    personId: number,
    context: PersonReleaseContext
  ): Promise<boolean> {
    try {
      const decision = await resolvePersonRelease(personId)

      if (!decision.releasable) {
        // `not-found` es el camino normal de la segunda compensación del mismo
        // acto (la primera ya liberó): registrarlo llenaría la auditoría de
        // falsos positivos en cada alta fallida legítima.
        if (decision.reason !== 'not-found') {
          logger.warn(
            { personId, reason: decision.reason, actorUserId: context.actorUserId },
            'EmployeeService.releasePersonIfOrphan: liberación denegada'
          )
          // Best-effort y posterior a la decisión: si Mongo está caído no
          // guarda y no avisa, y el rechazo se sostiene igual.
          await ScopeDeniedLogService.log({
            domain: 'person',
            action: 'release-orphan',
            requestedId: personId,
            actorUserId: context.actorUserId,
            businessUnitScope: context.businessUnitScope,
          })
        }
        return false
      }

      await decision.person.delete()

      // La CONCESIÓN también se registra. Sin esto, un barrido exitoso de
      // expedientes en vuelo sería invisible — justo el escenario que interesa
      // poder reconstruir después. Mismo carácter best-effort.
      await ScopeDeniedLogService.log({
        domain: 'person',
        action: 'release-orphan-granted',
        requestedId: personId,
        actorUserId: context.actorUserId,
        businessUnitScope: context.businessUnitScope,
      })

      return true
    } catch (error) {
      logger.error(
        { err: error, personId },
        'EmployeeService.releasePersonIfOrphan: fallo al liberar la persona del alta fallida'
      )
      return false
    }
  }
```

- [ ] **Step 4: `create()` recibe el contexto y lo pasa en su catch**

En `app/services/employee_service.ts`, la firma de `create` (`:702`):

```ts
  async create(employee: Employee, usersResponsible: User[], SNDeviceList: string = '') {
```

pasa a:

```ts
  async create(
    employee: Employee,
    usersResponsible: User[],
    releaseContext: PersonReleaseContext,
    SNDeviceList: string = ''
  ) {
```

Y el catch de `create` (`:801-805`):

```ts
    } catch (error) {
      if (personIdCandidate) {
        await this.releasePersonIfOrphan(personIdCandidate)
      }
      throw error
    }
```

pasa a:

```ts
    } catch (error) {
      if (personIdCandidate) {
        await this.releasePersonIfOrphan(personIdCandidate, releaseContext)
      }
      throw error
    }
```

- [ ] **Step 5: Los cinco puntos de `store` y el tercer argumento de `create`**

En `app/controllers/employee_controller.ts`, agregar el import junto a los demás `#helpers`:

```ts
import type { PersonReleaseContext } from '#helpers/person_release_guard'
```

En `store`, justo después de `const employeeService = new EmployeeService(i18n)` (`:1138`):

```ts
      const employeeService = new EmployeeService(i18n)
      // USRH1789698261608: actor y scope del acto, solo para la traza de la
      // liberación. `personId` llega crudo del payload: se castea aquí y el
      // helper vuelve a normalizar (doble cinturón).
      const releaseContext: PersonReleaseContext = {
        actorUserId: auth.user?.userId ?? null,
        businessUnitScope,
      }
```

Los **cuatro** puntos que pasan el valor crudo (`:1145`, `:1179`, `:1196`, `:1211`) — cada uno es exactamente:

```ts
        if (personId) {
          await employeeService.releasePersonIfOrphan(personId)
        }
```

y cada uno pasa a:

```ts
        if (personId) {
          await employeeService.releasePersonIfOrphan(Number(personId), releaseContext)
        }
```

La llamada a `create` (`:1254`):

```ts
      const newEmployee = await employeeService.create(employee, usersResponsible)
```

pasa a:

```ts
      const newEmployee = await employeeService.create(employee, usersResponsible, releaseContext)
```

El catch global (`:1269-1273`) — aquí `releaseContext` no está en scope (se declaró dentro del `try`), así que se arma de nuevo con los mismos valores:

```ts
      const failedPersonId = Number(request.input('personId')) || 0
      if (failedPersonId > 0) {
        const employeeService = new EmployeeService(i18n)
        await employeeService.releasePersonIfOrphan(failedPersonId, {
          actorUserId: auth.user?.userId ?? null,
          businessUnitScope,
        })
      }
```

**Ninguna** de las cinco respuestas cambia: no se toca status, `type`, `title`, `message`, `detail`, `key` ni `data`.

- [ ] **Step 6: Correr el spec y verificar que pasa**

```bash
node ace test unit --files="employee_store_transactional"
```

Expected: PASS, 10 casos (3 previos + 7 nuevos). El typecheck aún **fallará** en `syncCreate` no — `syncCreate` sigue usando `deletePersonById` (un argumento, sin cambio) y `verify` no cambia: el repo compila. Comprobar:

```bash
npm run typecheck
```

Expected: sin errores.

- [ ] **Step 7: Verificar que no queda llamada de un solo argumento en el camino del alta**

```bash
git grep -n 'releasePersonIfOrphan(' -- app
```

Expected: 7 líneas — la definición en el servicio, `:803` con `releaseContext`, y cinco en el controller todas con segundo argumento. Ninguna con un solo argumento.

- [ ] **Step 8: Lint**

```bash
npx eslint app/services/employee_service.ts app/controllers/employee_controller.ts tests/unit/services/employee_store_transactional.spec.ts
```

Expected: sin errores nuevos (el repo puede traer warnings previos en esos archivos de 9 000 líneas; ninguno debe ser de las zonas tocadas).

- [ ] **Step 9: Commit**

```bash
git add app/services/employee_service.ts app/controllers/employee_controller.ts tests/unit/services/employee_store_transactional.spec.ts
git commit -m "fix(USRH1789698261608): la liberación del alta fallida pasa por el predicado y traza ambos desenlaces

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Gate antes de la Tarea 4 — confirmación de Noé (spec §16, R4 · CA-9)

- [x] **Confirmado por Noé el 2026-09-18 ("sí, se conserva"):** **conservar** la persona preexistente cuando falla `syncCreate` no rompe la sincronización con el equipo biométrico. Hoy el catch la borra (`deletePersonById`); tras D2 se conserva porque cae fuera de ventana. Solo la persona **creada en ese mismo acto** por `PersonService.syncCreate` se libera.

Si la respuesta es que sí rompe, **no se ejecuta la Tarea 4** tal cual: se rediseña esa rama (+0.5 a 1 h) y se actualiza este plan y el spec. Las Tareas 1-3 se conservan.

---

### Task 4: D2 — la sincronización biométrica pasa por el mismo predicado

**Files:**
- Modify: `app/services/employee_service.ts` — `syncCreate` (`:208-293`), `deletePersonById` JSDoc (`:2633-2637`)
- Modify: `app/controllers/employee_controller.ts` — `verify` (`:4578-4586`), `synchronization` (`:474`), `synchronizationBySelection` (`:6954`)
- Test: `tests/unit/services/employee_sync_create_release.spec.ts` (nuevo)
- Test: `tests/unit/services/employee_release_person_surface.spec.ts` (nuevo)

**Interfaces:**
- Consumes: `releasePersonIfOrphan(personId, context)` y `PersonReleaseContext` (Tareas 2-3); `allowedIds: number[]` ya calculado en ambos métodos de sincronización.
- Produces:
  - `EmployeeService.syncCreate(employee: BiometricEmployeeInterface, releaseContext: PersonReleaseContext)`
  - `EmployeeController.verify(employee, employeeService, releaseContext: PersonReleaseContext)` (privado)

- [ ] **Step 1: Escribir el spec de `syncCreate` que falla**

Crear `tests/unit/services/employee_sync_create_release.spec.ts`:

```ts
import { test } from '@japa/runner'
import i18nManager from '@adonisjs/i18n/services/main'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Employee from '#models/employee'
import Person from '#models/person'
import EmployeeService from '#services/employee_service'
import { LogStore } from '#models/MongoDB/log_store'
import type BiometricEmployeeInterface from '../../../app/interfaces/biometric_employee_interface.js'
import type { PersonReleaseContext } from '#helpers/person_release_guard'

/**
 * USRH1789698261608 — D2 / CA-9: el catch de `syncCreate` ya no borra a
 * ciegas con `deletePersonById`; pasa por `releasePersonIfOrphan`.
 *
 *  - La persona PREEXISTENTE que llegó del API de biométricos (`personId`)
 *    se conserva: cae fuera de ventana. Cambio de comportamiento deliberado,
 *    confirmado con Noé antes de esta tarea.
 *  - La persona CREADA en el mismo acto (sin `personId`) sí se libera.
 *
 * El fallo se fuerza con un `departmentId` inexistente: la FK truena al
 * guardar el empleado, después de resolver la persona.
 */

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
const RELEASE_CONTEXT: PersonReleaseContext = { actorUserId: 11, businessUnitScope: [1] }

function getService(): EmployeeService {
  return new EmployeeService(i18nManager.locale(i18nManager.defaultLocale))
}

async function getTemplateEmployee(): Promise<Employee> {
  const template = await Employee.query().whereNull('employee_deleted_at').first()
  if (!template) {
    throw new Error('La BD de pruebas no tiene empleados para usar de plantilla')
  }
  return template
}

function buildBiometricPayload(
  template: Employee,
  suffix: string,
  personId?: number
): BiometricEmployeeInterface {
  return {
    id: 0,
    empCode: 0,
    firstName: `SyncRel-${suffix}-${STAMP}`,
    lastName: 'Test',
    secondLastName: suffix,
    payrollNum: `PN-SYNC-${suffix}-${STAMP}`,
    hireDate: DateTime.fromISO('2024-01-15'),
    companyId: template.companyId,
    departmentId: 99999999,
    positionId: Number(template.positionId),
    gender: 'M',
    photo: '',
    usersResponsible: [],
    businessUnitId: template.businessUnitId,
    personId,
  }
}

async function personDeletedAt(personId: number): Promise<unknown> {
  const row = await db
    .from('people')
    .where('person_id', personId)
    .select('person_deleted_at')
    .first()
  return row?.person_deleted_at ?? null
}

test.group('EmployeeService.syncCreate — compensación blindada (USRH1789698261608 D2)', (group) => {
  let originalSet: typeof LogStore.set

  group.each.setup(() => {
    originalSet = LogStore.set
    LogStore.set = async () => {}
  })

  group.each.teardown(() => {
    LogStore.set = originalSet
  })

  test('la persona preexistente del biométrico se conserva cuando el alta falla', async ({
    assert,
    cleanup,
  }) => {
    const person = await Person.create({
      personFirstname: 'SyncRel',
      personLastname: 'Preexistente',
      personSecondLastname: STAMP,
      personEmail: `sync-pre-${STAMP}@gsti-tests.local`,
    })
    cleanup(() => db.from('people').where('person_id', person.personId).delete())
    await db
      .from('people')
      .where('person_id', person.personId)
      .update({
        person_created_at: DateTime.now().minus({ days: 2 }).toUTC().toFormat('yyyy-MM-dd HH:mm:ss'),
      })

    const template = await getTemplateEmployee()
    const payload = buildBiometricPayload(template, 'pre', person.personId)

    await assert.rejects(() => getService().syncCreate(payload, RELEASE_CONTEXT))

    assert.isNull(await personDeletedAt(person.personId))
    const rows = await db.from('employees').where('person_id', person.personId).count('* as total')
    assert.equal(Number(rows[0].total), 0)
  })

  test('la persona creada en el mismo acto se libera cuando el alta falla', async ({
    assert,
    cleanup,
  }) => {
    const template = await getTemplateEmployee()
    const payload = buildBiometricPayload(template, 'nueva')
    cleanup(() => db.from('people').where('person_firstname', payload.firstName).delete())

    await assert.rejects(() => getService().syncCreate(payload, RELEASE_CONTEXT))

    const created = await Person.query()
      .withTrashed()
      .where('person_firstname', payload.firstName)
      .firstOrFail()
    assert.isNotNull(await personDeletedAt(created.personId))
  })
})
```

- [ ] **Step 2: Escribir el spec de contenido que falla**

Crear `tests/unit/services/employee_release_person_surface.spec.ts`:

```ts
import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * USRH1789698261608 — CA-8: ningún camino conserva un borrado sin predicado.
 *
 * Spec de contenido (convención del repo, p. ej.
 * employees_expediente_read_shared_surface.spec): se lee el fuente y se
 * afirma sobre su forma, para que un llamador nuevo de un solo argumento o
 * un uso de `deletePersonById` rompa la suite aunque compile.
 */

async function source(path: string): Promise<string> {
  return readFile(join(process.cwd(), path), 'utf8')
}

/** Llamadas `releasePersonIfOrphan(<un solo argumento>)`. */
const SINGLE_ARG_RELEASE = /releasePersonIfOrphan\(\s*[^,()]+\s*\)/g

test.group('Liberación de la persona — superficie (USRH1789698261608)', () => {
  test('ninguna llamada a releasePersonIfOrphan va sin contexto', async ({ assert }) => {
    for (const file of [
      'app/controllers/employee_controller.ts',
      'app/services/employee_service.ts',
    ]) {
      const content = await source(file)
      assert.deepEqual(content.match(SINGLE_ARG_RELEASE) ?? [], [], file)
    }
  })

  test('deletePersonById queda @deprecated y sin llamadores', async ({ assert }) => {
    const service = await source('app/services/employee_service.ts')
    const controller = await source('app/controllers/employee_controller.ts')
    assert.notInclude(service, 'this.deletePersonById(')
    assert.notInclude(controller, 'deletePersonById(')
    const definition = service.indexOf('async deletePersonById(')
    assert.isAbove(definition, 0)
    const jsdocBefore = service.slice(Math.max(0, definition - 600), definition)
    assert.include(jsdocBefore, '@deprecated')
  })

  test('el catch de syncCreate pasa por releasePersonIfOrphan con contexto', async ({ assert }) => {
    const service = await source('app/services/employee_service.ts')
    const start = service.indexOf('async syncCreate(')
    const end = service.indexOf('async ', start + 1)
    const syncCreate = service.slice(start, end)
    assert.include(syncCreate, 'releaseContext: PersonReleaseContext')
    assert.include(syncCreate, 'this.releasePersonIfOrphan(personIdToDelete, releaseContext)')
    assert.notInclude(syncCreate, 'console.')
  })

  test('releasePersonIfOrphan no usa console ni cleanupOrphanPersons cobra llamadores', async ({
    assert,
  }) => {
    const service = await source('app/services/employee_service.ts')
    const start = service.indexOf('async releasePersonIfOrphan(')
    const end = service.indexOf('async deletePersonById(')
    assert.notInclude(service.slice(start, end), 'console.')
    assert.notInclude(service, 'this.cleanupOrphanPersons(')
  })

  test('el camino de sincronización arma el contexto con allowedIds', async ({ assert }) => {
    const controller = await source('app/controllers/employee_controller.ts')
    assert.include(controller, 'private async verify(')
    const verify = controller.slice(controller.indexOf('private async verify('))
    assert.include(verify.slice(0, 600), 'releaseContext: PersonReleaseContext')
    assert.include(verify.slice(0, 600), 'syncCreate(employee, releaseContext)')
    assert.equal((controller.match(/businessUnitScope: allowedIds/g) ?? []).length, 2)
  })
})
```

- [ ] **Step 3: Correr ambos specs y verificar que fallan**

```bash
node ace test unit --files="employee_sync_create_release" --files="employee_release_person_surface"
```

Expected: FAIL — `employee_sync_create_release` por compilación (`Expected 1 arguments, but got 2` en `syncCreate`); `employee_release_person_surface` en los casos de `deletePersonById`, `syncCreate` y `verify`.

- [ ] **Step 4: `syncCreate` recibe el contexto y su catch pasa por el predicado**

En `app/services/employee_service.ts`, la cabecera de `syncCreate` (`:208-210`):

```ts
  async syncCreate(employee: BiometricEmployeeInterface) {
    // Guardar el personId que viene del frontend
    let personIdToDelete = employee.personId || null
```

pasa a:

```ts
  async syncCreate(employee: BiometricEmployeeInterface, releaseContext: PersonReleaseContext) {
    // Persona candidata a liberar si el alta falla. Si viene del API de
    // biométricos es preexistente y el predicado la conserva (fuera de
    // ventana); solo la creada en este mismo acto se libera (USRH1789698261608).
    let personIdToDelete = employee.personId || null
```

El comentario `:231`:

```ts
      // Usar el personId que viene del frontend
      if (employee.personId) {
```

pasa a:

```ts
      // Persona preexistente que llegó del API de biométricos
      if (employee.personId) {
```

El catch (`:283-293`):

```ts
    } catch (error) {
      // Si hay error y tenemos un personId, eliminarlo
      if (personIdToDelete) {
        try {
          await this.deletePersonById(personIdToDelete)
        } catch (deleteError) {
          console.error('Error eliminando persona huérfana:', deleteError)
        }
      }
      throw error
    }
```

pasa a:

```ts
    } catch (error) {
      // USRH1789698261608 (D2): misma compensación que el alta desde el BO.
      // `releasePersonIfOrphan` nunca lanza, así que no hace falta anidar.
      if (personIdToDelete) {
        await this.releasePersonIfOrphan(personIdToDelete, releaseContext)
      }
      throw error
    }
```

- [ ] **Step 5: `deletePersonById` queda `@deprecated`, sin borrarse**

El JSDoc de `deletePersonById` (`:2633-2637`):

```ts
  /**
   * Eliminar una persona por su ID
   * @param personId - ID de la persona a eliminar
   * @returns Promise<boolean> - true si se eliminó correctamente
   */
```

pasa a:

```ts
  /**
   * Eliminar una persona por su ID.
   *
   * @deprecated Sin llamadores desde USRH1789698261608: borraba sin comprobar
   * vínculo ni antigüedad. Toda compensación del alta fallida pasa por
   * `releasePersonIfOrphan`. Se retira junto con el alta transaccional.
   * @param personId - ID de la persona a eliminar
   * @returns Promise<boolean> - true si se eliminó correctamente
   */
```

No se toca `cleanupOrphanPersons` (D3: código muerto, deuda registrada en el spec).

- [ ] **Step 6: `verify` recibe y propaga; los dos métodos de sincronización arman el contexto**

En `app/controllers/employee_controller.ts`, `verify` (`:4578-4586`):

```ts
  private async verify(employee: BiometricEmployeeInterface, employeeService: EmployeeService) {
    const existEmployee = await Employee.query()
      .where('employee_code', employee.empCode)
      .withTrashed()
      .first()
    if (!existEmployee) {
      await employeeService.syncCreate(employee)
    }
  }
```

pasa a:

```ts
  private async verify(
    employee: BiometricEmployeeInterface,
    employeeService: EmployeeService,
    releaseContext: PersonReleaseContext
  ) {
    const existEmployee = await Employee.query()
      .where('employee_code', employee.empCode)
      .withTrashed()
      .first()
    if (!existEmployee) {
      await employeeService.syncCreate(employee, releaseContext)
    }
  }
```

En `synchronization`, justo después de `const allowedIds = await new BusinessAccessScopeService().getAccessibleIds(auth.user!)` (`:375`):

```ts
      const allowedIds = await new BusinessAccessScopeService().getAccessibleIds(auth.user!)
      // USRH1789698261608: traza de la compensación del alta por sincronización.
      const releaseContext: PersonReleaseContext = {
        actorUserId: auth.user?.userId ?? null,
        businessUnitScope: allowedIds,
      }
```

y la llamada `:474`:

```ts
            await this.verify(employee, employeeService)
```

pasa a:

```ts
            await this.verify(employee, employeeService, releaseContext)
```

En `synchronizationBySelection`, tras `const allowedIds = ...` (`:6878`), el mismo bloque:

```ts
      const allowedIds = await new BusinessAccessScopeService().getAccessibleIds(auth.user!)
      // USRH1789698261608: traza de la compensación del alta por sincronización.
      const releaseContext: PersonReleaseContext = {
        actorUserId: auth.user?.userId ?? null,
        businessUnitScope: allowedIds,
      }
```

y la llamada `:6954` pasa a `await this.verify(employee, employeeService, releaseContext)`.

Las respuestas de ambos endpoints (`201`, `Employee synchronization`) no cambian.

- [ ] **Step 7: Correr ambos specs y verificar que pasan**

```bash
node ace test unit --files="employee_sync_create_release" --files="employee_release_person_surface"
```

Expected: PASS, 2 + 5 casos.

- [ ] **Step 8: Typecheck, lint y grep de cierre**

```bash
npm run typecheck && npx eslint app/services/employee_service.ts app/controllers/employee_controller.ts tests/unit/services/employee_sync_create_release.spec.ts tests/unit/services/employee_release_person_surface.spec.ts
```

Expected: sin errores.

```bash
git grep -n 'deletePersonById\|releasePersonIfOrphan(' -- app
```

Expected: `deletePersonById` aparece **solo** en su definición y en su JSDoc `@deprecated`; `releasePersonIfOrphan(` aparece en la definición y en **siete** llamadas (cinco en `store`, `:803` y el catch de `syncCreate`), todas con dos argumentos.

- [ ] **Step 9: Commit**

```bash
git add app/services/employee_service.ts app/controllers/employee_controller.ts tests/unit/services/employee_sync_create_release.spec.ts tests/unit/services/employee_release_person_surface.spec.ts
git commit -m "fix(USRH1789698261608): la sincronización biométrica compensa por el mismo predicado y retira deletePersonById

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Manual de prueba manual de API (hermano del plan)

Todo plan de este repo entrega su manual de QA hermano. Esta tarea lo construye.

**La regla manda:** `~/.cursor/rules/manual-qa-api.mdc` (`alwaysApply`) y `~/.cursor/rules/manual-qa-execution.mdc`. **Leerlas completas antes de escribir una línea.** Cada step de abajo aplica una sección de la regla y la cita entre comillas; lo que sigue son las constantes y los datos de esta HU ya resueltos contra el código, no una versión de la regla. Si algo de aquí pareciera contradecirla, manda la regla.

**Files:**
- Create: `docs/superpowers/plans/2026-09-18-blindar-liberacion-persona-alta-fallida-qa-api.md`
- Modify: `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (no versionado: está en `.git/info/exclude`; **no se commitea**)

**Interfaces:**
- Consumes: el comportamiento entregado por las Tareas 1–4 y el contrato HTTP de `POST /api/persons` y `POST /api/employees`, que **no cambia**.
- Produces: playbook recorrible con Postman/Insomnia/Bruno por una persona, y seeder idempotente.

- [ ] **Step 1: "Antes de escribir: tomar las constantes del proyecto"**

La regla: *"La regla fija el formato; los valores concretos salen del repo. Antes de redactar, abre un manual anterior del mismo API —o el código, si no hay ninguno— y anota la URL base local, el esquema de auth, la forma del envelope de éxito y de error, dónde vive el seeder de QA, y el dominio y contraseña de los usuarios de prueba."*

Manual anterior del mismo API: `docs/superpowers/plans/2026-09-17-alta-exige-estructura-qa-api.md`. Abrirlo y anotar. Lo que ya trae:

| Constante | Valor |
|---|---|
| URL base local | `http://127.0.0.1:3333` |
| Esquema de auth | Resuelta por el cliente: `Authorization: Bearer <token>`. No se documenta el login |
| Header obligatorio en toda petición | `X-Business-Unit-Id: <identificador público de la empresa>`, resuelto en Preparar con una consulta |
| Envelope de éxito de `POST /api/persons` | `201 { type: 'success', title: 'Persons', message: 'The person was created successfully', data: { person: {...} } }` |
| Envelope del alta rechazada por estructura | `400 { type: 'warning', title: 'Departamento y puesto obligatorios', message: 'Faltan el departamento y el puesto', detail: 'Faltan el departamento y el puesto', key: 'alta-empleado-invalida' }` |
| Seeder de QA | `database/seeders/_tmp_do_not_commit_qa_seeder.ts` |
| Comando del seeder | `node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts` |
| Dominio de pruebas | `@gsti-tests.local` |
| Contraseña de prueba | `password` |

Lo que hay que anotar leyendo el código (investigación; no se publica en el manual): el rechazo por estructura faltante es el **primer** punto de liberación de `store` y ocurre **antes** de cualquier validación, así que es la forma más barata y estable de provocar un alta fallida con cualquier `personId`. El registro interno va a Mongo; el modelo se registra como `log_scope_denied` y **mongoose pluraliza el nombre**, así que la colección real se llama **`log_scope_denieds`** (verificado con `mongoose.pluralize()`). El documento tiene `domain`, `action`, `requested_id`, `actor_user_id`, `business_unit_scope`, `date`.

- [ ] **Step 2: Anotar el contrato observado**

Contra el servidor local, con el usuario que siembre el Step 3, disparar una vez cada variante y copiar status + body literales al manual. No inventar textos. Lo esperado según el código (a confirmar byte a byte):

| Variante | Endpoint | Response esperado | Efecto en el expediente | Registro interno |
|---|---|---|---|---|
| Reintento legítimo: persona recién creada, alta sin estructura | `POST /api/employees` | `400` · `Faltan el departamento y el puesto` | liberado (`person_deleted_at` no nulo) | `release-orphan-granted` |
| Reintento: misma persona, mismo correo | `POST /api/persons` | `201` · `The person was created successfully` | nueva ficha | — |
| Ex-colaborador (empleado dado de baja) | `POST /api/employees` | **el mismo `400`, byte a byte** | intacto | `release-orphan` |
| Ex-usuario (usuario dado de baja) | `POST /api/employees` | el mismo `400` | intacto | `release-orphan` |
| Ex-cliente (cliente dado de baja) | `POST /api/employees` | el mismo `400` | intacto | `release-orphan` |
| Sin vínculo, creada hace días | `POST /api/employees` | el mismo `400` | intacto | `release-orphan` |
| Sincronización desde el biométrico | — | **no se puede provocar en el ambiente sembrado** (exige el equipo biométrico); se declara en una línea | — | — |

- [ ] **Step 3: "Setup — seeder QA (no versionado)"**

La regla: *"Todo lo necesario va en un solo archivo, el mismo que ya usan los paneles del producto — no crear uno nuevo"*; usuarios *"`qa-<feature>-<variante>@<dominio de pruebas>` con la contraseña de prueba del proyecto, uno por variante del caso"*; *"Roles, permisos y datos de negocio imprescindibles para la HU"*; *"Los ids que van en las URLs no se inventan ni se hardcodean: se entregan con la consulta que los resuelve"*; *"El playbook incluye un solo comando: el que corre ese seeder."*

`<feature>` = `liberacion`. Prefijo `QA-LIB-*` para no chocar con `QA-ALC-*`, `QA-EDI-*` ni `QA-ALT-*`.

**Usuarios (una variante cada uno):**

| | Correo | Variante |
|---|---|---|
| **A** | `qa-liberacion-capturista@gsti-tests.local` | Capturista con permiso de alta (`root`, con acceso a la empresa de prueba) |

(Una sola variante: la HU no cambia quién puede dar de alta y el corte va por comportamiento, no por permiso — el mismo usuario provoca el reintento legítimo y los intentos dirigidos; lo único que cambia entre escenarios es qué `personId` manda.)

**Datos de negocio imprescindibles:** una empresa (`qa-liberacion-prueba`), un departamento y un puesto (`QA-LIB-DEPT`, `QA-LIB-POS`) solo para poder colgar el empleado dado de baja, y **cuatro expedientes protegidos**, que el recorrido intenta borrar y deben seguir ahí:

| Correo del expediente | Historia que lo protege |
|---|---|
| `qa-lib-excolaborador@gsti-tests.local` | fue empleado (`QA-LIB-EXEMP`), dado de baja |
| `qa-lib-exusuario@gsti-tests.local` | fue usuario del sistema, dado de baja |
| `qa-lib-excliente@gsti-tests.local` | fue cliente, dado de baja |
| `qa-lib-antigua@gsti-tests.local` | sin vínculo, creado hace dos días |

**No** sembrar la persona del reintento legítimo: la crea el recorrido con `POST /api/persons`.

Agregar al seeder los imports que faltan, junto a los demás modelos:

```ts
import Customer from '#models/customer'
import db from '@adonisjs/lucid/services/db'
```

Agregar la función junto a `seedAltaExigeEstructuraQa` e invocarla desde `run()` justo después de `await seedAltaExigeEstructuraQa()`:

```ts
/**
 * Siembra la empresa, la estructura mínima, el capturista y los cuatro
 * expedientes protegidos del manual QA-LIB-* (USRH1789698261608).
 * Idempotente por correo de la persona y por código; si una corrida anterior
 * liberó por error alguno de los expedientes protegidos, lo restaura para que
 * el siguiente recorrido arranque limpio. No toca QA-ALC-*, QA-EDI-* ni QA-ALT-*.
 */
async function seedLiberacionPersonaQa(): Promise<void> {
  const buPrueba = await BusinessUnit.firstOrCreate(
    { businessUnitSlug: 'qa-liberacion-prueba' },
    {
      businessUnitName: 'QA Liberacion Prueba',
      businessUnitLegalName: 'QA Liberacion Prueba SA de CV',
      businessUnitActive: 1,
    },
  )
  const depto = await Department.firstOrCreate(
    { departmentCode: 'QA-LIB-DEPT' },
    {
      departmentSyncId: DateTime.now().toMillis(),
      departmentName: 'QA Liberacion Depto',
      departmentAlias: '',
      departmentIsDefault: false,
      departmentActive: 1,
      companyId: 1,
      businessUnitId: buPrueba.businessUnitId,
    },
  )
  const puesto = await Position.firstOrCreate(
    { positionCode: 'QA-LIB-POS' },
    {
      positionName: 'QA Liberacion Puesto',
      positionAlias: 'QA lib',
      positionIsDefault: false,
      positionActive: 1,
      companyId: 1,
      businessUnitId: buPrueba.businessUnitId,
      positionSyncId: DateTime.now().toMillis(),
    },
  )

  const rootRole = await Role.query().where('role_slug', 'root').whereNull('role_deleted_at').firstOrFail()
  await createAlcanceUser(
    'qa-liberacion-capturista@gsti-tests.local',
    'LiberacionCapturista',
    rootRole.roleId,
    buPrueba.businessUnitId,
  )

  /** Expediente protegido: existe y NO está liberado. Si una corrida lo liberó, se restaura. */
  async function ensureProtectedPerson(email: string, lastname: string): Promise<Person> {
    let person = await Person.query().withTrashed().where('person_email', email).first()
    if (!person) {
      person = await Person.create({
        personFirstname: 'QA',
        personLastname: lastname,
        personSecondLastname: 'Liberacion',
        personEmail: email,
      })
    } else if (person.deletedAt) {
      person.deletedAt = null
      await person.save()
    }
    return person
  }

  // Ex-colaborador: fila en employees con baja (soft delete). Se inserta por
  // tabla para no disparar los hooks de alta (sincronización, cuota, bitácora).
  const exColaborador = await ensureProtectedPerson('qa-lib-excolaborador@gsti-tests.local', 'ExColaborador')
  const exEmpleado = await db.from('employees').where('employee_code', 'QA-LIB-EXEMP').first()
  if (!exEmpleado) {
    const now = new Date()
    await db.table('employees').insert({
      employee_sync_id: 'QA-LIB-EXEMP',
      employee_code: 'QA-LIB-EXEMP',
      employee_first_name: 'QA',
      employee_last_name: 'ExColaborador',
      employee_second_last_name: 'Liberacion',
      company_id: buPrueba.businessUnitId,
      business_unit_id: buPrueba.businessUnitId,
      department_id: depto.departmentId,
      position_id: puesto.positionId,
      person_id: exColaborador.personId,
      employee_type_id: 1,
      employee_work_schedule: 'Onsite',
      employee_business_email: 'qa-lib-excolaborador@gsti-tests.local',
      employee_created_at: now,
      employee_deleted_at: now,
    })
  }

  // Ex-usuario: fila en users con baja (soft delete).
  const exUsuario = await ensureProtectedPerson('qa-lib-exusuario@gsti-tests.local', 'ExUsuario')
  const usuarioBaja = await User.query().withTrashed().where('user_email', 'qa-lib-exusuario@gsti-tests.local').first()
  if (!usuarioBaja) {
    const user = await User.create({
      userEmail: 'qa-lib-exusuario@gsti-tests.local',
      userPassword: QA_PASSWORD,
      userActive: 0,
      roleId: rootRole.roleId,
      personId: exUsuario.personId,
      userEmailType: 'institutional',
      userPasswordSetAt: DateTime.utc(),
    })
    await user.delete()
  }

  // Ex-cliente: fila en customers con baja (soft delete).
  const exCliente = await ensureProtectedPerson('qa-lib-excliente@gsti-tests.local', 'ExCliente')
  const clienteBaja = await Customer.query().withTrashed().where('person_id', exCliente.personId).first()
  if (!clienteBaja) {
    const customer = await Customer.create({
      customerUuid: 'qa-lib-excliente',
      personId: exCliente.personId,
    })
    await customer.delete()
  }

  // Antigua: sin vínculo alguno, pero creada hace dos días (fuera de ventana).
  const antigua = await ensureProtectedPerson('qa-lib-antigua@gsti-tests.local', 'Antigua')
  await db
    .from('people')
    .where('person_id', antigua.personId)
    .update({ person_created_at: DateTime.utc().minus({ days: 2 }).toFormat('yyyy-MM-dd HH:mm:ss') })

  console.log('[qa-seeder] liberacion-persona: empresa, capturista y expedientes protegidos listos')
}
```

Correr y confirmar que es idempotente (dos veces seguidas sin error):

```bash
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts && node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Expected: ambas corridas terminan con `[qa-seeder] liberacion-persona: …` y sin `Duplicate entry`.

- [ ] **Step 4: Escribir el manual — "Formato — contrato, no código", "Qué significa cada dato", "Alcance — solo la HU", "Ejemplo cotidiano", "Estructura mínima"**

La regla: *"Cada paso indica el endpoint (método + ruta + body si aplica) y el response exacto (status + body). Nunca 'debería fallar'"*; *"Prohibido: rutas de archivos, nombres de clases, servicios, validadores o middlewares, el lenguaje del backend, y cualquier 'revisa el código de X'"*; *"Después del response exacto de cada escenario, agrega una lista corta que explique en lenguaje llano qué significa cada dato"*; *"Cada clave-valor se explica una sola vez"*; *"Documentar únicamente lo que la historia pide validar. No casos borde ni regresiones"*; *"Si un caso de la HU no se puede provocar en un ambiente sembrado, se declara en una línea y no se le inventan pasos"*; *"Después de Problema / Solución, agrega un `Ejemplo:` de 2-4 líneas"*.

Crear `docs/superpowers/plans/2026-09-18-blindar-liberacion-persona-alta-fallida-qa-api.md` con este contenido, sustituyendo los responses por los observados en el Step 2 si difieren en una sola letra:

`````markdown
# Prueba manual API — La limpieza del alta fallida solo borra el expediente recién creado

**Problema:** Cuando un alta de colaborador falla a medio camino, el sistema borra el expediente de la persona que se acababa de crear para que se pueda volver a capturar sin chocar con "este correo ya está registrado". Hasta esta historia ese borrado confiaba en el identificador que le mandaban, sin comprobar de quién era: cualquier usuario con permiso de alta podía provocar un alta fallida a propósito, mandar el identificador de otro expediente y lograr que se borrara. Y trataba como desechable a quien ya no tiene vínculo vigente, así que el expediente de un ex-colaborador, un ex-usuario o un ex-cliente —justo el que la empresa está obligada a conservar— era el más expuesto.

**Solución:** La limpieza sigue funcionando igual para el capturista: si el alta falla sobre un expediente recién creado y sin ninguna historia, se borra y se puede volver a capturar a la misma persona. Pero ya no puede tocar un expediente que haya sido de un empleado, de un usuario o de un cliente —aunque esté dado de baja—, ni uno creado hace más de una hora. Cuando se niega, la respuesta que recibe quien captura es exactamente la misma de siempre, y el sistema deja un registro interno de qué expediente se intentó borrar y quién lo intentó. Este manual no cubre el alta que llega desde el equipo biométrico: ese camino tiene la misma protección, pero no se puede provocar en el ambiente sembrado (necesita el equipo).

Ejemplo: es como la papelera de un salón de clases: si acabas de escribir tu nombre en una hoja y te equivocaste, la puedes tirar y empezar de nuevo. Lo que ya no puedes hacer es tirar la hoja de otro compañero diciendo "me equivoqué": el maestro la deja donde estaba, te contesta lo mismo de siempre y apunta en su libreta quién lo intentó.

Se prueba con un cliente de API (Postman, Insomnia, Bruno). La autenticación se asume resuelta por tu cliente: se envía el token del usuario en el header `Authorization: Bearer <token>`.

**URL base:** `http://127.0.0.1:3333`

**Header obligatorio en toda petición de este manual.** Además del token, cada endpoint exige el header `X-Business-Unit-Id` con el identificador público de la empresa de prueba.

**El registro interno** vive en la base de registros (Mongo) del ambiente local, colección `log_scope_denieds`. Si tu ambiente no tiene esa base configurada, los pasos marcados *(registro interno)* no son observables aquí: la decisión de borrar o no **no depende** de que el registro se guarde.

## 1. Preparar (una sola vez)

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Deja lista la empresa de prueba, el usuario capturista y cuatro expedientes protegidos: uno que fue empleado y está dado de baja, uno que fue usuario del sistema y está dado de baja, uno que fue cliente y está dado de baja, y uno sin ninguna historia pero creado hace dos días. **No** crea la persona del reintento legítimo: la crea el Escenario 1. Si un escenario borrara por error un expediente protegido, volver a correr el seeder lo restaura.

| | Correo | Contraseña | Variante |
|---|---|---|---|
| **A** | `qa-liberacion-capturista@gsti-tests.local` | `password` | Capturista con permiso de alta, con acceso a la empresa de prueba |

Los identificadores que van en las peticiones no se inventan ni se hardcodean: resuélvelos con estas consultas.

Identificador público de la empresa de prueba, para el header `X-Business-Unit-Id` de todos los escenarios:

```sql
SELECT business_unit_public_id FROM business_units WHERE business_unit_slug = 'qa-liberacion-prueba';
```

Identificador interno de la misma empresa, para `companyId`, `businessUnitId` y `payrollBusinessUnitId` en el cuerpo de cada alta:

```sql
SELECT business_unit_id FROM business_units WHERE business_unit_slug = 'qa-liberacion-prueba';
```

Identificadores de los cuatro expedientes protegidos (uno por escenario, del 2 al 5):

```sql
SELECT person_id, person_email FROM people
WHERE person_email IN (
  'qa-lib-excolaborador@gsti-tests.local',
  'qa-lib-exusuario@gsti-tests.local',
  'qa-lib-excliente@gsti-tests.local',
  'qa-lib-antigua@gsti-tests.local'
);
```

Identificador del usuario capturista, para reconocerlo en el registro interno:

```sql
SELECT user_id FROM users WHERE user_email = 'qa-liberacion-capturista@gsti-tests.local';
```

## 2. Escenario 1 — Reintento legítimo: el expediente recién creado sí se libera

Usuario: **A**. Correo de la persona: `qa-lib-s1@gsti-tests.local`.

**Paso 1 — Crear la persona**

**Endpoint:** `POST /api/persons`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador público de la empresa de prueba, resuelto en Preparar>`

```json
{
  "personFirstname": "Liberacion",
  "personLastname": "Uno",
  "personEmail": "qa-lib-s1@gsti-tests.local"
}
```

**Response — 201:**

```json
{
  "type": "success",
  "title": "Persons",
  "message": "The person was created successfully",
  "data": {
    "person": {
      "personId": <person_id de este paso>,
      "...": "..."
    }
  }
}
```

Qué significa cada dato:

- `type`: qué tan bien salió la petición. Puede valer `success` (sí se hizo lo pedido) o `warning` (no se hizo y el mensaje dice qué corregir — se ve en el Paso 2).
- `title` / `message`: el encabezado y la frase del resultado.
- `data.person.personId`: el número con el que el sistema identifica el expediente de la persona recién creada. Es el que se manda en el alta.

**Paso 2 — Provocar un alta fallida sobre esa persona**

**Endpoint:** `POST /api/employees`

Headers: iguales al Paso 1.

```json
{
  "employeeFirstName": "Liberacion",
  "employeeLastName": "Uno",
  "employeeSecondLastName": "QA",
  "companyId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "departmentId": 0,
  "positionId": "",
  "personId": <person_id del Paso 1>,
  "employeeTypeId": 1,
  "businessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeWorkSchedule": "Onsite",
  "employeeWorkScheduleHybridConfig": null,
  "employeeBusinessEmail": "qa-lib-s1@gsti-tests.local"
}
```

**Response — 400:**

```json
{
  "type": "warning",
  "title": "Departamento y puesto obligatorios",
  "message": "Faltan el departamento y el puesto",
  "detail": "Faltan el departamento y el puesto",
  "key": "alta-empleado-invalida"
}
```

Qué significa lo nuevo aquí:

- `departmentId` en `0` y `positionId` vacío: es la forma más sencilla de que el alta falle a propósito. El alta fallida es el disparador; lo que se prueba es qué hace el sistema con el expediente después.
- `detail`: la misma frase que `message`, para pantallas que la muestran aparte.
- `key`: la etiqueta con la que el sistema clasifica este rechazo. Vale `alta-empleado-invalida` (el alta no se hizo por un dato de la captura).

**Guarda este response completo**: los Escenarios 2 a 5 deben devolver exactamente el mismo cuerpo, sin una letra de diferencia.

Confirma que el expediente quedó liberado (la fecha **no** debe ser nula):

```sql
SELECT person_deleted_at FROM people WHERE person_id = <person_id del Paso 1>;
```

*(registro interno)* Confirma que quedó anotada la liberación concedida:

```
db.log_scope_denieds.find({ domain: 'person', requested_id: <person_id del Paso 1> })
```

Debe aparecer un documento:

```json
{
  "domain": "person",
  "action": "release-orphan-granted",
  "requested_id": <person_id del Paso 1>,
  "actor_user_id": <user_id del capturista, resuelto en Preparar>,
  "business_unit_scope": [<id interno de la empresa de prueba>],
  "date": "..."
}
```

Qué significa cada dato:

- `domain`: de qué tipo de registro se habla. Aquí siempre vale `person` (el expediente de una persona).
- `action`: qué decidió el sistema. Puede valer `release-orphan-granted` (sí borró el expediente, porque era recién creado y sin historia — el de este escenario) o `release-orphan` (se negó a borrarlo — se ve en el Escenario 2).
- `requested_id`: el expediente que se intentó borrar.
- `actor_user_id`: quién provocó el alta fallida.
- `business_unit_scope`: a qué empresas tenía acceso quien lo provocó.
- `date`: cuándo ocurrió.
- El documento **no** trae nombre, correo, CURP, RFC ni NSS del expediente: solo su número.

**Paso 3 — Volver a capturar a la misma persona**

Repite el **Paso 1** con el mismo cuerpo y el mismo correo.

**Response — 201:** mismo envelope que el Paso 1 (`The person was created successfully`). (Los datos son los ya explicados en el Paso 1.) Comprueba que el reintento no choca con "el correo ya está registrado".

## 3. Escenario 2 — Ex-colaborador: no se borra

Usuario: **A**. Expediente: el de `qa-lib-excolaborador@gsti-tests.local` (fue empleado, dado de baja).

**Endpoint:** `POST /api/employees`

Headers: iguales al Escenario 1.

```json
{
  "employeeFirstName": "Liberacion",
  "employeeLastName": "Dos",
  "employeeSecondLastName": "QA",
  "companyId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "departmentId": 0,
  "positionId": "",
  "personId": <person_id de qa-lib-excolaborador, resuelto en Preparar>,
  "employeeTypeId": 1,
  "businessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "payrollBusinessUnitId": <id interno de la empresa de prueba, resuelto en Preparar>,
  "employeeWorkSchedule": "Onsite",
  "employeeWorkScheduleHybridConfig": null,
  "employeeBusinessEmail": "qa-lib-s2@gsti-tests.local"
}
```

**Response — 400:** exactamente el mismo cuerpo que el Paso 2 del Escenario 1 (`Faltan el departamento y el puesto`). Compáralo con el que guardaste: ni una letra distinta, ni un campo de más. (Los datos son los ya explicados en el Escenario 1.)

Confirma que el expediente sigue intacto (la fecha **debe** ser nula) y que su historia como empleado sigue ahí:

```sql
SELECT person_deleted_at FROM people WHERE person_id = <person_id de qa-lib-excolaborador>;
SELECT employee_code, employee_deleted_at FROM employees WHERE person_id = <person_id de qa-lib-excolaborador>;
```

*(registro interno)* Confirma que quedó anotado el intento negado:

```
db.log_scope_denieds.find({ domain: 'person', requested_id: <person_id de qa-lib-excolaborador> })
```

Debe aparecer un documento con `action: "release-orphan"` y el `actor_user_id` del capturista. Qué significa lo nuevo aquí: `action` con valor `release-orphan` quiere decir que el sistema se negó a borrar ese expediente. El documento **no** dice por qué se negó: eso es a propósito.

## 4. Escenario 3 — Ex-usuario del sistema: no se borra

Usuario: **A**. Expediente: el de `qa-lib-exusuario@gsti-tests.local` (fue usuario del sistema, dado de baja).

**Endpoint:** `POST /api/employees` — mismo cuerpo que el Escenario 2, con `employeeLastName`: `"Tres"`, `personId`: `<person_id de qa-lib-exusuario>` y `employeeBusinessEmail`: `qa-lib-s3@gsti-tests.local`.

**Response — 400:** exactamente el mismo cuerpo que el Paso 2 del Escenario 1. (Los datos son los ya explicados en el Escenario 1.)

Confirma que el expediente sigue intacto:

```sql
SELECT person_deleted_at FROM people WHERE person_id = <person_id de qa-lib-exusuario>;
```

*(registro interno)* `db.log_scope_denieds.find({ domain: 'person', requested_id: <person_id de qa-lib-exusuario> })` → un documento con `action: "release-orphan"`. (Los datos son los ya explicados en el Escenario 2.)

## 5. Escenario 4 — Ex-cliente: no se borra

Usuario: **A**. Expediente: el de `qa-lib-excliente@gsti-tests.local` (fue cliente, dado de baja).

**Endpoint:** `POST /api/employees` — mismo cuerpo que el Escenario 2, con `employeeLastName`: `"Cuatro"`, `personId`: `<person_id de qa-lib-excliente>` y `employeeBusinessEmail`: `qa-lib-s4@gsti-tests.local`.

**Response — 400:** exactamente el mismo cuerpo que el Paso 2 del Escenario 1. (Los datos son los ya explicados en el Escenario 1.)

Confirma que el expediente sigue intacto:

```sql
SELECT person_deleted_at FROM people WHERE person_id = <person_id de qa-lib-excliente>;
```

*(registro interno)* `db.log_scope_denieds.find({ domain: 'person', requested_id: <person_id de qa-lib-excliente> })` → un documento con `action: "release-orphan"`. (Los datos son los ya explicados en el Escenario 2.)

## 6. Escenario 5 — Sin historia pero con antigüedad: no se borra

Usuario: **A**. Expediente: el de `qa-lib-antigua@gsti-tests.local` (sin ningún vínculo, creado hace dos días).

**Endpoint:** `POST /api/employees` — mismo cuerpo que el Escenario 2, con `employeeLastName`: `"Cinco"`, `personId`: `<person_id de qa-lib-antigua>` y `employeeBusinessEmail`: `qa-lib-s5@gsti-tests.local`.

**Response — 400:** exactamente el mismo cuerpo que el Paso 2 del Escenario 1. (Los datos son los ya explicados en el Escenario 1.)

Confirma que el expediente sigue intacto:

```sql
SELECT person_deleted_at FROM people WHERE person_id = <person_id de qa-lib-antigua>;
```

*(registro interno)* `db.log_scope_denieds.find({ domain: 'person', requested_id: <person_id de qa-lib-antigua> })` → un documento con `action: "release-orphan"`. (Los datos son los ya explicados en el Escenario 2.)

## 7. Checklist

- [ ] Escenario 1: `400` con `Faltan el departamento y el puesto`; el expediente recién creado queda liberado; `POST /api/persons` con el mismo correo → `201`; registro `release-orphan-granted`
- [ ] Escenario 2: mismo `400` byte a byte; el ex-colaborador sigue intacto con su historia; registro `release-orphan`
- [ ] Escenario 3: mismo `400` byte a byte; el ex-usuario sigue intacto; registro `release-orphan`
- [ ] Escenario 4: mismo `400` byte a byte; el ex-cliente sigue intacto; registro `release-orphan`
- [ ] Escenario 5: mismo `400` byte a byte; el expediente antiguo sigue intacto; registro `release-orphan`
`````

Revisar contra la regla antes de guardar: ninguna ruta de archivo, ningún nombre de clase, servicio o método del backend en el manual; cada valor cerrado explicado con palabras (`success`/`warning`, `release-orphan-granted`/`release-orphan`); cada dato explicado una sola vez; sin casos borde ni regresiones; el caso del biométrico declarado en una línea sin pasos inventados; sin interruptores globales (no hay sección de Limpieza).

- [ ] **Step 5: Levantar el ambiente y entregar el playbook a una persona — "Ejecución de pruebas manuales"**

La regla: *"Un playbook de prueba manual (frontend o API) lo camina una persona, no el agente."* *"Levanta el ambiente (servidores, seeder) y entrega el playbook lista para que la persona lo recorra. Ahí termina tu parte."*

```bash
npm run dev
```

Con el API arriba y el seeder ya corrido (Step 3), entregar el manual a quien lo recorre. **No** automatizar el recorrido con Playwright ni con scripts. Si un response observado no coincide con el manual, corregir el manual (o el código, si el manual tenía razón) y volver a entregar.

- [ ] **Step 6: Commit (solo el manual)**

El seeder **no** se commitea (está excluido por `.git/info/exclude`; `git status` no lo muestra).

```bash
git add docs/superpowers/plans/2026-09-18-blindar-liberacion-persona-alta-fallida-qa-api.md
git commit -m "docs(USRH1789698261608): manual de QA de API del blindaje de la liberación de la persona

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Verificación de cierre y PR

**Files:** ninguno nuevo. Verificación cruzada del diff completo.

- [ ] **Step 1: Suite afectada completa**

```bash
node ace test unit --files="person_release_constants" --files="person_release_guard" --files="employee_store_transactional" --files="employee_sync_create_release" --files="employee_release_person_surface" --files="scope_denied_log_service" --files="person_is_collaborator" --files="position_department_idor_regression"
```

Expected: todo PASS. `person_is_collaborator` sigue en verde porque no se tocó (D5).

- [ ] **Step 2: Typecheck y lint globales**

```bash
npm run typecheck && npm run lint
```

Expected: sin errores nuevos respecto a `multitenant`.

- [ ] **Step 3: Verificar que nada prohibido cambió**

```bash
git diff --stat multitenant...HEAD -- app/validators/person.ts app/models/person.ts database/ resources/lang start/routes app/services/scope_denied_log_service.ts app/helpers/person_is_collaborator.ts app/constants/system_modules_menu .env .env.test
```

Expected: **sin salida** (ninguno de esos archivos aparece en el diff).

```bash
git diff multitenant...HEAD -- app/controllers/employee_controller.ts | grep -E '^\+.*(response\.status|key:|title:|message:|detail:)' 
```

Expected: **sin salida** — ninguna línea añadida toca status, claves ni mensajes de respuesta (regla 7, CA-6).

```bash
git diff multitenant...HEAD | grep -niE 'fail-closed por scope|ámbito del usuario|scope ya disponible'
```

Expected: sin salida (§12: frases prohibidas).

- [ ] **Step 4: Verificación manual de indistinguibilidad (CA-6) contra el servidor local**

Con el API corriendo (`node ace serve --hmr`) y un token de un usuario con `createEmployee`, provocar dos altas fallidas idénticas (sin `departmentId` ni `positionId`, para caer en el primer punto) — una con el `personId` de una persona recién creada por `POST /api/persons`, otra con el `personId` de un ex-colaborador — y comparar las respuestas:

```bash
TOKEN='<bearer del usuario capturista>'; BU='<X-Business-Unit-Id>'; for PID in <personId propio> <personId ex-colaborador>; do curl -s -o "/tmp/resp-$PID.json" -w "%{http_code}\n" -X POST http://localhost:3333/api/employees -H "Authorization: Bearer $TOKEN" -H "X-Business-Unit-Id: $BU" -H 'Content-Type: application/json' -d "{\"employeeFirstName\":\"Prueba\",\"employeeLastName\":\"CA6\",\"personId\":$PID,\"companyId\":1}"; done; diff /tmp/resp-<personId propio>.json /tmp/resp-<personId ex-colaborador>.json && echo 'BYTE A BYTE IGUALES'
```

Expected: ambos `400`, `diff` sin salida, `BYTE A BYTE IGUALES`. Después, en MySQL:

```sql
SELECT person_id, person_deleted_at FROM people WHERE person_id IN (<personId propio>, <personId ex-colaborador>);
```

Expected: el propio con `person_deleted_at` no nulo; el ex-colaborador con `NULL`. En Mongo, `db.log_scope_denieds.find({ domain: 'person' }).sort({ date: -1 }).limit(2)` (mongoose pluraliza el nombre de la colección) muestra una entrada `release-orphan-granted` y una `release-orphan`, ambas con `actor_user_id` del capturista y sin datos personales.

- [ ] **Step 5: Confirmar que `PERSON_RELEASE_WINDOW_MINUTES` fuera de rango satura con aviso**

```bash
PERSON_RELEASE_WINDOW_MINUTES=999999 node ace repl --eval "const { getPersonReleaseWindowMinutes } = await import('#constants/person_release.constants'); console.log(getPersonReleaseWindowMinutes())"
```

Expected: imprime `1440` precedido de un `warn` con `"variable":"PERSON_RELEASE_WINDOW_MINUTES","configured":999999,"applied":1440`. (Si `--eval` no está disponible en esta versión de `ace repl`, abrir el REPL y pegar la misma línea.)

- [ ] **Step 6: Abrir el PR contra `multitenant`**

```bash
git push -u origin feature/USRH1789698261608-blindar-liberacion-persona
gh pr create --base multitenant --title "fix(USRH1789698261608): blindar la liberación de la persona del alta fallida" --body-file - <<'EOF'
## Qué cambia

La compensación del alta de empleado fallida (`EmployeeService.releasePersonIfOrphan`) solo puede liberar un expediente que **nunca** tuvo vínculo (`employees`, `users`, `customers`, con o sin `*_deleted_at`) y que nació dentro de la ventana de frescura (`PERSON_RELEASE_WINDOW_MINUTES`, default 60, saturada a [1, 1440], tolerancia de 120 s hacia el futuro). Aplica en los seis puntos del alta y en el catch de `syncCreate` (D2), que deja de usar `deletePersonById` (queda `@deprecated`, sin llamadores). Cada decisión —negada y concedida— queda en `log_scope_denied` (`release-orphan` / `release-orphan-granted`), best-effort, sin PII; `not-found` no se registra (la compensación corre dos veces por diseño).

## Qué NO cambia

Ninguna respuesta del API: mismo status, cuerpo y claves con `personId` propio y ajeno (verificado a mano, CA-6). Cero migraciones, i18n, rutas, permisos ni pantallas. `person_is_collaborator.ts` intacto (D5). `DELETE /api/persons/:personId` sigue abierto (R1, fuera de alcance por decisión de Wilvardo): **este PR no cierra todo el riesgo de borrado de expedientes**.

## Notas para revisión

- `env.get()` en Adonis 6 lee el valor validado al arrancar: cambiar `PERSON_RELEASE_WINDOW_MINUTES` exige reiniciar el proceso. Cumple la regla 3 (sin liberar versión); el "sin reiniciar" del DoD no aplica y se ajusta en el spec.
- CA-9 (persona preexistente del biométrico se conserva): confirmado con Noé el 2026-09-18, antes de la tarea D2.
- `people` no tiene marca de empresa: esto **no** es aislamiento por cuenta, llega con *Marcar la empresa dueña de la persona*.

## Pruebas

Manual de QA de API hermano: `docs/superpowers/plans/2026-09-18-blindar-liberacion-persona-alta-fallida-qa-api.md` (5 escenarios, recorrido por una persona).

`node ace test unit --files="person_release_constants" --files="person_release_guard" --files="employee_store_transactional" --files="employee_sync_create_release" --files="employee_release_person_surface"` en verde sobre `sae_pruebas`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

- [ ] **Step 7: Actualizar el spec con lo que cambió**

En `~/Downloads/spec-USRH1789698261608.md` (o donde viva el spec en `00-brain`), ajustar el DoD: "verificado que cambiar el valor surte efecto **sin reiniciar**" → "verificado que cambiar el valor surte efecto **tras reiniciar el proceso** (`env.get` lee el valor validado al boot)". Y marcar R4 como confirmado por Noé el 2026-09-18.

---

## Self-review (hecho al escribir el plan)

**Cobertura del spec.** Regla 1 → Tarea 2 (tres `whereNotExists` sin `whereNull`) + tests ex-empleado/usuario/cliente en Tareas 2 y 3. Regla 2 y CA-5 → Tarea 1 (predicado bilateral) + Tarea 2 (stale/futuro contra BD). Regla 3 y CA-10 → Tarea 1 (env, default, saturación con `warn`). Regla 4 → asserts `isNull(person_deleted_at)` en cada caso negado. Regla 5 y CA-1 → "reintento legítimo" en Tarea 3 y el caso de rollback de `create` que ya existía. Regla 6, CA-11, CA-12 → Tarea 3 (dos acciones, `not-found` sin entrada, best-effort con Mongo caído, sin `reason` ni PII en el payload). Regla 7 y CA-6 → Tarea 3 (no se toca ninguna respuesta) + Tarea 6 pasos 3 y 4 + Escenarios 2-5 del manual (mismo `400` byte a byte). Regla 8, CA-8 → Tareas 3 y 4 + spec de contenido. CA-7 → caso "idempotencia" (Tarea 3). CA-9 → Tarea 4 + gate de Noé. CA-13 → residual documentado; no requiere código. Manual de QA hermano (regla `manual-qa-api.mdc`) → Tarea 5, con el recorrido a cargo de una persona (regla `manual-qa-execution.mdc`). Bordes 1-12 del Anexo B → 1-3 (`not-found` en Tarea 2), 4-6 (Tarea 1), 7-8 (Tarea 1), 9-10 (contexto solo se registra, nunca decide; `actorUserId: null` es válido por tipo), 11 (Mongo caído, Tarea 3), 12 (catch con `logger.error`, Tarea 3).

**Placeholders.** Los únicos valores por rellenar son credenciales y ids reales del entorno local en el paso manual de la Tarea 5 (`<bearer …>`, `<personId …>`), que no pueden fijarse en el plan.

**Consistencia de tipos.** `PersonReleaseContext { actorUserId: number | null; businessUnitScope: number[] }` se define en Tarea 2 y se usa con ese nombre y forma en Tareas 3, 4 y en los tres specs. `releasePersonIfOrphan(personId: number, context: PersonReleaseContext): Promise<boolean>` — mismo orden en las siete llamadas. `create(employee, usersResponsible, releaseContext, SNDeviceList = '')` — el spec de la Tarea 3 lo llama con tres argumentos. `syncCreate(employee, releaseContext)` — el spec de la Tarea 4 y `verify` lo llaman así. `ScopeDeniedLogService.log` recibe `requestedId`, `actorUserId`, `businessUnitScope` y `LogStore.set` los persiste como `requested_id`, `actor_user_id`, `business_unit_scope`: los asserts de los specs leen las claves snake_case.
