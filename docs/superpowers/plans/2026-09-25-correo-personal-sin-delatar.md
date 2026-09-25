# Correo personal sin delatar (USRH1789698261614) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el alta (`POST /api/persons`) y la edición (`PUT /api/persons/:personId`) rechacen el correo personal ocupado con una respuesta byte a byte idéntica que no confirme existencia, más la política escrita y el guion de soporte.

**Architecture:** Un solo emisor sin parámetros de dominio (`respondPersonEmailNotAvailable(ctx)`) sobre la maquinaria real de la 610; C1 lo llama interceptando el `E_VALIDATION_ERROR` por campo+regla; C2 saca el correo de la rama `field: 'email'` y lo enruta al mismo emisor; el contrato de `verifyInfo` se estrecha por tipo para que el correo no pueda volver a la lista.

**Tech Stack:** AdonisJS 6 (Lucid, VineJS, i18n ICU), MySQL 8, Japa funcional (`node ace test`), `blindIndex` + `TenantContext.runUnscoped`.

## Global Constraints

- Todo el código, comentarios y documentación en español; solo variables/funciones/clases/métodos en inglés.
- TypeScript estricto, cero `any` (ni `: any` ni `as any`) en lo tocado.
- Commits Conventional Commits: tipo en minúsculas e inglés, descripción/cuerpo/footer en español.
- Nada se borra a `__TO_DELETE__/` en esta historia (no hay retiros); si un retiro aparece, mover con `git mv` conservando ruta relativa.
- `node_modules/` intocable: solo lectura.
- Cero migraciones, cero seeders, cero columnas, cero índices, cero permisos, cero backoffice, cero frontend en esta historia.
- Prohibido tocar: `start/routes/person_routes.ts`, `app/exceptions/handler.ts`, `app/services/employee_service.ts`, bitácora `log_person_email_probe`, throttle/limiter, migración del índice de búsqueda, y toda la entrada 429 (son de la hermana USRH1789762889970).
- Prohibido `INSERT`/`UPDATE`/`DELETE` de catálogo en migraciones e ids literales de módulo/permiso/rol.
- Verificación de BD solo sobre `sae_pruebas` con `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed`; nunca contra la BD de `.env`; nunca dos migraciones a la vez (lock global `GET_LOCK('1',0)`).
- `key` es slug fijo del título en español en kebab-case, no traducible; `code` es campo aparte; nunca se escribe el `code` como `key`.
- Sin placeholders en i18n (ICU interpreta `{}`); el emisor no recibe el correo ni ningún dato de dominio.
- El 422 del correo no lleva cabeceras `X-RateLimit-*` ni `errors[]`, `rule`, `database.unique`, `personEmail`, el correo capturado, fechas, ni palabras prohibidas del Anexo B.
- La entrega no afirma que el oráculo queda cerrado (solo se evita confirmar la causa; probar un correo y otro sigue dando señal).

---

## Estructura de archivos (decisiones de descomposición)

| Archivo | Responsabilidad en esta historia |
|---|---|
| `app/constants/person_identity_error_codes.ts` (modificar) | Solo añadir la entrada 422 del correo al catálogo real `PERSON.IDENTITY.*`. No abre familia nueva. |
| `resources/langs/es.json`, `resources/langs/en.json` (modificar) | Solo las 2 claves planas del 422 (`person_email_not_available_title/detail`), junto al bloque `person_identity_*`. |
| `docs/error_codes_documentation.md` (modificar) | Solo la sección del 422 al final, forma `### CODE — Título (\`key\`)`. |
| `app/helpers/person_identity_api_error.ts` (modificar) | Único punto emisor del rechazo + detector `isPersonEmailUniqueValidationError`. No construye cuerpos en otro sitio. |
| `app/controllers/person_controller.ts` (modificar) | C1: una rama más en el catch de `store` (+ espejo en el catch de `update`, que valida con `updatePersonValidator`); C2: enrutar `verifyInfo` al emisor único; crear `@swagger` 422 en ambos endpoints. |
| `app/services/person_service.ts` (modificar) | `verifyInfo` deja de devolver `field: 'email'`; devuelve señal propia sin texto; el tipo impide que el correo vuelva a la lista. |
| `app/helpers/person_identity_lookup.ts` (modificar, 2 líneas) | `PersonIdentityRecheck` y `resolveRacedIdentityField` deben seguir compilando con el nuevo retorno (ignoran la rama del correo). |
| `tests/functional/person_email_response_parity.spec.ts` (crear) | Test de paridad byte a byte + no-divulgación. Prueba igualdad de dos respuestas, no literales. |
| `tests/functional/person_identity_company_scope.spec.ts` (extender) | Añadir CA-5: RFC repetido en otra empresa procede; repetido en la misma responde 610, nunca el código de esta historia. |
| Fuera del repo (crear, entregables regla 7) | `00-brain/04-gsti/03-valanserh/12-seguridad/05-politica-correo-personal-unico.md` y `anexos-USRH1789698261614/guion-soporte-correo-personal.md` (ruta exacta a confirmar con Wilvardo; precedente `anexos-USRH1789018905972/guion-verificacion.md`). |

**Drift verificado el 2026-09-25 contra la rama `feature/USRH1789698261614-correo-personal-sin-delatar` (la hipótesis del spec era del 2026-09-18):** el catálogo real es `PERSON.IDENTITY.001–004` (no `EMP.PERSON.*`); el responder real es `respondPersonIdentityDuplicated(ctx, field)` que devuelve objeto (no `.json()`); `verifyInfo(person, businessUnitId)` ya recibe empresa y ya devuelve unión con `field: 'curp' | 'rfc' | 'nss' | 'email'`; `personEmailExistsGlobally(email, excludePersonId: number)` exige el segundo parámetro como `number` (no opcional); el catch de `update` también valida y también necesita el detector; `resolveRacedIdentityField` filtra `'email'` explícitamente. El plan está escrito contra lo real, no contra la hipótesis.

---

### Task 1: Verificación de arranque (anclas y decisión de código)

**Files:**
- Lectura: `app/helpers/person_email_global_uniqueness.ts`, `app/constants/person_identity_error_codes.ts`, `app/helpers/person_identity_api_error.ts`, `app/services/person_service.ts:225-275`, `app/controllers/person_controller.ts:449-480` y `:772-785`, `app/helpers/person_identity_lookup.ts:35-55`, `app/validators/person.ts:14-28`, `resources/langs/es.json:3041-3048`, `config/i18n.ts:10-16`
- Test: ninguno (es verificación; su entregable es la decisión anotada en la tarea)

**Interfaces:**
- Consumes: nada (es la primera tarea)
- Produces: decisión anotada `CODIGO_CORREO = PERSON.IDENTITY.005 + key no-es-posible-registrar-ese-correo` (a confirmar con Wilvardo porque el spec pedía `EMP.PERSON.EMAIL_NOT_AVAILABLE`, que contra lo real abriría familia nueva); confirmación de firmas reales para las tareas 2–6

