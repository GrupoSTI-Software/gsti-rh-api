# Lectura pública de documentos legales (USRH1790610965572) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exponer `GET /api/public/legal-documents/current` sin sesión, limitado a `terms_conditions` y `privacy_notice`, con saneado al servir, limitador 60/min por IP y errores de shape estándar.

**Architecture:** Endpoint nuevo en el slice existente `app/modules/legal-documents/` con archivos propios `*_public.*` (controller y rutas del módulo los reescribe USRH1790610965394 y no se tocan). El 429 del limitador se traduce a contrato en una rama nueva del exception handler, acotada por ruta, con helper propio — mismo molde que `auth_login_request_errors.ts`. Sin migraciones, sin seeders, sin caché en proceso (DA-8).

**Tech Stack:** Adonis 6, VineJS, `@adonisjs/limiter` (almacén `memory` heredado), `sanitize-html`, japa.

**Spec:** `/Users/noeabelvargaslopez/Downloads/spec-USRH1790610965572.md` — el plan argumenta desde él; el ejecutor lee **ambos**. Los `detail` exactos, cuerpos de error e i18n en inglés están en el spec (§5 CA-4 a CA-8, §11) y se copian verbatim de ahí, no se improvisan.

**Validación de anclas:** hecha el 2026-09-30 contra `multitenant` — firmas, rutas, limiter, handler, i18n y tests espejo coinciden con el spec. Si al ejecutar algo se movió, el drift trivial se corrige al momento; el cambio de alcance/contrato se escala a Wilvardo.

## Global Constraints

- **No tocar** (censo §14): `legal_document.controller.ts`, `legal_document.routes.ts`, `legal_document_error_codes.ts`, `start/kernel.ts`, `config/cors.ts`, `config/limiter.ts`, `legal_document.service.ts`, `validators/legal_document_query.validator.ts`, `dto/legal_document.dto.ts`, seeder `0047`, `system_modules.constant.ts`. Ninguno puede aparecer en el diff.
- `data` se construye con las cuatro llaves **a mano** (`type, version, content, publishedAt`); prohibido el spread del DTO.
- Errores siempre `{ type: 'error', title, detail, key, code }`; `key` es slug kebab-case del título. El 429 agrega `retryAfterSeconds`. Códigos `LGDOC.VAL.001`/`LGDOC.NF.001` se **importan** de `legal_document_error_codes.ts`; los nuevos viven en archivo propio.
- Cabeceras: 200 `Cache-Control: private, max-age=300` + `Vary` con `append` (nunca `header`, nunca `public`); 404/422/429 con `Cache-Control: no-store`.
- i18n: bloque de primer nivel **nuevo** `legalDocumentsPublic` en `es.json` y `en.json`; nunca dentro de `legalDocuments`.
- Sin logs con IP, user agent ni query en ninguna pieza nueva (SEC-A-11).
- `biometric_consent` y tipo inexistente responden el **mismo** 422 con cuerpo idéntico (SEC-A-03).
- TS estricto, cero `any`. Código, comentarios, JSDoc y OpenAPI en español; identificadores en inglés (regla `idioma.md`).
- Commits: Conventional Commits, tipo en inglés + descripción en español (commitlint truena inglés).
- Los tests funcionales exigen la BD `sae_pruebas` levantada.

## Review Focus

1. **Saneador destruye HTML legítimo de Quill** (falso positivo que vacía el documento legal): Task 1 prueba el payload legítimo intacto salvo el `rel` agregado.
2. **Un DTO ampliado en el futuro filtra campos por spread**: Task 4 aserta `deepEqual` de las llaves exactas de `data` y del envoltorio.
3. **`Vary` pisado con `.header()` en vez de `.append()`**: Task 4 construye la respuesta con `append` y aserta que `Vary` incluye `Origin`.
4. **Errores cacheables por equipos intermedios**: Task 4 aserta `no-store` en 404/422 y Task 5 en 429.
5. **Estado del limitador contamina escenarios vecinos** (60/min compartido hace flaky al spec entero): Tasks 4 y 5 hacen `await limiter.clear()` en `group.each.setup` y el caso 429 va al final.

---

### Task 1: Endurecer el saneador de HTML

**Files:**
- Modify: `app/helpers/sanitize_legal_document_content.ts` (bloque `SANITIZE_OPTIONS`)
- Test: `tests/unit/helpers/sanitize_legal_document_content.spec.ts` (nuevo)