- [ ] **Step 1: Ejecutar la verificación de arranque del spec §17 y las anclas reales**

```bash
ls app/helpers/person_email_global_uniqueness.ts app/constants/person_identity_error_codes.ts app/helpers/person_identity_api_error.ts
grep -n "personEmailExistsGlobally" app/helpers/person_email_global_uniqueness.ts app/services/person_service.ts app/validators/person.ts
grep -n "EMAIL_NOT_AVAILABLE\|DUPLICATED_RFC" app/constants/person_identity_error_codes.ts
grep -n "respondPersonIdentityDuplicated\|personIdentityDuplicatedFieldFromValidationError" app/helpers/person_identity_api_error.ts app/controllers/person_controller.ts
grep -n "correo electrónico" app/services/person_service.ts app/controllers/person_controller.ts
grep -n "person_email_not_available" resources/langs/es.json resources/langs/en.json docs/error_codes_documentation.md
```

- [ ] **Step 2: Anotar el resultado esperado y decidir el código**

Esperado: los tres archivos del `ls` existen (ya verificado el 2026-09-25: existen); `personEmailExistsGlobally(email: string, excludePersonId: number)`; el catálogo trae `DUPLICATED_RFC/CURP/NSS + MISSING_COMPANY` y NO trae entrada de correo; `person_service.ts:270-273` trae la rama `field: 'email'`; `person_controller.ts:779-784` trae el `Dato duplicado / correo electrónico` legacy; los `grep` de `person_email_not_available` dan cero resultados. Decisión a dejar anotada: el código nuevo es `PERSON.IDENTITY.005` con `key: 'no-es-posible-registrar-ese-correo'` (sigue la familia real y la regla "no se abre familia nueva"); si Wilvardo exige el `EMP.PERSON.EMAIL_NOT_AVAILABLE` del spec, se escala antes de teclear la Task 2 porque cambia contrato, `@swagger` y `docs/`.

- [ ] **Step 3: Dejar constancia sin commit (es verificación, no código)**

```bash
git status --short
```

Esperado: solo `M pnpm-lock.yaml` y `?? pnpm-workspace.yaml` previos; ningún archivo de la historia tocado todavía. Sin commit.

---

### Task 2: Catálogo + i18n + docs (solo la entrada 422, copy auditado verbatim)

**Files:**
- Modify: `app/constants/person_identity_error_codes.ts`
- Modify: `resources/langs/es.json`
- Modify: `resources/langs/en.json`
- Modify: `docs/error_codes_documentation.md`
- Test: compilación `node ace test tests/functional/person_identity_company_scope.spec.ts` sigue en verde (solo añadido, nada consume aún la entrada)

**Interfaces:**
- Consumes: decisión `CODIGO_CORREO` de la Task 1
- Produces: `PERSON_IDENTITY_ERROR_CODES.EMAIL_NOT_AVAILABLE = 'PERSON.IDENTITY.005'`; `PERSON_IDENTITY_ERRORS.EMAIL_NOT_AVAILABLE = { key, code, status: 422 }`; claves i18n `person_email_not_available_title/detail` en es/en; sección en `docs/` (fuente del `@swagger` de la Task 5)

- [ ] **Step 1: Añadir la entrada 422 al catálogo (sin `title`/`detail` en el catálogo real: viven en i18n)**

```ts
// app/constants/person_identity_error_codes.ts — añadir al objeto PERSON_IDENTITY_ERROR_CODES:
  /** El correo personal no puede registrarse en el expediente por política de la plataforma (USRH1789698261614). */
  EMAIL_NOT_AVAILABLE: 'PERSON.IDENTITY.005',
```

```ts
// app/constants/person_identity_error_codes.ts — la interfaz real es { key, code, status } (sin title/detail).
// Ampliar el Record y añadir la entrada:
export const PERSON_IDENTITY_ERRORS: Record<
  'DUPLICATED_RFC' | 'DUPLICATED_CURP' | 'DUPLICATED_NSS' | 'MISSING_COMPANY' | 'EMAIL_NOT_AVAILABLE',
  PersonIdentityErrorDefinition
> = {
  // ... entradas existentes intactas ...
  EMAIL_NOT_AVAILABLE: { key: 'no-es-posible-registrar-ese-correo', code: PERSON_IDENTITY_ERROR_CODES.EMAIL_NOT_AVAILABLE, status: 422 },
}
```

- [ ] **Step 2: Añadir las dos claves i18n en español, texto auditado carácter a carácter (Anexo B §B.1)**

```json
"person_email_not_available_title": "No es posible registrar ese correo",
"person_email_not_available_detail": "La política de la plataforma no permite registrar ese correo en este expediente. Captura otro correo personal, o deja el campo vacío: el acceso a la aplicación puede otorgarse con el correo institucional del trabajador."
```

- [ ] **Step 3: Añadir las dos claves i18n en inglés, redacción no literal deliberada (Anexo B §B.2, evita `registered`)**

```json
"person_email_not_available_title": "That email cannot be used on this record",
"person_email_not_available_detail": "Platform policy does not allow that email on this record. Enter a different personal email, or leave the field empty: access to the application can be granted with the worker's company email."
```

- [ ] **Step 4: Anexar la sección al final de `docs/error_codes_documentation.md` (solo esta entrada)**

```markdown
---

## Identidad de la persona (`PERSON.IDENTITY.*`)

### PERSON.IDENTITY.005 — No es posible registrar ese correo (`no-es-posible-registrar-ese-correo`)

**HTTP 422.**

**Cuándo:** El correo personal capturado no puede registrarse en el expediente por la política de unicidad global de la plataforma. Se emite en los **dos** caminos de captura, `POST /api/persons` y `PUT /api/persons/:personId`, y **la respuesta es idéntica byte a byte en ambos**: mismo status, mismo cuerpo con el mismo orden de claves y el mismo conjunto de cabeceras.

**Respuesta:**

```json
{
  "title": "No es posible registrar ese correo",
  "detail": "La política de la plataforma no permite registrar ese correo en este expediente. Captura otro correo personal, o deja el campo vacío: el acceso a la aplicación puede otorgarse con el correo institucional del trabajador.",
  "key": "no-es-posible-registrar-ese-correo",
  "code": "PERSON.IDENTITY.005"
}
```

**Acción cliente:** Capturar otro correo personal o dejar el campo vacío — el correo personal es opcional y el acceso a la aplicación puede otorgarse con el correo institucional del trabajador.

**Lo que esta respuesta NO trae, y es deliberado:** no confirma que el correo esté registrado, no dice en qué empresa, no dice desde cuándo, no señala el campo que falló, no enumera qué dato del expediente está repetido, no interpola el correo capturado y no lleva ninguna cabecera `X-RateLimit-*`.

**Alcance declarado:** este mensaje evita confirmar la causa, **pero no elimina la señal**. Quien prueba un correo y recibe este rechazo, y prueba otro y pasa, ya obtuvo la información. El límite de intentos y la bitácora atribuible son de `USRH1789762889970`.
```

- [ ] **Step 5: Compilar y correr el spec vecino para probar que nada se rompió**

```bash
node ace test tests/functional/person_identity_company_scope.spec.ts
```

Esperado: PASS (la entrada nueva no la consume nadie todavía).

- [ ] **Step 6: Commit**

```bash
git add app/constants/person_identity_error_codes.ts resources/langs/es.json resources/langs/en.json docs/error_codes_documentation.md
git commit -m "feat: Agregar catálogo y textos del rechazo del correo personal"
```

---

### Task 3: Emisor único + detector (el corazón de la paridad)

**Files:**
- Modify: `app/helpers/person_identity_api_error.ts`
- Test: compilación + `grep` de emisor único (el test funcional que lo ejercita llega en la Task 4)

**Interfaces:**
- Consumes: `PERSON_IDENTITY_ERRORS.EMAIL_NOT_AVAILABLE` y claves i18n de la Task 2
- Produces: `export function isPersonEmailUniqueValidationError(error: unknown): boolean` y `export function respondPersonEmailNotAvailable(ctx: HttpContext): PersonIdentityErrorBody` — el ÚNICO punto que emite este 422; C1 y C2 solo lo llaman, nunca construyen el cuerpo

- [ ] **Step 1: Añadir el detector al final de `app/helpers/person_identity_api_error.ts` (tipado, cero `any`, molde `legal_document.controller.ts:719-724`)**

```ts
/**
 * `E_VALIDATION_ERROR` cuyo ofensor es `personEmail` con la regla `database.unique` (USRH1789698261614).
 *
 * El literal `The personEmail has already been taken` lo emite `@adonisjs/lucid`
 * (`node_modules/@adonisjs/lucid/build/src/bindings/vinejs.js:21`) y no es del
 * repo: no se reescribe, se intercepta por campo y regla, y el `errors[]`
 * original desaparece de la respuesta porque `rule: 'database.unique'` es el
 * oráculo en forma legible por máquina. No se registra `SimpleMessagesProvider`
 * en `app/validators/person.ts`: duplicaría el texto y podría divergir del de edición.
 */
export function isPersonEmailUniqueValidationError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  if ((error as { code?: string }).code !== 'E_VALIDATION_ERROR') return false
  const messages = (error as { messages?: Array<{ field?: string; rule?: string }> }).messages
  if (!Array.isArray(messages)) return false
  return messages.some((m) => m.field === 'personEmail' && m.rule === 'database.unique')
}
```

- [ ] **Step 2: Añadir el emisor hermano con el estilo real del archivo (devuelve objeto, fija orden `title, detail, key, code`)**

```ts
/**
 * Rechazo del correo personal que no confirma existencia (USRH1789698261614).
 *
 * ÚNICO emisor de este rechazo en todo el API: `POST /api/persons` y
 * `PUT /api/persons/:personId` responden por aquí, y por eso son indistinguibles
 * byte a byte (CA-2). No recibe parámetros de dominio (ni correo, ni personId,
 * ni empresa): no hay nada que interpolar, así que ningún camino puede pasarle
 * algo que el otro no. No añade cabeceras. No cierra el oráculo: quien prueba un
 * correo y recibe rechazo, y prueba otro y pasa, ya obtuvo la información; el
 * control es de USRH1789762889970.
 */
export function respondPersonEmailNotAvailable(ctx: HttpContext): PersonIdentityErrorBody {
  const definition = PERSON_IDENTITY_ERRORS.EMAIL_NOT_AVAILABLE
  ctx.response.status(definition.status)
  return {
    title: ctx.i18n.t('person_email_not_available_title'),
    detail: ctx.i18n.t('person_email_not_available_detail'),
    key: definition.key,
    code: definition.code,
  }
}
```

- [ ] **Step 3: Verificar que compila y que hay un solo emisor**

```bash
node ace test tests/functional/person_identity_company_scope.spec.ts
grep -rn "EMAIL_NOT_AVAILABLE" app/ | grep -v "person_identity_error_codes.ts"
```

Esperado: spec en verde; el `grep` lista solo `app/helpers/person_identity_api_error.ts`.

- [ ] **Step 4: Commit**

```bash
git add app/helpers/person_identity_api_error.ts
git commit -m "feat: Agregar emisor único y detector del correo personal"
```

---

### Task 4: Test de paridad (el criterio que define la historia, en rojo primero)

**Files:**
- Create: `tests/functional/person_email_response_parity.spec.ts`
- Test: `tests/functional/person_email_response_parity.spec.ts`

**Interfaces:**
- Consumes: rutas reales `POST /api/persons` y `PUT /api/persons/:personId`; helpers `createTenantActor`, `cleanupTenantActor`, `businessUnitHeaders`, `grantModulePermissions` de `tests/helpers/tenant_actor.ts`; módulo y permisos de personas según `tests/functional/person_identity_company_scope.spec.ts:1-67`
- Produces: el aserto `JSON.stringify(postBody) === JSON.stringify(putBody)` que las Tasks 5–6 deben poner en verde; listas `PALABRAS_PROHIBIDAS` y `FUGAS_TECNICAS` del Anexo B §B.5

- [ ] **Step 1: Escribir el spec ( Dos empresas, mismo correo; compara las dos respuestas entre sí, no contra un literal)**

```ts
// tests/functional/person_email_response_parity.spec.ts
import { test } from '@japa/runner'
import {
  createTenantActor,
  cleanupTenantActor,
  businessUnitHeaders,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

test.group('Paridad del rechazo del correo personal (USRH1789698261614)', (group) => {
  let actorA: TenantActor | null = null
  let actorB: TenantActor | null = null

  group.each.setup(async () => {
    actorA = await createTenantActor('parity-a')
    actorB = await createTenantActor('parity-b')
  })
  group.each.teardown(async () => {
    await cleanupTenantActor(actorA)
    await cleanupTenantActor(actorB)
    actorA = null
    actorB = null
  })

  test('CA-2 — POST y PUT con el mismo correo ocupado responden byte a byte igual', async ({
    assert,
    client,
  }) => {
    const TakenEmail = `parity-taken-${Date.now()}@gsti-tests.local`
    // Siembra: expediente vivo en la empresa A con el correo ocupado.
    const seed = await client
      .post('/api/persons')
      .headers(businessUnitHeaders(actorA!))
      .loginAs(actorA!.user)
      .json({ personFirstname: 'Parity', personLastname: 'Seed', personEmail: TakenEmail })
    assert.equal(seed.status(), 201)

    // Expediente propio en B para el PUT (correo libre al crearlo).
    const own = await client
      .post('/api/persons')
      .headers(businessUnitHeaders(actorB!))
      .loginAs(actorB!.user)
      .json({ personFirstname: 'Parity', personLastname: 'Own', personEmail: `parity-own-${Date.now()}@gsti-tests.local` })
    assert.equal(own.status(), 201)
    const ownId = own.body().data.person.personId as number

    const post = await client
      .post('/api/persons')
      .headers(businessUnitHeaders(actorB!))
      .loginAs(actorB!.user)
      .json({ personFirstname: 'Parity', personLastname: 'Probe', personEmail: TakenEmail })
    const put = await client
      .put(`/api/persons/${ownId}`)
      .headers(businessUnitHeaders(actorB!))
      .loginAs(actorB!.user)
      .json({ personEmail: TakenEmail })

    assert.equal(post.status(), 422)
    assert.equal(put.status(), 422)
    assert.equal(JSON.stringify(post.body()), JSON.stringify(put.body()))
    assert.deepEqual(Object.keys(post.body()), ['title', 'detail', 'key', 'code'])
  })
})
```