**Interfaces:**
- Consumes: nada nuevo; firma existente `sanitizeLegalDocumentHtml(html: string | undefined | null): string` (`app/helpers/sanitize_legal_document_content.ts:49`).
- Produces: mismo `sanitizeLegalDocumentHtml` con comportamiento endurecido: todo `<a>` de salida lleva `rel="noopener noreferrer"` (un `rel` de origen distinto queda **reemplazado**) y las URLs protocol-relative (`//evil.example`) salen eliminadas. Tasks 4 y 5 dependen de esto para CA-3.

- [ ] **Step 1: Escribir el test unitario en verde-rojo (CA-14)**

Espejo de `tests/unit/helpers/sanitize_notice_content.spec.ts`. Dos grupos con `test` de japa:

Grupo "cargas maliciosas (CA-3)": para cada payload — `<script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, `<a href="javascript:alert(1)">x</a>`, `<a href="//evil.example">y</a>`, `<p style="position:fixed">z</p>` — asertar que la salida de `sanitizeLegalDocumentHtml` **no contiene**: `<script`, `alert(`, `<img`, `onerror`, `javascript:`, `//evil.example`, y que `<p>` sale sin `style`.

Grupo "HTML legítimo de Quill": entrada `<p><strong>Negritas</strong></p><ol><li>Uno</li></ol><h2>Título</h2><blockquote>Cita</blockquote><span style="color:#ff0000">Rojo</span><a href="https://valanserh.com" target="_blank">Valanserh</a><a href="https://example.com" rel="nofollow">Otro</a>` — asertar que `<p>`, `<strong>`, `<ol>`, `<li>`, `<h2>`, `<blockquote>`, `<span style="color:#ff0000">` y ambos `href` salen intactos, y que **todo** `<a>` de la salida lleva `rel="noopener noreferrer"` (el `rel="nofollow"` de origen quedó reemplazado, no duplicado).

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node ace test unit --files="sanitize_legal_document_content"`
Expected: FAIL — hoy `//evil.example` sobrevive (protocol-relative permitido por default) y `rel` no se fuerza.

- [ ] **Step 3: Implementar en `SANITIZE_OPTIONS`**

Solo dos líneas aditivas dentro de `SANITIZE_OPTIONS` (no se toca `ALLOWED_TAGS`, `allowedAttributes` ni `allowedStyles`):

```ts
allowProtocolRelative: false,
transformTags: {
  a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
},
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node ace test unit --files="sanitize_legal_document_content"`
Expected: PASS

- [ ] **Step 5: Regresión CA-15 — create/update/publishDraft siguen en verde**

Run: `node ace test functional --files="legal_document"`
Expected: PASS — `legal_document_current.spec.ts` y `legal_documents_management.spec.ts` en verde **sin editarlos**.

- [ ] **Step 6: Commit**

```bash
git add app/helpers/sanitize_legal_document_content.ts tests/unit/helpers/sanitize_legal_document_content.spec.ts
git commit -m "feat: endurecer saneador de documentos legales con rel forzado y sin URLs protocol-relative"
```

---

### Task 2: Validador público de query

**Files:**
- Create: `app/modules/legal-documents/validators/legal_document_public_query.validator.ts`
- Test: `tests/unit/validators/legal_document_public_query.spec.ts` (nuevo)

**Interfaces:**
- Consumes: nada (no reutiliza `legalDocumentQueryValidator` — su enum incluye `biometric_consent`, SEC-A-03).
- Produces (Task 4 los consume tal cual):
  - `LEGAL_DOCUMENT_PUBLIC_TYPES = ['terms_conditions', 'privacy_notice'] as const`
  - `LEGAL_DOCUMENT_PUBLIC_LOCALES = ['es', 'en'] as const`
  - `legalDocumentPublicQueryValidator` (VineJS compilado)
  - `type LegalDocumentPublicQueryInput = Awaited<ReturnType<typeof legalDocumentPublicQueryValidator.validate>>` → `{ type: 'terms_conditions' | 'privacy_notice'; locale?: 'es' | 'en' }`

- [ ] **Step 1: Escribir el test unitario**

Casos: `type: 'terms_conditions'` y `'privacy_notice'` validan (con y sin `locale`); `type: 'biometric_consent'` **rechaza** (mensaje con `field: 'type'`); `type: 'inexistente'` rechaza; sin `type` rechaza con `rule: 'required'` en `field: 'type'`; `locale: 'es'`/`'en'` validan; `locale: 'fr'` rechaza con `field: 'locale'`; `locale` ausente valida. El test valida directamente con `legalDocumentPublicQueryValidator.validate({ type, locale })` capturando el error y leyendo `error.messages` — es la estructura que Task 4 usa para distinguir error de tipo del de idioma.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node ace test unit --files="legal_document_public_query"`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar el validador**

Mismo molde de `validators/legal_document_query.validator.ts` con los dos enum propios:

```ts
import vine from '@vinejs/vine'

export const LEGAL_DOCUMENT_PUBLIC_TYPES = ['terms_conditions', 'privacy_notice'] as const
export const LEGAL_DOCUMENT_PUBLIC_LOCALES = ['es', 'en'] as const

export const legalDocumentPublicQueryValidator = vine.compile(
  vine.object({
    type: vine.enum(LEGAL_DOCUMENT_PUBLIC_TYPES),
    locale: vine.enum(LEGAL_DOCUMENT_PUBLIC_LOCALES).optional(),
  })
)

export type LegalDocumentPublicQueryInput = Awaited<
  ReturnType<typeof legalDocumentPublicQueryValidator.validate>
>
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node ace test unit --files="legal_document_public_query"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/modules/legal-documents/validators/legal_document_public_query.validator.ts tests/unit/validators/legal_document_public_query.spec.ts
git commit -m "feat: agregar validador público de consulta para documentos legales"
```

---

### Task 3: Constantes del 429, helper de rate-limit y rama del handler

**Files:**
- Create: `app/constants/legal_document_public_error_codes.ts`
- Create: `app/helpers/legal_document_public_request_errors.ts`
- Modify: `app/exceptions/handler.ts` (junto a la rama `isAuthLoginRateLimitError`, hoy `:117-118`)
- Test: `tests/unit/helpers/legal_document_public_request_errors.spec.ts` (nuevo)

**Interfaces:**
- Consumes: molde de `app/helpers/auth_login_request_errors.ts` (guard `E_TOO_MANY_REQUESTS` con fallback por `code` + `'response' in error`) y de `AUTH_LOGIN_ERRORS` (`app/constants/auth_login_error_codes.ts`).
- Produces (Task 5 consume; el handler consume al despachar):
  - `LEGAL_DOCUMENT_PUBLIC_ERROR_CODES = { INVALID_LOCALE: 'LGDOC.PUBLIC.001', RATE_LIMITED: 'LGDOC.PUBLIC.002' } as const` (Task 4 usa `INVALID_LOCALE`)
  - `LEGAL_DOCUMENT_PUBLIC_RATE_LIMIT_ERROR = { title, detail, key, code }` — textos exactos del 429 en spec CA-8, en español, en constante (el handler no garantiza `ctx.i18n`, molde `AUTH_LOGIN_ERRORS`)
  - `isLegalDocumentPublicPath(url: string): boolean` — regex `/\/api\/public\/legal-documents\/current(\?|$)/`
  - `isLegalDocumentPublicRateLimitError(error: unknown): error is InstanceType<typeof errors.E_TOO_MANY_REQUESTS>`
  - `respondLegalDocumentPublicRateLimit(ctx: Pick<HttpContext, 'response'>, error: InstanceType<typeof errors.E_TOO_MANY_REQUESTS>): void` — 429 con `Cache-Control: no-store`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`, `X-RateLimit-Reset` (`new Date(Date.now() + availableIn * 1000).toISOString()`) y cuerpo `{ type: 'error', title, detail, key, code, retryAfterSeconds }`. **Ojo:** este helper agrega `code` y `Cache-Control: no-store` — `respondAuthLoginRateLimit` no los tiene y **no** se toca (DA-7).

- [ ] **Step 1: Escribir el test unitario**

Espejo de `tests/unit/helpers/auth_login_request_errors.spec.ts`. Con un objeto falso `{ code: 'E_TOO_MANY_REQUESTS', response: { limit: 60, remaining: 0, availableIn: 30 } }` y un `ctx` con un response espía (mismo patrón del test espejo): asertar 429, las cuatro cabeceras de límite, `Cache-Control: no-store`, y el cuerpo con las seis llaves exactas incluyendo `code: 'LGDOC.PUBLIC.002'` y `retryAfterSeconds: 30`. Además: `isLegalDocumentPublicPath` acepta `/api/public/legal-documents/current` y con query, y rechaza `/api/legal-documents/current` (el autenticado) y cualquier otra ruta.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node ace test unit --files="legal_document_public_request_errors"`
Expected: FAIL — módulos no existen.

- [ ] **Step 3: Implementar constantes y helper**

`legal_document_public_error_codes.ts`:

```ts
export const LEGAL_DOCUMENT_PUBLIC_ERROR_CODES = {
  /** El `locale` recibido no es `es` ni `en`. */
  INVALID_LOCALE: 'LGDOC.PUBLIC.001',
  /** Se superó el límite de 60 consultas por minuto por IP. */
  RATE_LIMITED: 'LGDOC.PUBLIC.002',
} as const

export const LEGAL_DOCUMENT_PUBLIC_RATE_LIMIT_ERROR = {
  title: 'Demasiadas consultas de documentos legales',
  detail:
    'Se alcanzó el límite de consultas. Espera unos segundos antes de volver a intentarlo.',
  key: 'demasiadas-consultas-de-documentos-legales',
  code: LEGAL_DOCUMENT_PUBLIC_ERROR_CODES.RATE_LIMITED,
} as const
```

`legal_document_public_request_errors.ts`: transcripción del molde de `auth_login_request_errors.ts` con las tres funciones de Interfaces, importando `LEGAL_DOCUMENT_PUBLIC_RATE_LIMIT_ERROR` de `#constants/legal_document_public_error_codes`.

- [ ] **Step 4: Agregar la rama al exception handler**

En `app/exceptions/handler.ts`, junto a `isAuthLoginRateLimitError` (import del helper nuevo arriba del archivo):

```ts
if (
  isLegalDocumentPublicRateLimitError(error) &&
  isLegalDocumentPublicPath(ctx.request.url())
) {
  return respondLegalDocumentPublicRateLimit(ctx, error)
}
```

- [ ] **Step 5: Correr el test unitario y el guardrail**

Run: `node ace test unit --files="legal_document_public_request_errors"` y `node ace test unit --files="constants/"`
Expected: ambos PASS.

- [ ] **Step 6: Commit**

```bash
git add app/constants/legal_document_public_error_codes.ts app/helpers/legal_document_public_request_errors.ts app/exceptions/handler.ts tests/unit/helpers/legal_document_public_request_errors.spec.ts
git commit -m "feat: agregar respuesta 429 contractual para el limitador público de documentos legales"
```

---

### Task 4: i18n, controller, rutas y spec funcional del cuerpo del contrato

**Files:**
- Create: `app/modules/legal-documents/legal_document_public.controller.ts`
- Create: `app/modules/legal-documents/legal_document_public.routes.ts`
- Modify: `resources/langs/es.json` (bloque de primer nivel `legalDocumentsPublic`)
- Modify: `resources/langs/en.json` (bloque `legalDocumentsPublic` en inglés)
- Modify: `start/routes.ts` (import de las rutas junto a `#modules/employee-badge/badge_public.routes`)
- Test: `tests/functional/legal_document_public.spec.ts` (nuevo)
- Test: `tests/unit/routes/legal_document_public_routes.spec.ts` (nuevo)

**Interfaces:**
- Consumes: `LegalDocumentService#getCurrent(type, locale = 'es'): Promise<LegalDocumentDto>` (`legal_document.service.ts:44`, **no se edita**); `LegalDocumentError` con `key: 'documento-legal-sin-version-vigente'`; `LEGAL_DOCUMENT_ERROR_CODES.INVALID_TYPE` y `.NOT_CURRENT` por import (`#constants/legal_document_error_codes`); `sanitizeLegalDocumentHtml` (Task 1); `legalDocumentPublicQueryValidator` + `LEGAL_DOCUMENT_PUBLIC_LOCALES` (Task 2); `LEGAL_DOCUMENT_PUBLIC_ERROR_CODES.INVALID_LOCALE` (Task 3); `i18nManager` de `@adonisjs/i18n/services/main`.
- Produces: endpoint `GET /api/public/legal-documents/current?type=&locale=` (contrato congelado spec §11) — Task 5 y Task 6 lo consumen; USRH1790610965587 depende de él.

- [ ] **Step 1: Escribir el spec funcional — parte 1: caminos 200**

`tests/functional/legal_document_public.spec.ts`, **sin `loginAs` en ninguna petición**. En `group.each.setup`: `await limiter.clear()` (import de `@adonisjs/limiter/services/main`). Escenarios CA-1 y CA-2 (textos y cuerpos exactos en spec §5):
- CA-1: para cada tipo público × `locale=es` y `locale=en` → 200; envoltorio con llaves exactas `type, title, message, data` (`deepEqual(Object.keys(body), [...])`), `type: 'success'`, y `data` con llaves exactas `type, version, content, publishedAt` — sin `publishedBy`, id, estado ni otro idioma.
- CA-2: sin `locale` y con `locale=` vacío → `content` igual al de `es`; versión con `content.en` vacío (se actualiza temporalmente `legalDocumentContent` de la vigente y se restaura en teardown) pedida con `locale=en` → `content` es el de `es`.

- [ ] **Step 2: Correr y verificar que falla**

Run: `node ace test functional --files="legal_document_public"`
Expected: FAIL — 404, la ruta no existe.

- [ ] **Step 3: Agregar el bloque i18n `legalDocumentsPublic` en `es.json` y `en.json`**

De primer nivel, junto al `legalDocuments` existente (`es.json:2820`), **nunca dentro de él**. Claves: `title`, `current_success`, `errors.tipo-de-documento-invalido.{title,detail,detail_missing}`, `errors.idioma-de-documento-invalido.{title,detail}`, `errors.documento-legal-sin-version-vigente.{title,detail}`. Textos verbatim del spec (CA-4, CA-5, CA-6, CA-7 y §11); el inglés usa los títulos dados en §11 ("Legal document", "Current legal document retrieved successfully.", "Invalid document type", "Invalid document language", "Legal document without a current version") con `detail` equivalentes.

- [ ] **Step 4: Implementar el controller**

`legal_document_public.controller.ts` — clase `LegalDocumentPublicController` con `async current(ctx: HttpContext, service: LegalDocumentService = new LegalDocumentService())` y flujo del spec §7:

1. `const localeRaw = ctx.request.input('locale') || undefined` (vacío ≡ ausente).
2. Validar `{ type: ctx.request.input('type'), locale: localeRaw }` con `legalDocumentPublicQueryValidator`. En catch: si algún `messages[].field === 'type'` → 422 de tipo con `detail_missing` cuando `rule === 'required'` (mismo molde de `isMissingTypeError`, `legal_document.controller.ts:718-725`); si no → 422 de idioma con `LGDOC.PUBLIC.001`. Ambos con `Cache-Control: no-store`. Título y `detail` del bloque `legalDocumentsPublic.errors.*`, formateados con `i18nManager.locale('es')` (aún no hay locale validado).
3. `const locale = payload.locale ?? 'es'`; `i18nManager.locale(locale)`.
4. `service.getCurrent(payload.type, locale)` en try; en catch, si `LegalDocumentError` con key `documento-legal-sin-version-vigente` → 404 con `no-store` (título/`detail` de i18n, `key` del error, `code: LEGAL_DOCUMENT_ERROR_CODES.NOT_CURRENT`); cualquier otro error se relanza.
5. `data` con las cuatro llaves a mano: `{ type: dto.type, version: dto.version, content: sanitizeLegalDocumentHtml(dto.content), publishedAt: dto.publishedAt }`.
6. 200 con `.header('Cache-Control', 'private, max-age=300')`, `ctx.response.append('Vary', 'Origin')`, título y mensaje de `legalDocumentsPublic.*` con el `i18nManager` ya en `locale`.

JSDoc `@swagger` en español sobre el método, molde del JSDoc de `getCurrent` (`legal_document.controller.ts:85-115`).

- [ ] **Step 5: Implementar las rutas y registrarlas**

`legal_document_public.routes.ts` — espejo de `badge_public.routes.ts` (sin `auth`, sin `businessScope`):

```ts
import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'

const legalDocumentPublicRateLimit = limiter.define('legal-document-public', (ctx) => {
  return limiter.allowRequests(60).every('1 minute').usingKey(ctx.request.ip())
})

router
  .group(() => {
    router
      .get('/current', '#modules/legal-documents/legal_document_public.controller.current')
      .use(legalDocumentPublicRateLimit)
  })
  .prefix('/api/public/legal-documents')
```

En `start/routes.ts`: `import '#modules/legal-documents/legal_document_public.routes'` junto al import de `badge_public.routes` (~`:225`).

- [ ] **Step 6: Correr la parte 1 y verificar que pasa**

Run: `node ace test functional --files="legal_document_public"`
Expected: PASS

- [ ] **Step 7: Escribir el spec funcional — parte 2: errores 4xx, saneado al servir y cabeceras**

Mismo archivo. Escenarios (cuerpos exactos en spec §5):
- CA-3: siembra el HTML malicioso de CA-3 en `legalDocumentContent` de la vigente de `terms_conditions` (actualización temporal + restauración en teardown) → la respuesta 200 no contiene `<script`, `alert(`, `<img`, `onerror`, `javascript:`, `//evil.example` ni `style=` en `<p>`, y todo `<a>` lleva `rel="noopener noreferrer"`.
- CA-4: `type=biometric_consent` y `type=inexistente` → ambos 422 con cuerpo **idéntico** (`deepEqual` entre sí) `{ type: 'error', title: 'Tipo de documento inválido', detail: 'El tipo de documento solicitado no está disponible para consulta pública.', key: 'tipo-de-documento-invalido', code: 'LGDOC.VAL.001' }`.
- CA-5: sin `type` → 422 con `detail` "Indica el tipo de documento: terms_conditions o privacy_notice."
- CA-6: `locale=fr` → 422 `LGDOC.PUBLIC.001` con su cuerpo exacto; `type` y `locale` inválidos a la vez → gana el error de tipo.
- CA-7: captura y apaga `is_current` del tipo en `group.setup`, restaura en `teardown` (patrón de `legal_document_current.spec.ts:130-158`) → 404 `{ title: 'Documento legal sin versión vigente', ..., code: 'LGDOC.NF.001' }`.
- CA-9: la 200 trae `Cache-Control: private, max-age=300` y `Vary` incluye `Origin`; invariante: si trae `Set-Cookie`, `Cache-Control` **no** contiene `public`.
- CA-10 (404/422): cada respuesta de error de estos escenarios trae `Cache-Control: no-store`.
- CA-12: `type=privacy_notice&locale=es` con `Accept-Language: en` y con `Accept-Language: es` → los dos cuerpos idénticos.

- [ ] **Step 8: Escribir el test unitario de rutas (CA-16)**

`tests/unit/routes/legal_document_public_routes.spec.ts` — espejo de `system_setting_public_routes.spec.ts`: lee el archivo de rutas y aserta que declara **exactamente una** ruta `GET /current` bajo prefijo `/api/public/legal-documents`, con `.use(legalDocumentPublicRateLimit)`, que la definición del limitador usa `allowRequests(60)`, `every('1 minute')` y `usingKey(ctx.request.ip())`, y que el archivo **no** contiene `middleware.auth(` ni `businessScope`.

- [ ] **Step 9: Correr todo el paquete**

Run: `node ace test functional --files="legal_document_public"` y `node ace test unit --files="legal_document_public"`
Expected: ambos PASS.

- [ ] **Step 10: Regresión del endpoint autenticado (regla 10)**

Run: `node ace test functional --files="legal_document"`
Expected: PASS — `legal_document_current.spec.ts` y `legal_documents_management.spec.ts` siguen en verde sin editarlos.

- [ ] **Step 11: Commit**

```bash
git add app/modules/legal-documents/legal_document_public.controller.ts app/modules/legal-documents/legal_document_public.routes.ts resources/langs/es.json resources/langs/en.json start/routes.ts tests/functional/legal_document_public.spec.ts tests/unit/routes/legal_document_public_routes.spec.ts
git commit -m "feat: exponer lectura pública sin sesión de la versión vigente de documentos legales"
```

---

### Task 5: Spec funcional del límite, la frescura y el CORS

**Files:**
- Test: `tests/functional/legal_document_public.spec.ts` (amplía el archivo del Task 4)

**Interfaces:**
- Consumes: endpoint del Task 4, helper y rama 429 del Task 3, limitador `legal-document-public` (60/min por IP) ya montado en las rutas.
- Produces: CA-8, CA-11 y CA-13 verificados; spec funcional completo (CA-1 a CA-13).

- [ ] **Step 1: Escribir los escenarios al final del grupo**

El caso 429 va **al final** del archivo (nota §14 del spec), con `limiter.clear()` en `each.setup` para que las 60 peticiones previas no contaminen:
- CA-8: 60 peticiones 200 seguidas desde la misma IP; la 61 → 429 con cuerpo exacto (incluye `retryAfterSeconds`) y cabeceras `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. Prueba de "no llega a la información guardada": justo antes de la 61, apaga `is_current` del tipo (y restáurala en teardown) — la respuesta sigue siendo 429, no 404: si el controller hubiera leído la base, habría respondido 404.
- CA-10 (429): la respuesta 429 trae `Cache-Control: no-store`.
- CA-11: consulta 200 de `terms_conditions`; en la base, pasa `is_current` a otra fila del mismo tipo (crea la fila si hace falta, versión `<timestamp>`, y restaura en teardown); repite la consulta → trae la versión nueva (sin caché de servidor).
- CA-13: petición con `Origin: https://origin-no-permitido.example` → la respuesta no trae `Access-Control-Allow-Origin` para ese origen.

- [ ] **Step 2: Correr y verificar que pasa**

Run: `node ace test functional --files="legal_document_public"`
Expected: PASS — CA-1 a CA-13 en verde.

- [ ] **Step 3: Commit**

```bash
git add tests/functional/legal_document_public.spec.ts
git commit -m "test: cubrir límite por IP, frescura de versión y CORS de la lectura pública"
```

---

### Task 6: OpenAPI y verificación de Definition of Done

**Files:**
- Modify: `docs/openapi.yaml` (path junto a `/api/public/employee-badge/verify/{token}`, hoy `:12482` — lejos de `/api/legal-documents/current`, `:8211`)

**Interfaces:**
- Consumes: contrato congelado del spec §11.
- Produces: documentación del endpoint; rama lista para PR.

- [ ] **Step 1: Agregar el path a OpenAPI**

`/api/public/legal-documents/current`: parámetros `type` y `locale` (enums), respuesta 200 con el envoltorio y las cuatro respuestas de error (422 tipo, 422 idioma, 404, 429) con sus `code` — molde del path del employee-badge.

- [ ] **Step 2: Verificación completa (DoD del spec §15)**

Run (todo debe pasar):
- `node ace test unit --files="constants/"` (guardrail no negociable)
- `node ace test unit --files="legal_document_public"` y `--files="sanitize_legal_document_content"`
- `node ace test functional --files="legal_document"` (incluye la regresión CA-15)
- `npm run typecheck`
- `npm run lint` y `npm run lint:terminology`

Expected: todo en verde, cero `any`.

- [ ] **Step 3: Revisión CA-17 — sin rastreo**

Revisión de código del diff: ni el controller, ni el helper del 429, ni la rama del handler escriben logs con IP, user agent o query. Confirmar que **ningún** archivo del censo "no-tocado" (Global Constraints) aparece en el diff.

- [ ] **Step 4: Commit**

```bash
git add docs/openapi.yaml
git commit -m "docs: documentar endpoint público de documentos legales en OpenAPI"
```

---

### Task 7: Manual de QA de la lectura pública

Redacta el playbook de prueba manual que una **persona** recorrerá con un cliente de API (Postman, Insomnia, Bruno), gobernado por la regla global de playbooks de QA para API (`.cursor/rules/manual-qa-api.mdc`) y entregado bajo la regla de ejecución (`.cursor/rules/manual-qa-execution.mdc`): la tarea termina con el manual listo y el ambiente preparado; el recorrido lo hace la persona, nunca el agente.

**Files:**
- Create: `docs/superpowers/plans/2026-09-30-lectura-publica-documentos-legales-qa-api.md` (manual; molde del hermano `2026-09-29-contrato-sin-estructura-sin-relleno-qa-api.md`)
- Modify: `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (seeder QA compartido, **no versionado** — es el mismo archivo que ya usan los demás manuales, no se crea uno nuevo)

**Interfaces:**
- Consumes: endpoint del Task 4 con sus respuestas ya verificadas (Task 5); cuerpos y textos **verbatim** del spec §11 y CA-4 a CA-8 — el manual copia los responses literales del contrato, no parafrasea; URL base local `http://127.0.0.1:3333` y el hecho verificado de que el sistema entrega cookie de sesión en toda respuesta (§13, DA-8).
- Produces: manual recorrerable por una persona sin cuenta ni token; la prueba manual del Definition of Done queda cubierta.

- [ ] **Step 1: Ampliar el seeder QA compartido con los datos de esta HU**

En `database/seeders/_tmp_do_not_commit_qa_seeder.ts`, sembrar (patrón de los demás manuales, con marca reconocible `QA-LEGAL`):
- Una versión vigente de `terms_conditions` con `content.es` reconocible (p. ej. párrafo «QA-LEGAL-TYC-ES»), `content.en` reconocible («QA-LEGAL-TYC-EN») **e incrustadas las cargas de CA-3** (`<script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, `<a href="javascript:alert(1)">`, `<a href="//evil.example">`, `<p style="position:fixed">`) — es lo que permite comprobar en el recorrido que la entrega sale limpia aunque lo guardado no lo esté.
- Una versión vigente de `privacy_notice` con `content.es` reconocible y `content.en` **vacío** (para el respaldo al español).
- Una segunda versión **no vigente** de `privacy_notice` («futura») para el escenario de frescura.

Declarar en el manual, antes del primer escenario, que los documentos legales son globales de la base (no acotados a una empresa de prueba): el recorrido cambia temporalmente cuál es la vigente y el paso de Limpieza la restaura con el SQL exacto del propio manual.

- [ ] **Step 2: Redactar el manual**

Estructura de la regla: 0) Problema / Solución / **Ejemplo:** en lenguaje llano; 1) Preparar — **un solo comando** (`node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts`) y la aclaración de que esta consulta **no usa usuarios ni token** (la variante «sin permiso» no existe: cualquiera consulta); 2) escenarios; 3) Limpieza (restaurar `is_current`); 4) Checklist con una casilla por escenario.

Cobertura obligatoria (uno o más escenarios por punto, cada uno abriendo con su **`Objetivo:`** propio en lenguaje llano, endpoint completo y **response exacto** copiado de §11):
- Consulta sin sesión de Términos en `es` y en `en` → 200 con `data` de cuatro llaves y cabeceras `Cache-Control: private, max-age=300` y `Vary` con `Origin` (CA-1, CA-9). Aquí va la lista «Qué significa cada dato» con los **valores fijos** enumerados: `type` (`success` / `error`), `locale` (`es`, `en`), `data.type` (`terms_conditions`, `privacy_notice`).
- Sin `locale` y `locale=` vacío → español (CA-2); Aviso pedido en `en` con `content.en` vacío → entrega el español (CA-2).
- Texto limpio: el response **no** contiene `<script`, `alert(`, `<img`, `onerror`, `javascript:`, `//evil.example`, y todo `<a>` trae `rel="noopener noreferrer"` (CA-3).
- `biometric_consent` y un tipo inexistente → el **mismo** 422 con cuerpo idéntico (CA-4); sin `type` → 422 con su `detail` propio (CA-5); `locale=fr` → 422 de idioma (CA-6). Aquí se explica en lenguaje de negocio que el mensaje no distingue si el documento existe.
- Tipo válido sin vigente → 404 (CA-7): el paso apaga `is_current` con el SQL multilínea del manual y el sub-paso de Limpieza lo restaura.
- 61 consultas en el minuto → 429 con `retryAfterSeconds` y cabeceras de espera (CA-8), con advertencia de que el límite cuenta **todas** las consultas de esa dirección en la corrida y va al final del recorrido.
- Frescura: pasar la vigente a la versión «futura» con SQL del manual → la consulta siguiente trae la nueva; Limpieza restaura (CA-11).
- Cabeceras de error: 404, 422 y 429 traen `Cache-Control: no-store` (CA-10).
- `Accept-Language: en` no cambia el cuerpo de una consulta `locale=es` (CA-12).
- CORS, dos consultas hermanas: con un `Origin` **dentro** de `CORS_ALLOWED_ORIGINS` la respuesta trae `Access-Control-Allow-Origin` para ese origen; con uno **fuera**, no lo trae (CA-13 + DoD). El origen permitido se resuelve del `.env` del ambiente con la consulta que el propio manual da; si el caso no es provocable ahí, decláralo en «Lo que no se revisa aquí» en una línea — no le inventes pasos.

Reglas de forma que más se rompen: SQL **siempre** en bloques cercados multilínea con el `WHERE` en línea propia (nunca inline); nada de rutas de archivo, nombres de clase, ni «revisa el código de X»; cada dato se explica una sola vez, en el primer escenario donde aparece; los pasos que suben archivo no aplican (no hay ninguno aquí).

- [ ] **Step 3: Cotejar el manual contra el ambiente sembrado**

Servidor arriba + seeder corrido; verificar con consultas sueltas que cada response literal del manual es el que el sistema entrega de verdad (contrato real manda sobre el borrador: si algo difiere, se corrige el manual con lo real y, si el contrato real difiere del spec congelado, se escala a Wilvardo). Esto **no** es recorrer el manual: el recorrido lo hace la persona.

- [ ] **Step 4: Commit**

Solo el manual — el seeder es `_tmp_do_not_commit` y no se versiona:

```bash
git add docs/superpowers/plans/2026-09-30-lectura-publica-documentos-legales-qa-api.md
git commit -m "docs: agregar manual de prueba manual de la lectura pública de documentos legales"
```