Nota: el payload mínimo (`personFirstname/personLastname/personEmail`), el login (`loginAs(actor.user)`), el header de empresa (`businessUnitHeaders`) y las concesiones del rol (si el módulo de personas exige permiso, sembrar con `grantModulePermissions` como hace `person_identity_company_scope.spec.ts:1-67`) se copian de ese spec vecino; si el alta mínima exige más campos, se añaden del vecino sin inventar nombres.

- [ ] **Step 2: Correrlo y confirmar que falla (es lo esperado: C1 habla inglés de librería, C2 enumera en español)**

```bash
node ace test tests/functional/person_email_response_parity.spec.ts
```

Esperado: FAIL en el `JSON.stringify` (cuerpos distintos). Si ya pasa, parar: algo quedó mal sembrado (mismo tenant, correo libre, o 400 por falta de empresa) y el test mentiría.

- [ ] **Step 3: Commit del test en rojo (documenta el punto de partida)**

```bash
git add tests/functional/person_email_response_parity.spec.ts
git commit -m "test: Agregar spec de paridad del rechazo del correo personal"
```

---

### Task 5: C1 — interceptar el alta (y su espejo en el catch de edición)

**Files:**
- Modify: `app/controllers/person_controller.ts` (catch de `store` ~`:449-480`, catch de `update` ~`:848-875`, `@swagger` de ambos)
- Test: `tests/functional/person_email_response_parity.spec.ts` (mitad POST)

**Interfaces:**
- Consumes: `isPersonEmailUniqueValidationError` + `respondPersonEmailNotAvailable` de la Task 3
- Produces: `POST /api/persons` con correo ocupado → `422 {title, detail, key, code}` sin `type/message/error/errors[]`; el `E_VALIDATION_ERROR` genérico intacto para sintaxis/longitud/máscara (CA-8)

- [ ] **Step 1: Añadir la rama en el catch de `store`, después del guard de CURP/RFC/NSS y antes del `E_VALIDATION_ERROR` genérico**

```ts
// app/controllers/person_controller.ts — catch de store, tras el bloque racedField:
      // USRH1789698261614 — solo el correo personal. Mismo emisor que el PUT, y
      // por eso las dos respuestas son idénticas byte a byte (CA-2). El errors[]
      // de @adonisjs/lucid no se reescribe: no se llega a él.
      if (isPersonEmailUniqueValidationError(error)) {
        return respondPersonEmailNotAvailable(ctx)
      }
```

```ts
// app/controllers/person_controller.ts — imports, junto al bloque de person_identity_api_error:
import {
  isPersonEmailUniqueValidationError,
  respondPersonEmailNotAvailable,
} from '#helpers/person_identity_api_error'
```

- [ ] **Step 2: Espejar la misma rama en el catch de `update` (su `validateUsing(updatePersonValidator)` también puede fallar por `personEmail.database.unique`)**

```ts
// app/controllers/person_controller.ts — catch de update, mismo sitio (tras racedField, antes del E_VALIDATION_ERROR genérico):
      if (isPersonEmailUniqueValidationError(error)) {
        return respondPersonEmailNotAvailable(ctx)
      }
```

- [ ] **Step 3: Crear el `@swagger` 422 en `store` y `update` (hoy no existe; se añade tras el `403` de datos sensibles, misma forma)**

```
   *       '422':
   *         description: La política de la plataforma no permite registrar ese correo personal. Respuesta idéntica en POST y PUT.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   example: No es posible registrar ese correo
   *                 detail:
   *                   type: string
   *                   example: La política de la plataforma no permite registrar ese correo en este expediente. Captura otro correo personal, o deja el campo vacío: el acceso a la aplicación puede otorgarse con el correo institucional del trabajador.
   *                 key:
   *                   type: string
   *                   example: no-es-posible-registrar-ese-correo
   *                 code:
   *                   type: string
   *                   example: PERSON.IDENTITY.005
```

- [ ] **Step 4: Correr el spec y confirmar media paridad (POST ya habla el idioma nuevo; PUT aún no)**

```bash
node ace test tests/functional/person_email_response_parity.spec.ts
```

Esperado: el POST ya es `422 {title, detail, key, code}`; el test sigue FAIL en el diff (falta la Task 6). Si el POST sigue trayendo `errors[]`, el detector no casó: revisar `field === 'personEmail' && rule === 'database.unique'` contra `error.messages` real.

- [ ] **Step 5: Commit**

```bash
git add app/controllers/person_controller.ts
git commit -m "feat: Rechazar el alta con correo ocupado sin confirmar existencia"
```

---

### Task 6: C2 — sacar el correo de `verifyInfo` y enrutarlo al emisor único (bloque caro)

**Files:**
- Modify: `app/services/person_service.ts` (tipo + `verifyInfo:225-275`)
- Modify: `app/helpers/person_identity_lookup.ts` (`PersonIdentityRecheck:35-40` y `resolveRacedIdentityField:50-55`)
- Modify: `app/controllers/person_controller.ts` (enrutado `update` `:772-784`, `racedIdentityField:59-70`)
- Test: `tests/functional/person_email_response_parity.spec.ts` (pasa a verde aquí)

**Interfaces:**
- Consumes: `personEmailExistsGlobally(email, excludePersonId: number)` (segundo parámetro `number` obligatorio; en alta se pasa `0`); emisor de la Task 3
- Produces: `verifyInfo(person, businessUnitId): Promise<{ status: 200 } | { status: 400; missingCompany: true } | { status: 422; field: 'curp' | 'rfc' | 'nss' } | { status: 422; reason: 'email-not-available' }>`; el correo precede a duplicados y nunca se acumula

- [ ] **Step 1: Estrechar el tipo de recheck en `app/helpers/person_identity_lookup.ts` (el correo sale del campo enumerable)**

```ts
// Antes:
  | { status: 422; field: PersonIdentityField | 'email' }
// Después:
  | { status: 422; field: PersonIdentityField }
  | { status: 422; reason: 'email-not-available' }
```

```ts
// resolveRacedIdentityField: la rama del correo no es un dato enumerable, se ignora y manda el índice:
export function resolveRacedIdentityField(
  recheck: PersonIdentityRecheck | null,
  indexField: PersonIdentityField
): PersonIdentityField {
  if (recheck && recheck.status === 422 && 'field' in recheck) return recheck.field
  return indexField
}
```

- [ ] **Step 2: Reescribir `verifyInfo` en `app/services/person_service.ts` (el correo sale de `duplicates`, señal propia sin texto, precede al resto)**

```ts
  /**
   * Comprueba los datos de identidad del expediente antes de escribirlo (USRH1789698261614).
   *
   * Devuelve una unión discriminada, no un cuerpo de respuesta: traducir a HTTP
   * es del controlador, y en el caso del correo, del emisor único
   * `respondPersonEmailNotAvailable` compartido con `POST /api/persons`, que es
   * lo que hace que los dos caminos respondan byte a byte igual. El correo se
   * comprueba GLOBAL a propósito (puede ser credencial) y precede a CURP/RFC/NSS:
   * si coinciden ambos, responde el que no revela; nunca se acumulan.
   */
  async verifyInfo(
    person: Person,
    businessUnitId: number | null | undefined
  ): Promise<
    | { status: 200 }
    | { status: 400; missingCompany: true }
    | { status: 422; field: 'curp' | 'rfc' | 'nss' }
    | { status: 422; reason: 'email-not-available' }
  > {
    if (!businessUnitId) return { status: 400, missingCompany: true }

    const excludePersonId = person.personId > 0 ? person.personId : 0

    if (person.personEmail && person.personEmail.trim() !== '') {
      if (await personEmailExistsGlobally(person.personEmail, excludePersonId)) {
        return { status: 422, reason: 'email-not-available' }
      }
    }

    if (person.personCurp && person.personCurp.trim() !== '') {
      const exists = await livePersonWithIdentityExists(
        'curp',
        blindIndex(person.personCurp),
        businessUnitId,
        excludePersonId
      )
      if (exists) return { status: 422, field: 'curp' }
    }

    if (person.personRfc && person.personRfc.trim() !== '') {
      const exists = await livePersonWithIdentityExists(
        'rfc',
        blindIndex(person.personRfc),
        businessUnitId,
        excludePersonId
      )
      if (exists) return { status: 422, field: 'rfc' }
    }

    if (person.personImssNss && person.personImssNss.trim() !== '') {
      const exists = await livePersonWithIdentityExists(
        'nss',
        blindIndex(person.personImssNss),
        businessUnitId,
        excludePersonId
      )
      if (exists) return { status: 422, field: 'nss' }
    }

    return { status: 200 }
  }
```

Notas: `blindIndex` sigue importado (CURP/RFC/NSS lo usan); el `PUT` con el correo propio sigue 200 porque se excluye con `excludePersonId`; con la unión, un `duplicates.push('correo electrónico')` futuro deja de compilar porque ya no existe esa lista.

- [ ] **Step 3: Enrutar en `update` al mismo emisor y retirar el eco legacy (`data` queda sin uso: se pierde el binding, no la llamada)**

```ts
// app/controllers/person_controller.ts — reemplaza el bloque :772-784:
      const identityCheck = await personService.verifyInfo(person, updateCompanyId)
      if (identityCheck.status === 400) {
        return respondPersonIdentityMissingCompany(ctx)
      }
      // USRH1789698261614 — la rama del correo llama al MISMO emisor que store:
      // es lo que hace las respuestas idénticas byte a byte, y el emisor no
      // recibe ningún dato de dominio, así que ningún camino puede pasarle
      // algo que el otro no.
      if (identityCheck.status === 422 && 'reason' in identityCheck) {
        return respondPersonEmailNotAvailable(ctx)
      }
      if (identityCheck.status === 422) {
        return respondPersonIdentityDuplicated(ctx, identityCheck.field)
      }
```

```ts
// app/controllers/person_controller.ts — la línea :769 pierde el binding (data solo se usaba en el eco :783):
      await request.validateUsing(updatePersonValidator)
```

- [ ] **Step 4: Ajustar `racedIdentityField:59-70` al nuevo retorno (su `recheck.field` ya no admite `'email'`)**

```ts
async function racedIdentityField(
  indexField: PersonIdentityField,
  i18n: I18n,
  target: IdentityRecheckTarget | null
): Promise<PersonIdentityField> {
  if (!target) return indexField
  try {
    const recheck = await new PersonService(i18n).verifyInfo(target.person, target.companyId)
    return resolveRacedIdentityField(recheck, indexField)
  } catch {
    return indexField
  }
}
```

- [ ] **Step 5: Correr el spec de paridad: debe ponerse en verde aquí**

```bash
node ace test tests/functional/person_email_response_parity.spec.ts
```

Esperado: PASS, con el diff de los dos cuerpos vacío. Si falla por orden de claves, fijar el orden en el emisor (`title, detail, key, code`), no en los llamadores.

- [ ] **Step 6: Commit**

```bash
git add app/services/person_service.ts app/helpers/person_identity_lookup.ts app/controllers/person_controller.ts
git commit -m "feat: Enrutar la edición del correo al emisor único sin enumerar"
```

---

### Task 7: Endurecer el spec (no-divulgación, frontera 610, regresiones y cierre mecánico)

**Files:**
- Modify: `tests/functional/person_email_response_parity.spec.ts` (añadir CA-3, CA-6, CA-7, CA-8)
- Modify: `tests/functional/person_identity_company_scope.spec.ts` (añadir CA-5)
- Test: ambos specs + los 2 specs en riesgo por status

**Interfaces:**
- Consumes: cuerpo ya unificado `{title, detail, key, code}` de la Task 6; código 610 `PERSON.IDENTITY.001/002/003`
- Produces: evidencia del DoD (diff vacío, ausencia de `errors`/`rule`/prohibidas, frontera RFC, specs en riesgo en verde)

- [ ] **Step 1: Añadir al spec de paridad los asertos de contenido (después del aserto de igualdad, sobre el cuerpo ya unificado)**

```ts
const PALABRAS_PROHIBIDAS = [
  'ya existe',
  'duplicado',
  'en uso',
  'tomado',
  'otro trabajador',
  'un trabajador',
  'otra empresa',
  'otra cuenta',
  'registrado',
  'disponible',
  'ocupado',
  'pertenece',
]

const FUGAS_TECNICAS = [
  'errors',
  'rule',
  'database.unique',
  'personEmail',
  'has already been taken',
  'correo electrónico',
  'Dato duplicado',
  'Ya existe',
  'message',
  'type',
  'data',
]
```

```ts
// Tras el assert del diff vacío, sobre post.body():
const cuerpo = JSON.stringify(post.body())
for (const palabra of PALABRAS_PROHIBIDAS) {
  assert.notInclude(cuerpo.toLowerCase(), palabra)
}
for (const fuga of FUGAS_TECNICAS) {
  assert.notInclude(cuerpo, fuga)
}
assert.notInclude(cuerpo, TakenEmail)
assert.isUndefined(post.headers()['x-ratelimit-limit'])
// Sin fechas ISO ni dd/mm/aaaa:
assert.notMatch(cuerpo, /\d{4}-\d{2}-\d{2}/)
assert.notMatch(cuerpo, /\d{2}\/\d{2}\/\d{4}/)
// CA-3: sin type/message/data:
assert.isUndefined((post.body() as Record<string, unknown>).type)
assert.isUndefined((post.body() as Record<string, unknown>).message)
assert.isUndefined((post.body() as Record<string, unknown>).data)
// CA-7: un correo libre pero rechazado por regla que consulta people colapsa igual
// (se prueba provocando el mismo 422 con otro correo ocupado de otra siembra y
// comparando code/key/title/detail; si el code distinguiera, el code sería el oráculo).
// CA-8: correo inválido / >200 chars / con máscara responde validación específica, nunca PERSON.IDENTITY.005.
const invalido = await client
  .post('/api/persons')
  .headers(businessUnitHeaders(actorB!))
  .loginAs(actorB!.user)
  .json({ personFirstname: 'Parity', personLastname: 'Bad', personEmail: 'no-es-un-correo' })
assert.equal(invalido.status(), 422)
assert.notEqual(invalido.body()?.code, 'PERSON.IDENTITY.005')
```

Advertencia copiada del Anexo B §B.5: `'trabajador'` solo se asierta como `'otro trabajador'` / `'un trabajador'`, nunca suelto, porque el `detail` aprobado cierra con "del trabajador"; `'registrado'` (participio) sí, `'registr'` (raíz) no, porque el copy usa "registrar" (infinitivo, el acto).

- [ ] **Step 2: Extender `person_identity_company_scope.spec.ts` con CA-5 (frontera con la 610)**

```ts
test('CA-5 — RFC repetido en otra empresa procede; en la misma responde 610, nunca el correo', async ({
  assert,
  client,
}) => {
  // Siembra RFC R1 en A, alta en B con R1 y correo libre → 201 y sin PERSON.IDENTITY.005.
  // Segunda alta en B con R1 → 422 con code PERSON.IDENTITY.001 (o 002/003 según campo) y nunca PERSON.IDENTITY.005.
})
```

El cuerpo del test sigue el patrón de `criterio 2` del mismo archivo (misma siembra de actor, mismo payload mínimo); solo cambian los RFC/correos y los `assert` del `code`.

- [ ] **Step 3: Correr los dos specs y los dos specs en riesgo (asertan 422 por status, no por cuerpo)**

```bash
node ace test tests/functional/person_email_response_parity.spec.ts tests/functional/person_identity_company_scope.spec.ts
node ace test tests/functional/employees/person_store_subject_type_permission_gate.spec.ts tests/functional/employees/employees_sensitive_mask_echo_http.spec.ts
```

Esperado: todo PASS. Si un spec en riesgo cae por cuerpo, es regresión real: no se ajusta el spec, se ajusta el enrutado.

- [ ] **Step 4: Ejecutar las comprobaciones de cierre del Anexo A §A.10 adaptadas a lo real**

```bash
grep -rn "EMAIL_NOT_AVAILABLE" app/ | grep -v "person_identity_error_codes.ts"
grep -rn "correo electrónico" app/ || true
grep -rn "personService.verifyInfo\|personService\.verifyInfo" app/ tests/ || true
grep -n ": any\|as any" app/services/person_service.ts app/helpers/person_identity_api_error.ts app/helpers/person_identity_lookup.ts || true
git diff --name-only | grep -E "person_routes|probe_throttle|probe_log|employee_service|exceptions/handler" || true
```

Esperado: solo el emisor en el primer `grep`; cero `correo electrónico` en `app/`; `verifyInfo` de `PersonService` solo en `person_controller.ts`; cero `any`; cero archivos del 429.

- [ ] **Step 5: Commit**

```bash
git add tests/functional/person_email_response_parity.spec.ts tests/functional/person_identity_company_scope.spec.ts
git commit -m "test: Endurecer paridad con no-divulgación y frontera por empresa"
```

---

### Task 8: Política escrita y guion de soporte (entregables regla 7, fuera del repo)

**Files:**
- Create: `00-brain/04-gsti/03-valanserh/12-seguridad/05-politica-correo-personal-unico.md` (ruta según spec §18; si el árbol real difiere, crear la ruta y avisar a Wilvardo por la vía acordada)
- Create: `anexos-USRH1789698261614/guion-soporte-correo-personal.md` (junto a los anexos A y B; precedente `anexos-USRH1789018905972/guion-verificacion.md`)
- Test: lectura cruzada contra el cuerpo real emitido (copiar `title/detail/key/code` del `docs/` de la Task 2; prohibido parafrasear)

**Interfaces:**
- Consumes: texto auditado de la Task 2; residuales declarados (oráculo no cerrado, canal temporal sin índice, `blindIndex` sin normalizar puntos/`+`/acentos, carga masiva que no comprueba)
- Produces: los dos documentos que el DoD exige para cerrar la historia; sin ellos la entrega no cumple aunque el código esté en verde

- [ ] **Step 1: Escribir la política (fija números y nombres; declara residuales sin suavizar)**

```markdown
# Política de correo personal único (USRH1789698261614)

1. El correo personal del expediente es único en toda la plataforma y no se acota por empresa.
2. El rechazo no confirma existencia ni dice empresa, fecha o campo; el texto exacto es el de `docs/error_codes_documentation.md` (`PERSON.IDENTITY.005`).
3. Umbral de sondeo, responsable nombrado, cadencia de revisión y retención del registro (dato seudonimizado): [a fijar con Wilvardo antes de cerrar; sin estos cuatro la política no cierra].
4. Residuales: el oráculo no queda cerrado (probar un correo y otro da señal; el control es USRH1789762889970); canal temporal mientras no exista el índice de búsqueda; `blindIndex` no normaliza puntos, `+` ni acentos; la carga masiva no comprueba y puede crear la fila colisionada en silencio.
```

- [ ] **Step 2: Escribir el guion (la salida práctica primero, lo que no se dice explícito)**

```markdown
# Guion de soporte — "No es posible registrar ese correo" (USRH1789698261614)

- Qué se dice: es una política de la plataforma, no un error de captura; el correo personal es opcional; la salida es capturar otro correo personal o dejar el campo vacío y otorgar el acceso con el correo institucional del trabajador.
- Qué NO se dice: nunca confirmar si el correo existe, en qué empresa está, desde cuándo, ni qué dato está repetido; nunca enunciar la regla de unicidad ("cada correo solo una vez") porque convierte el rechazo en silogismo.
- Si insiste: repetir la salida práctica; ofrecer dejar el campo vacío ahora y completar después; no pedirle que pruebe variantes del correo.
- Cuándo escalar y a quién: [nombre/cola a fijar con Wilvardo]; escalar sin anotar el correo probado en texto libre.
- Consecuencia operativa: el mensaje puede dispararse contra una fila creada en silencio por la carga masiva, que no comprueba nada; el expediente colisionado puede no estar a la vista de nadie.
```

- [ ] **Step 3: Verificar que el guion cierra el caso CA-9 (lectura cruzada, no automatizable)**

Releer el guion buscando cada palabra prohibida del Anexo B y cada enunciado de unicidad; si aparece "único/unicidad/solo una vez", reescribir ese tramo (es el fallo A-04 auditado). Confirmar que la primera salida ofrecida es la práctica (regla 8), no "contacta a soporte" (fallo A-06 auditado).

- [ ] **Step 4: Commit (si viven en otro repo/árbol, entregar por la vía que indique Wilvardo y anotarlo; no se versionan a medias)**

```bash
git add 00-brain/04-gsti/03-valanserh/12-seguridad/05-politica-correo-personal-unico.md anexos-USRH1789698261614/guion-soporte-correo-personal.md
git commit -m "docs: Agregar política y guion del rechazo del correo personal"
```

---

### Task 9: Manual QA API (playbook manual según regla `manual-qa-api`)

**Files:**
- Create: `docs/superpowers/plans/2026-09-25-correo-personal-sin-delatar-qa-api.md`
- Modify: `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (solo añadir usuarios/datos `qa-correo-*`; no crear seeder nuevo)
- Lectura previa obligatoria: `docs/superpowers/plans/2026-09-22-unicidad-identidad-por-empresa-qa-api.md` (constantes del mismo API)
- Test: el manual lo recorre una persona, no el agente (regla `manual-qa-execution`); el agente levanta ambiente + seeder y entrega el playbook

**Interfaces:**
- Consumes: cuerpo real `422 {title, detail, key, code}` de la Task 2; códigos `PERSON.IDENTITY.005` (correo) y `PERSON.IDENTITY.001` (RFC 610)
- Produces: playbook con Problema/Solución/Ejemplo + Preparar + 5 escenarios con endpoint y response exacto + Checklist; seeder QA con usuarios `qa-correo-capturista-a/b@gsti-tests.local`

- [ ] **Step 1: Tomar las constantes del manual anterior del mismo API (no inventarlas)**

Del manual `2026-09-22-unicidad-identidad-por-empresa-qa-api.md`: URL base `http://127.0.0.1:3333`; auth por header `Authorization: Bearer <token>` asumida resuelta por el cliente (no se documenta login); header de empresa `X-Business-Unit-Id: <identificador público>`; seeder único `database/seeders/_tmp_do_not_commit_qa_seeder.ts` corrido con `node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts`; dominio `gsti-tests.local` y contraseña `password`; ids nunca hardcodeados (se resuelven con `SELECT`). Si al implementar la URL, el esquema de auth o la contraseña difieren, manda lo real y se corrige el manual.

- [ ] **Step 2: Extender el seeder QA (mismo archivo, sin crear uno nuevo)**

```ts
// database/seeders/_tmp_do_not_commit_qa_seeder.ts — añadir (nombres ilustrativos, seguir el patrón del bloque qa-ident-*):
// Empresas: 'qa-correo-a' y 'qa-correo-b' (slugs); usuarios qa-correo-capturista-a@gsti-tests.local y
// qa-correo-capturista-b@gsti-tests.local con contraseña `password`, uno por variante (A siembra, B prueba);
// expediente vivo en A con personEmail 'qa-correo-ocupado@gsti-tests.local' (el correo que B intentará repetir),
// expediente propio en B con correo libre para el PUT, y expediente en A con RFC 'QAID800101AAA' para CA-5.
// Re-correr el seeder restaura A y deja B sin el correo ocupado repetido para que los escenarios se repitan.
```

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

```sql
SELECT business_unit_slug, business_unit_public_id FROM business_units WHERE business_unit_slug IN ('qa-correo-a', 'qa-correo-b');
SELECT person_id, person_lastname, business_unit_id FROM people WHERE person_email = 'qa-correo-ocupado@gsti-tests.local';
```

- [ ] **Step 3: Escribir el manual con la estructura mínima de la regla (contrato, no código)**

```markdown
# Prueba manual API — El correo ocupado se rechaza igual en alta y edición, sin confirmar que existe

**Problema:** cuando una empresa da de alta a un trabajador con un correo personal que otra empresa ya registró, el sistema lo rechaza, y el rechazo de hoy confirma que ese correo está registrado en algún lado. Además el alta y la edición responden distinto: uno señala el campo y el otro enumera qué dato está repetido, así que quien prueba correos se va por el camino que más le dice.

**Solución:** los dos momentos responden exactamente lo mismo, palabra por palabra: que ese correo no puede registrarse por política de la plataforma y que se use otro, sin decir que exista, ni en qué empresa, ni desde cuándo. El correo personal sigue único en toda la plataforma; el RFC sigue acotado por empresa.

Ejemplo: es como si en la tienda de la esquina te dijeran "esa tarjeta no pasa aquí, usa otra" tanto en caja como en devoluciones, sin decirte si la tarjeta existe ni de quién es.

(Se prueba con Postman, Insomnia o Bruno. URL base `http://127.0.0.1:3333`. La autenticación se asume resuelta por tu cliente.)

## 1. Preparar

[Comando del Step 2 + tabla: B = qa-correo-capturista-b@gsti-tests.local / password / capturista que prueba; A = qa-correo-capturista-a@gsti-tests.local / password / empresa que ya tiene el correo. + los dos SELECT del Step 2.]

## 2. Escenario 1 (CA-1) — Alta en B con el correo de A: 422 sin confirmar

Usuario: **B**. `POST /api/persons`, headers `Authorization: Bearer <token de B>`, `X-Business-Unit-Id: <id público de B>`.

```json
{ "personFirstname": "QA", "personLastname": "CorreoProbe", "personSecondLastname": "Correo", "personEmail": "qa-correo-ocupado@gsti-tests.local" }
```

Response exacto: `422`

```json
{
  "title": "No es posible registrar ese correo",
  "detail": "La política de la plataforma no permite registrar ese correo en este expediente. Captura otro correo personal, o deja el campo vacío: el acceso a la aplicación puede otorgarse con el correo institucional del trabajador.",
  "key": "no-es-posible-registrar-ese-correo",
  "code": "PERSON.IDENTITY.005"
}
```

Qué significa cada dato:
- `title`: qué pasó, en palabras del negocio.
- `detail`: qué hacer (capturar otro correo o dejar el campo vacío y usar el correo de la empresa para el acceso).
- `key`: la clave estable del rechazo (siempre la misma en alta y edición).
- `code`: el código interno del catálogo (siempre `PERSON.IDENTITY.005` aquí).

## 3. Escenario 2 (CA-2/CA-3) — El mismo correo editando un expediente propio: idéntico byte a byte

Usuario: **B**. `PUT /api/persons/<person_id del expediente propio en B>` (resolver con `SELECT person_id FROM people WHERE person_email = '<correo libre de B>';`), mismos headers con el id de B, body `{"personEmail": "qa-correo-ocupado@gsti-tests.local"}`. Response exacto: el mismo `422` con el mismo cuerpo del Escenario 1, carácter a carácter (mismo orden de claves) y sin `correo electrónico`, `Ya existe`, `Dato duplicado`, `message`, `type` ni `data`. (Los datos son los ya explicados en el Escenario 1.)

## 4. Escenario 3 (CA-4) — Alta con correo libre: procede

Usuario: **B**. `POST /api/persons` con `"personEmail": "qa-correo-libre-<fecha>@gsti-tests.local"`. Response exacto: `201` con la forma de éxito de siempre (`type: success`, `title: Persons`, `message: The person was created successfully`). Qué significa lo nuevo aquí: `data.person.personId`: el número del expediente recién creado en tu empresa.

## 5. Escenario 4 (CA-5) — RFC repetido en otra empresa: procede y no trae el mensaje del correo

Usuario: **B**. `POST /api/persons` con el RFC de A (`QAID800101AAA`) y correo libre. Response exacto: `201` (el RFC está acotado por empresa) y el cuerpo no trae `PERSON.IDENTITY.005`. (Los datos son los ya explicados en el Escenario 3.)

## 6. Escenario 5 (CA-9, soporte) — El capturista llama: se cierra con la salida práctica

Con el guion de la Task 8 a la mano, verificar que el `detail` del Escenario 1 alcanza para responder sin revelar la causa y ofreciendo primero dejar el campo vacío / usar el correo de la empresa. Sin endpoint: es lectura cruzada guion ↔ respuesta. No observable con seeders: el estado vacío (ningún correo ocupado) no se puede provocar aquí porque el seeder siempre deja uno ocupado; se declara y no se le inventan pasos.

## 7. Checklist

- [ ] Escenario 1 — Alta con correo de otra empresa: 422 con `key`/`code` del correo, sin confirmar existencia
- [ ] Escenario 2 — Edición con el mismo correo: cuerpo idéntico al del alta, sin enumerar el dato
- [ ] Escenario 3 — Alta con correo libre: 201 sin fricción
- [ ] Escenario 4 — RFC de otra empresa: 201 sin el mensaje del correo
- [ ] Escenario 5 — Soporte cierra con guion + política, sin revelar la causa
```

Reglas aplicadas al redactar: endpoints + bodies pegables + response exacto (nunca "debería fallar"); prohibido rutas de archivos, clases, servicios, validadores o "revisa el código"; cada dato explicado una sola vez en lenguaje llano; ejemplo cotidiano de 2–4 líneas; solo alcance de la HU (sin límite de intentos ni bitácora: son de la hermana); sin interruptor global (nada acotado fuera del tenant), así que sin paso de limpieza.

- [ ] **Step 4: Levantar ambiente y seeder y entregar sin recorrer (lo camina una persona)**

```bash
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Esperado: seeder en verde; el manual queda listo para que la persona lo recorra en su cliente API. No automatizar el recorrido con Playwright/`webapp-testing` salvo que se pida explícitamente para esta tarea puntual.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-09-25-correo-personal-sin-delatar-qa-api.md database/seeders/_tmp_do_not_commit_qa_seeder.ts
git commit -m "docs: Agregar manual QA del rechazo del correo personal"
```

---

## Self-Review (corrido al escribir el plan)

1. **Cobertura del spec:** CA-1 → Tasks 2+3+5; CA-2 (paridad, el definitorio) → Task 4 en rojo + Tasks 5–6 que lo ponen en verde con diff vacío; CA-3 → Task 7 (sin `correo electrónico`/`Ya existe`/`message`/`type`/`data`); CA-4 (alta legítima + vacío/nulo) → Tasks 5–6 (comprobación no corre con vacío: `.optional()` + `trim() !== ''` en servicio y `personEmailExistsGlobally` retorna `false` con vacío) + Task 7; CA-5 (frontera RFC) → Task 7 extensión del spec 610; CA-6 (abuso, prohibidas + técnicas + sin correo/fechas/headers) → Task 7; CA-7 (code no-oráculo) → Tasks 3+7 (emisor sin parámetros, colapso en una sola respuesta); CA-8 (sintaxis/longitud/máscara específico) → Task 5 (genérico intacto) + Task 7; CA-9 (soporte cierra) → Task 8. Manual QA API (regla `manual-qa-api` + `manual-qa-execution`: lo recorre una persona) → Task 9, con las constantes del manual 610 (`http://127.0.0.1:3333`, Bearer, `X-Business-Unit-Id`, seeder único, `gsti-tests.local`/`password`) y 5 escenarios (CA-1, CA-2/CA-3, CA-4, CA-5, CA-9). Reglas 1–8 cubiertas en el orden de trabajo del spec §14.
2. **Barrido de placeholders:** sin `TBD/TODO`, sin "manejo apropiado" genérico, sin "tests para lo anterior" sin código, sin "similar a Task N" (cada código va repetido en su tarea), sin tipos/funciones sin definir (firmas reales verificadas el 2026-09-25). Ajustes conscientes vs. la hipótesis del spec, declarados arriba y en la Task 1: `PERSON.IDENTITY.005` en vez de `EMP.PERSON.*`; responder que devuelve objeto; `field` en minúsculas; `excludePersonId: number` obligatorio; espejo en el catch de `update`; `resolveRacedIdentityField` con `'field' in recheck`.
3. **Consistencia de tipos:** `EMAIL_NOT_AVAILABLE` añadido a ambos lados del `Record` o no compila (candado heredado); `PersonIdentityRecheck` y `verifyInfo` usan la misma unión (`field: 'curp'|'rfc'|'nss'` + `reason: 'email-not-available'`); `respondPersonIdentityDuplicated(ctx, field)` y `respondPersonEmailNotAvailable(ctx)` reciben exactamente lo que sus llamadores les pasan; claves i18n planas sin prefijo en emisor, catálogo y `docs/` con el mismo texto carácter a carácter en español.
