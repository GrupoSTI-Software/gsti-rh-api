# Publicar el aviso de privacidad de la evidencia fotográfica del puesto (VLRH-H1791306079310) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el API guarde la plantilla base del aviso de privacidad de las fotos del puesto de trabajo y deje a cada empresa crear su borrador desde esa plantilla, editarlo, descartarlo y publicarlo como versión (marcadores resueltos con el valor escapado, texto ya resuelto e inmutable con su huella), liste sus versiones publicadas con el conteo de acuses que cada una tiene, y exponga `hasAcknowledgedCurrent(businessUnitId, employeeId)` para las HUs hermanas — todo sin pantalla: la pestaña del Backoffice es de `VLRH-H1791311160233` y el acuse en la app, de `VLRH-H1791311160825`.

**Architecture:** Slice hexagonal **espejo** de `app/modules/telework-policy/` (controller con `MODULE_SLUG` + `RBAC_FORBIDDEN` + mapa `ERROR_STATUS_BY_KEY`, servicio, puerto `*.repository.ts` + adaptador `*.repository.mysql.ts`, `dto/`, `validators/` y error de dominio con `key` tipada; se copia el patrón, no se importa ni se generaliza). Tres tablas: `telework_photo_notice_templates` (global, sin empresa ni mixin, una fila vigente), `telework_photo_notices` (una fila por versión y empresa, `UNIQUE(business_unit_id, version)`, `SoftDeletes` solo para el borrador) y `telework_photo_notice_acknowledgements` (inmutable, nace vacía aquí para que el conteo exista desde el inicio; la llena `VLRH-H1791311160825`). `legal_documents` **no** se toca (es global: `UNIQUE(type, version)` sin `business_unit_id`). El permiso es el de `telework-policy` vía `assertComplianceRepsePermission` (sin módulo nuevo y sin `permissionGate` en las rutas), el saneado reutiliza `sanitizeTeleworkPolicyHtml` (whitelist de Quill, la misma del BO) y el motor de marcadores es mínimo: lista cerrada (`razon_social`), detección con `/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g`, sustitución con el valor **escapado**, segundo saneado, y SHA-256 de `title + '\n' + renderedContent`. Publicar corre en transacción con `forUpdate` sobre el borrador y sobre la vigente; el adaptador filtra `business_unit_id` explícito en **cada** consulta (desviación consciente del molde, para que `hasAcknowledgedCurrent` sea correcto aunque lo invoque código fuera del controller).

**Tech Stack:** AdonisJS 6 + VineJS + Lucid/MySQL + luxon + `sanitize-html` (vía la whitelist existente) + `node:crypto` (`createHash('sha256')`) + Japa (`sae_pruebas`). Solo `gsti-rh-api`: la rama de `gsti-rh-bo` y la de la app no llevan commits.

**Spec:** `/Users/noeabelvargaslopez/Downloads/spec-VLRH-H1791306079310.md` (HU `VLRH-H1791306079310`; versión viva en `04-gsti/03-valanserh/02-plannings/00-docs-hu/VLRH-H1791306079310/`). El plan argumenta desde el spec: el ejecutor lee **ambos**. Las columnas de §10, los DTO de §11, la tabla de códigos `TWN`, los textos i18n y el sobre de error se copian **verbatim** del spec, no se improvisan.

**Rama y anclas revalidadas el 2026-10-21** contra la rama de la HU (`feature/VLRH-H1791306079310-publicar-el-aviso-de-privacidad-de-la-evidencia`), limpia y a la par de `multitenant` local y de `origin/multitenant` (`0565680a`), **sin ningún commit propio: esta HU no ha arrancado y el plan parte de cero.** Coincide lo que el spec cita del molde: `getTemplate:49`, `getPolicy:71`, `updateDraft:133`, `discardDraft:175`, `publish:197`, `createDraftFromLatest:255`, `listVersions:288`, `assertScopeResolved:444`, `resolvePublishedByName:526` en `app/modules/telework-policy/telework_policy.service.ts`; el adaptador con `findMaxVersion` en `app/modules/telework-policy/telework_policy.repository.mysql.ts:76`; `assertHasPermission:1193`, `validationError:1198`, `domainError:1224` en `app/modules/telework-policy/telework_policy.controller.ts`; `sanitizeTeleworkPolicyHtml:45` en `app/helpers/sanitize_telework_policy_content.ts`; `assertComplianceRepsePermission:18` en `app/helpers/compliance_repse_rbac.ts`; `BusinessUnit.businessUnitLegalName` en `app/models/business_unit.ts:70`; el módulo `telework-policy` con `read/create/update/delete/gestion` en `app/constants/system_modules_menu/system_modules.constant.ts:1114-1152`. El prefijo `TWN.` está libre (`grep -rn "TWN\." app/ resources/ database/` → 0 líneas). **Cuatro drifts triviales, resueltos aquí** (ninguno toca alcance, contrato §11 ni reglas §4; nada que escalar):

1. **El modelo del molde usa `.delete()` para el soft delete y CA-17 lo prohíbe aquí.** CA-17 exige `grep -nE "\.delete\(\)|forceDelete|DELETE FROM" app/modules/telework-photo-notice` = 0, así que el descarte del borrador **no** se hace con `record.delete()` (lo que hace `telework_policy.repository.mysql.ts:130`): se carga la fila escopeada, se le asigna `deletedAt = DateTime.now()` y se guarda (§10 ya lo dice: «soft delete por `update` escopeado»).
2. **Prefijo de las tres migraciones.** El censo reserva `1791306079310/11/12`, pero el árbol ya tiene migraciones posteriores (`1792467935317_add_cancellation_note_to_employee_offboardings_table.ts` es la última numerada) y la regla del repo (`.claude/rules/migraciones-lucid.md`, «El nombre del archivo decide el orden de ejecución») obliga a generar el prefijo con `node ace make:migration`: nunca se escribe a mano. Aplica el caso que el propio spec §10 anticipa («se ajustan al generado»): se regenera, se conservan los sufijos `…001/002/003` y los nombres reales se anotan en el commit. La receta exacta va en la Tarea 1, Paso 1.
3. **Anclas de línea de i18n.** El spec cita `es.json:3156` para «tras la última clave `telework_location_*`»: hoy el bloque `telework_location_*` es `es.json:3156-3166` y le siguen `telework_workers_*` en `3167-3170`; en `en.json` el mismo corte está en `3163`/`3164`. Y las claves planas del helper viven en `es.json:3073-3084` (`telework_photo_notice_forbidden_*` entra ahí, no al final del archivo) y `en.json:3070-3081`.
4. **Una fila publicada nunca se lee como borrador.** El molde lee «la fila activa» y luego compara el estado; aquí la consulta de borrador filtra `status = 'draft'` **y** `deleted_at IS NULL`, de modo que `PUT`/`DELETE`/`POST /publish` sobre una versión publicada dan 404 `borrador-no-encontrado` (CA-10) sin necesidad de un error «publicada inmutable» que el catálogo `TWN` no tiene.

**Líneas base medidas el 2026-10-21** (rama de la HU, `sae_pruebas` recién al día con `migration:fresh --seed`):

- `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test unit --files="constants/"` → **156 passed (156), 0 failed**.
- `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="telework_policy.spec.ts"` → **29 passed (29), 0 failed**.
- `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="telework_checklist.spec.ts"` → **19 passed (19), 0 failed**.
- `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="telework_policy_publish.spec.ts"` → **24 passed, 7 failed (31) ya en la base**, sin esta HU: los siete son fragilidad de fixture (esperan 2 teletrabajadores en su empresa y la BD sembrada tiene 15 — `assert.equal(body.data.diffusion.total, 2)`, `summary.total`, `pendingTotal`) y todos viven en el difusor y el recordatorio, que esta HU no toca. El gate es **ninguno nuevo**, no «0 fallos».
- `./node_modules/.bin/tsc --noEmit` → **exit 0**; `./node_modules/.bin/eslint app/modules/telework-policy app/modules/telework-checklist app/constants/telework_policy.ts app/helpers/sanitize_telework_policy_content.ts` → **0 problemas**.
- `node ace list:routes | grep -c telework-photo-notice` → **0** (grep rc=1).
- `ls database/migrations | grep -E '^[0-9]{13}_' | sort | tail -1` → `1792467935317_add_cancellation_note_to_employee_offboardings_table.ts`; `ls database/seeders | sort | tail -1` → `0066_announcement_slides_seeder.ts` (**0067 libre**).
- `git diff --name-only multitenant...HEAD` → **vacío**.

**Dónde va la documentación:** este plan y el manual de QA en `gsti-rh-api/docs/superpowers/plans/` (ese directorio **sí** se versiona). El sembrador de QA (`database/seeders/_tmp_do_not_commit_qa_seeder.ts`) está en `.git/info/exclude` y **no se commitea**.

## Restricciones globales

- **Rama y commits:** Conventional Commits, descripción en español en imperativo, cuerpo con el porqué y footer `Refs: VLRH-H1791306079310`. Los tres comandos de migración/seed **no** fijan `NODE_ENV` por sí solos: siempre `NODE_ENV=test DB_DATABASE=sae_pruebas` delante (`node ace test` sí lo fija solo). El plan **no** abre PR ni despliega (proceso aparte, de Wilvardo): termina en la verificación automatizada y en la **entrega** del manual de QA, que recorre una persona.
- **BD de pruebas:** antes de cada tanda que toque BD, `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed`. Nunca contra la BD de desarrollo ni dos migraciones a la vez (Lucid toma `GET_LOCK('1', 0)` del servidor entero).
- **Migraciones:** generadas con `node ace make:migration`, prefijo de 13 dígitos, sufijo incremental del mismo largo, **sin `await` sobre `this.schema`** (el `await` duplica el SQL), `down()` = `dropTableIfExists` y nada más. Una migración ya mergeada no se renombra.
- **Códigos `TWN`:** solo los de §11 (`TWN.VAL.001/002/003`, `TWN.CONF.001`, `TWN.NF.001/002/004`, `TWN.AUTH.001`, `TWN.SYS.001`). **No declarar** `TWN.NF.003`, `TWN.VAL.004` ni `TWN.VAL.GATING.001`: están reservados a `VLRH-H1791311160825`. No reutilizar `TWP` ni `TWC`.
- **Frontera de la HU (CA-16, `no-tocado` del censo):** no se toca `app/modules/consent/**` (el aviso **no** entra a `AUDIENCE_REQUIRED_TYPES`), ni `app/modules/legal-documents/**`, ni `app/constants/system_modules_menu/**` (se reusa el permiso de `telework-policy`: no hay módulo nuevo ni entrada de menú), ni `app/modules/telework-policy/**`, ni `app/helpers/**` (`sanitizeTeleworkPolicyHtml` y `assertComplianceRepsePermission` se **consumen** sin editarse), ni `app/modules/telework-checklists/**` (el módulo de `VLRH-H1790812613870` no gobierna este aviso: decisión de Wilvardo, 2026-10-20). Tampoco se crean rutas de app (`/current`, `/acknowledgements`), ni validador ni INSERT de acuses: son de `VLRH-H1791311160825`.
- **Solo dos archivos de prueba en toda la rama:** `tests/functional/telework_photo_notice.spec.ts` y `tests/unit/modules/telework-photo-notice/telework_photo_notice.service.spec.ts`. No se edita ningún spec existente.
- **Empresa y actor:** siempre `ctx.businessUnitScope[0]` y `ctx.auth.user!.userId`; **nunca** de body, query ni path (anti-IDOR). El servicio rechaza `businessUnitId <= 0` sin consultar el repositorio, y el adaptador filtra `business_unit_id` explícito **además** del mixin. Lo de otra empresa responde igual que lo inexistente (CA-12).
- **Nada se borra (C0129 R3, CA-17):** las versiones publicadas solo cambian `is_current` dentro de `publish`; el borrador es lo único descartable y por soft delete; el módulo no expone método que borre ni que edite una fila publicada.
- **Marcadores (R4, R5, R11):** lista cerrada `TELEWORK_PHOTO_NOTICE_PLACEHOLDERS = ['razon_social'] as const`; el texto legal es **dato** de la plantilla, no código, y su machote definitivo lo entrega asesoría (no es requisito del DoD). Un marcador fuera de la lista se rechaza (422) y jamás se guarda ni se sirve texto crudo. Los valores de marcador se **escapan** antes de insertarse (un `business_unit_legal_name` con marcado no inyecta HTML) y el texto se sanea al guardar, al publicar y al servir. El saneado es `sanitizeTeleworkPolicyHtml` y nada más: **no** se usa `sanitize_notice_html` (es de otro dominio y su whitelist no tiene `h1-h3` ni `span`) ni `sanitize_legal_document_content`.
- **Idioma y tipos:** identificadores en inglés, comentarios y JSDoc en español; TypeScript estricto, **cero `any`**; fechas con luxon/`DateTime`. El hook de commit solo corre eslint (nunca `prettier --write` sobre archivos ajenos).
- **i18n:** bloque raíz `telework_photo_notice` en `resources/langs/es.json` y `en.json` (tras la última clave `telework_location_*`) más las cuatro claves planas `telework_photo_notice_forbidden_{read,write}_{title,message}` junto a las de `telework_policy`/`telework_checklist`/`telework_settings`, que es lo que lee el helper RBAC. Nunca al final del archivo.
- **Manual de QA:** único, de **API** (esta HU no trae pantalla), último entregable y **solo se ENTREGA** (el recorrido lo hace el usuario). Sus reglas viven en `~/.agents/rules/manual-qa/manual-qa-api.md` y `manual-qa-execution.md`; se escribe con la skill `manual-qa` cargada.

## Review Focus

Entradas o condiciones que el spec implica y ningún criterio de aceptación ejercita por sí solo, y que por eso son las más propensas a morder. Cada línea lleva su prueba en la tarea dueña del código.

1. **Marcador repetido o con espacios internos (`{{ razon_social }}` dos veces):** la detección es tolerante al espaciado y la sustitución reemplaza **todas** las apariciones consumiendo el espaciado; CA-03 solo prueba la forma exacta una vez. Prueba en **Tarea 3** (unitario: publicar un borrador con `{{ razon_social }} … {{razon_social}}` deja las dos resueltas y ningún `{{` en el texto publicado).
2. **`rendered_content` alterado por SQL se sirve saneado:** CA-08 ejercita el saneado al servir sobre `content` (borrador); el camino que sirve **versiones publicadas** (`rendered_content`) no está cubierto y es el que alimenta el acuse del colaborador. Prueba en **Tarea 4** (funcional: una fila publicada alterada por `db.table(...).update` con `<script>` se sirve sin él, tanto en `GET /` como en `GET /versions`).
3. **Alcance no resuelto en cualquier método del servicio (`businessUnitId <= 0`):** CA-15(e) cubre solo `hasAcknowledgedCurrent`; las lecturas (plantilla, estado, versiones) y las escrituras (borrador, publicar) deben fallar cerrado **sin tocar el repositorio**. Prueba en **Tarea 2** (unitario: cada método público lanza y el repositorio falso registra cero llamadas).
4. **`GET /` de una empresa sin aviso no consulta la plantilla:** CA-01 y CA-11 prueban cada camino por separado, pero si el estado dependiera de la plantilla, una empresa sin aviso recibiría 404 en el primer request, que es el request con el que abre la pestaña de `VLRH-H1791311160233`. Prueba en **Tarea 2** (unitario: `getState` responde `{ current: null, draft: null }` y el repositorio falso registra que `findTemplateCurrent` **no** se llamó).
5. **El borrador descartado no reaparece:** CA-10 prueba que la versión no se reutiliza (v3 tras descartar la v2), pero no que el descarte deje de ser visible: un descarte que solo marcara `status` dejaría dos borradores «vivos» y el siguiente `POST /draft` daría 409 espurio. Prueba en **Tarea 4** (funcional: tras `DELETE /draft`, `GET /` responde `draft: null` y `/versions` no lista la fila descartada, mientras v1 sigue vigente).

---

### Tarea 1 (gsti-rh-api): Datos — migraciones, modelos, semilla de la plantilla y constantes del aviso

Las tres tablas de §10 con sus llaves, los tres modelos (uno con cifrado en reposo), la lista cerrada de marcadores y la plantilla base sembrada con texto provisional. Es lo que consumen las tareas 2-4 y lo que hace existir el conteo de acuses desde el primer día.

**Files:**
- Create: `database/migrations/<P>001_create_telework_photo_notice_templates_table.ts`
- Create: `database/migrations/<P>002_create_telework_photo_notices_table.ts`
- Create: `database/migrations/<P>003_create_telework_photo_notice_acknowledgements_table.ts` (`<P>` = los 10 primeros dígitos del prefijo generado, Paso 1)
- Create: `app/models/telework_photo_notice_template.ts`
- Create: `app/models/telework_photo_notice.ts`
- Create: `app/models/telework_photo_notice_acknowledgement.ts`
- Create: `app/constants/telework_photo_notice.ts`
- Create: `database/seeders/0067_telework_photo_notice_templates_seeder.ts`
- Test: Create `tests/functional/telework_photo_notice.spec.ts` (nace con las fixtures del archivo y el grupo «esquema y semilla»; los grupos HTTP los agregan las Tareas 2-4)

**Interfaces:**
- Consumes: nada de tareas previas. Molde de migración: `database/migrations/1783200000001_create_telework_policies_table.ts`; molde de modelo: `app/models/telework_policy.ts` (`compose(BaseModel, SoftDeletes, withBusinessUnitScope())`) y `app/models/telework_policy_acknowledgement.ts` (IP y user-agent cifrados); molde de seeder con `updateOrCreate`: `database/seeders/0028_stps_authority_seeder.ts`.
- Produces (Tareas 2-4 lo consumen; los consumidores de §9 también):
  - Tablas `telework_photo_notice_templates`, `telework_photo_notices`, `telework_photo_notice_acknowledgements` con las columnas, llaves e índices exactos de §10 («Qué información hay que guardar» del spec y §10 del contrato técnico).
  - `app/constants/telework_photo_notice.ts`:
    - `export const TELEWORK_PHOTO_NOTICE_STATUSES = ['draft', 'published'] as const` y `export type TeleworkPhotoNoticeStatus = (typeof TELEWORK_PHOTO_NOTICE_STATUSES)[number]`.
    - `export const TELEWORK_PHOTO_NOTICE_PLACEHOLDERS = ['razon_social'] as const` y `export type TeleworkPhotoNoticePlaceholder = (typeof TELEWORK_PHOTO_NOTICE_PLACEHOLDERS)[number]`.
    - `export const TELEWORK_PHOTO_NOTICE_PLACEHOLDER_MARKERS: Record<TeleworkPhotoNoticePlaceholder, (businessUnit: Pick<BusinessUnit, 'businessUnitLegalName'>) => string> = { razon_social: (businessUnit) => businessUnit.businessUnitLegalName }` (importa `BusinessUnit` de `#models/business_unit`; el `Pick` deja al llamador pasar `{ businessUnitLegalName }` sin inventar una empresa entera).
  - Modelos: `TeleworkPhotoNoticeTemplate` (`static table = 'telework_photo_notice_templates'`, **sin** mixin ni soft delete), `TeleworkPhotoNotice` (con `withBusinessUnitScope()` **y** `SoftDeletes`, `deletedAt` mapeado a `telework_photo_notice_deleted_at`), `TeleworkPhotoNoticeAcknowledgement` (con `withBusinessUnitScope()`, sin soft delete, IP y user-agent cifrados con `serializeAs: null` y descifrado fallo-cerrado). Nombres de propiedad `teleworkPhotoNotice*` / `teleworkPhotoNoticeTemplate*` / `teleworkPhotoNoticeAcknowledgement*` como en §10 y §11.
  - Seeder `0067_telework_photo_notice_templates_seeder.ts` con `TEMPLATE_VERSION = '2026.1'`, idempotente por `updateOrCreate`.

- [ ] **Paso 1: generar el prefijo de las tres migraciones**

Run: `node ace make:migration create_telework_photo_notice_templates_table`
Expected: archivo nuevo con prefijo de 13 dígitos. Anota el nombre real, toma sus **primeros 10 dígitos** como `P` y **borra el archivo generado**: las tres migraciones se llaman `<P>001_…`, `<P>002_…`, `<P>003_…` (sufijo incremental del mismo largo; patrón de `1788912000001_`/`1788912000002_` de `.claude/rules/migraciones-lucid.md`).

Verifica que `P` sea posterior a la última migración numerada (línea base: `1792467935`):

Run: `P=<los 10 dígitos anotados>; [ "$P" -gt 1792467935 ] && echo posterior || echo NO-posterior`
Expected: `posterior` (si el reloj de la máquina diera un prefijo no posterior, no se avanza con uno a mano: se reporta y se espera).

- [ ] **Paso 2: escribir el grupo «esquema y semilla» del spec funcional (rojo)**

`tests/functional/telework_photo_notice.spec.ts` — cabecera del archivo y fixtures compartidas (los grupos HTTP de las Tareas 2-4 se cuelgan de aquí):

```ts
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import TeleworkPhotoNoticeTemplate from '#models/telework_photo_notice_template'
import TeleworkPhotoNoticeAcknowledgement from '#models/telework_photo_notice_acknowledgement'
import TeleworkPhotoNotice from '#models/telework_photo_notice'
import TeleworkPhotoNoticeTemplatesSeeder from '#database/seeders/0067_telework_photo_notice_templates_seeder'
import { TenantContext } from '#utils/tenant_context'
import { createTenantActor, cleanupTenantActor, grantModulePermissions, type TenantActor } from '#tests/helpers/tenant_actor'
import { opaqueEmployeeSlug } from '#tests/helpers/employee_fixture'
import { createDepartmentFixture, createPositionFixture, cleanupOrgChartFixtures } from '#tests/helpers/org_chart_fixtures'

/** Nombre legal de la empresa A: el spec lo fija así porque CA-03 comprueba el escapado. */
const A_LEGAL_NAME = 'Acme <b>& Hijos</b>'
/** Versión de la plantilla sembrada (spec §10). */
const TEMPLATE_VERSION = '2026.1'
/** Leído del spec: el texto provisional se reconoce por esta leyenda. */
const PROVISIONAL_LEGEND = 'Texto provisional'
```

Fixtures del archivo (por grupo, molde `useScenario` de `tests/functional/telework_checklist.spec.ts`):

```ts
interface Scenario {
  a: TenantActor            // empresa A, rol propio (arranca SIN concesiones: las siembra cada caso)
  b: TenantActor            // empresa B, para CA-12
  employeeAId: number       // colaborador de A (dueño de los acuses de fixture)
}

function useScenario(group: ScenarioGroup, prefix: string): void {
  group.setup(async () => { scenario = await createScenario(prefix) })
  group.teardown(async () => { await cleanupScenario(scenario); scenario = null })
}

async function insertNotice(businessUnitId: number, actorUserId: number, overrides?: Partial<NoticeFixtureRow>): Promise<number>
async function insertEmployee(businessUnitId: number, prefix: string): Promise<number>
async function insertAcknowledgement(businessUnitId: number, noticeId: number, employeeId: number, acknowledgedAt?: DateTime): Promise<number>
async function countNotices(businessUnitId: number): Promise<number>
```

Reglas del archivo, que valen para todas las tareas:

- `createScenario` crea los dos actores con `createTenantActor('<prefix>-a')` / `'<prefix>-b'` y les pone el nombre legal de A: `scenario.a.businessUnit.businessUnitLegalName = A_LEGAL_NAME; await scenario.a.businessUnit.save()`. Siembra las concesiones con `grantModulePermissions(actor, 'telework-policy', […])` **dentro de cada caso** (nunca en el `setup`), para que el caso de 403 vea el rol vacío.
- `insertNotice` inserta por `db.table('telework_photo_notices')` con estos valores por defecto (los casos pisan lo que necesiten con `overrides`): `business_unit_id`, `telework_photo_notice_version: 1`, `telework_photo_notice_title: 'Aviso de privacidad'`, `telework_photo_notice_content: '<p>La empresa {{razon_social}} informa.</p>'`, `telework_photo_notice_rendered_content: null`, `telework_photo_notice_status: 'published'`, `telework_photo_notice_is_current: true`, `created_by_user_id`/`updated_by_user_id: actorUserId`, `telework_photo_notice_created_at`/`_updated_at: new Date()`; devuelve el id insertado. La clave del helper se llama `NoticeFixtureRow` y lleva el tipo de cada columna de §10 (con `null` donde es nullable).
- `insertEmployee` espeja `insertEmployee` de `tests/functional/telework_checklist.spec.ts`: persona, departamento y puesto dentro de `TenantContext.run([businessUnitId], …)` y la fila de `employees` por `db.table('employees').insert({ …, business_unit_id: businessUnitId, employee_work_schedule: 'Remote', employee_type_id: 1, employee_slug: opaqueEmployeeSlug(), employee_code, employee_sync_id })`.
- `insertAcknowledgement` inserta por `db.table('telework_photo_notice_acknowledgements')` con `telework_photo_notice_id`, `employee_id`, `business_unit_id` (siempre el de la empresa, nunca del payload), `telework_photo_notice_acknowledgement_acknowledged_at` (por defecto `DateTime.now().toJSDate()`) y `telework_photo_notice_acknowledgement_created_at`.
- **Las lecturas por MODELO van dentro de `TenantContext.run([businessUnitId], …)`**: el mixin `withBusinessUnitScope()` lanza `TenantContextMissingException` fuera de una petición HTTP (dentro de una petición lo pone el middleware). Las escrituras por `db.table(...)` y el modelo de la plantilla —que no tiene mixin— no lo necesitan.
- **Orden de limpieza (obligatorio: las FK son `RESTRICT`):** `cleanupScenario` borra primero `telework_photo_notice_acknowledgements` de la empresa, después `telework_photo_notices` de la empresa, después el colaborador (sus filas de `employees` y su `person`), después `cleanupOrgChartFixtures(businessUnitId)` y **al final** `cleanupTenantActor(actor)`. Los avisos referencian `created_by_user_id` (`RESTRICT`) y los acuses referencian el aviso (`RESTRICT`): limpiar en otro orden deja la limpieza a medias.

Grupo nuevo (el rojo de esta tarea):

```ts
test.group('avisos de fotos — esquema, semilla y acuse cifrado', (group) => {
  useScenario(group, 'esquema')

  test('Objetivo: el seeder 0067 corre dos veces y deja una sola plantilla vigente con su marcador', async ({ assert }) => {
    const correrSeeder = () => new TeleworkPhotoNoticeTemplatesSeeder(db.connection()).run()
    await correrSeeder()
    await correrSeeder()

    const plantillas = await TeleworkPhotoNoticeTemplate.query()
      .where('telework_photo_notice_template_version', TEMPLATE_VERSION)
    assert.lengthOf(plantillas, 1)
    assert.isTrue(plantillas[0].teleworkPhotoNoticeTemplateIsCurrent)
    assert.include(plantillas[0].teleworkPhotoNoticeTemplateContent, '{{razon_social}}')
    assert.include(plantillas[0].teleworkPhotoNoticeTemplateContent, PROVISIONAL_LEGEND)
  })

  test('Objetivo: la IP y el user-agent del acuse viajan cifrados y nunca se serializan', async ({ assert }) => {
    const businessUnitId = scenario.a.businessUnit.businessUnitId
    const noticeId = await insertNotice(businessUnitId, scenario.a.user.userId)

    const acuse = new TeleworkPhotoNoticeAcknowledgement()
    acuse.teleworkPhotoNoticeId = noticeId
    acuse.employeeId = scenario.employeeAId
    acuse.businessUnitId = businessUnitId
    acuse.teleworkPhotoNoticeAcknowledgementAcknowledgedAt = DateTime.now()
    acuse.teleworkPhotoNoticeAcknowledgementIp = '189.203.44.7'
    acuse.teleworkPhotoNoticeAcknowledgementUserAgent = 'QA-Agente/1.0'
    await acuse.save()

    const crudo = (await db
      .from('telework_photo_notice_acknowledgements')
      .where('telework_photo_notice_acknowledgement_id', acuse.teleworkPhotoNoticeAcknowledgementId)
      .select('telework_photo_notice_acknowledgement_ip', 'telework_photo_notice_acknowledgement_user_agent')
      .first()) as {
      telework_photo_notice_acknowledgement_ip: string
      telework_photo_notice_acknowledgement_user_agent: string
    }
    assert.notInclude(crudo.telework_photo_notice_acknowledgement_ip, '189.203.44.7')
    assert.notInclude(crudo.telework_photo_notice_acknowledgement_user_agent, 'QA-Agente/1.0')

    const releido = await TenantContext.run([businessUnitId], () =>
      TeleworkPhotoNoticeAcknowledgement.findOrFail(acuse.teleworkPhotoNoticeAcknowledgementId)
    )
    assert.equal(releido.teleworkPhotoNoticeAcknowledgementIp, '189.203.44.7')
    assert.equal(releido.teleworkPhotoNoticeAcknowledgementUserAgent, 'QA-Agente/1.0')
    assert.notProperty(releido.serialize(), 'teleworkPhotoNoticeAcknowledgementIp')
    assert.notProperty(releido.serialize(), 'teleworkPhotoNoticeAcknowledgementUserAgent')
  })

  test('Objetivo: una versión por empresa y un acuse no se pueden borrar aunque se intente por SQL', async ({ assert }) => {
    const businessUnitId = scenario.a.businessUnit.businessUnitId
    const noticeId = await insertNotice(businessUnitId, scenario.a.user.userId)

    await assert.rejects(
      insertNotice(businessUnitId, scenario.a.user.userId, { teleworkPhotoNoticeVersion: 1 }),
      (error: { code?: string }) => error.code === 'ER_DUP_ENTRY'
    )

    const enB = await insertNotice(scenario.b.businessUnit.businessUnitId, scenario.b.user.userId, {
      teleworkPhotoNoticeVersion: 1,
    })
    assert.isNumber(enB)

    await insertAcknowledgement(businessUnitId, noticeId, scenario.employeeAId)
    await assert.rejects(
      db.from('telework_photo_notices').where('telework_photo_notice_id', noticeId).delete()
    )
  })
})
```

- [ ] **Paso 3: correr y verificar el rojo**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="telework_photo_notice.spec.ts"`
Expected: FAIL (`Table 'sae_pruebas.telework_photo_notice_templates' doesn't exist` y el import del seeder que aún no existe).

- [ ] **Paso 4: escribir las tres migraciones (columnas de §10, verbatim)**

`<P>001` — `telework_photo_notice_templates` (global; sin `business_unit_id`, sin soft delete):

```ts
this.schema.createTable(this.tableName, (table) => {
  table.increments('telework_photo_notice_template_id')
  table.string('telework_photo_notice_template_version', 20).notNullable().unique()
  table.string('telework_photo_notice_template_title', 150).notNullable()
  table.text('telework_photo_notice_template_content', 'longtext').notNullable()
  table.boolean('telework_photo_notice_template_is_current').notNullable().defaultTo(true)
  table.timestamp('telework_photo_notice_template_created_at').notNullable()
  table.timestamp('telework_photo_notice_template_updated_at').nullable()
  table.index(['telework_photo_notice_template_is_current'], 'idx_twpnt_current')
})
```

`<P>002` — `telework_photo_notices` (una fila por versión y empresa):

```ts
table.increments('telework_photo_notice_id')
table.integer('business_unit_id').unsigned().notNullable()
table.integer('telework_photo_notice_template_id').unsigned().nullable()
table.integer('telework_photo_notice_version').unsigned().notNullable()
table.string('telework_photo_notice_title', 150).notNullable()
table.text('telework_photo_notice_content', 'longtext').notNullable()
table.text('telework_photo_notice_rendered_content', 'longtext').nullable()
table.enum('telework_photo_notice_status', ['draft', 'published']).notNullable().defaultTo('draft')
table.boolean('telework_photo_notice_is_current').notNullable().defaultTo(false)
table.string('telework_photo_notice_content_hash', 128).nullable()
table.integer('created_by_user_id').unsigned().notNullable()
table.integer('updated_by_user_id').unsigned().notNullable()
table.integer('published_by_user_id').unsigned().nullable()
table.timestamp('published_at').nullable()
table.timestamp('telework_photo_notice_created_at').notNullable()
table.timestamp('telework_photo_notice_updated_at').notNullable()
table.timestamp('telework_photo_notice_deleted_at').nullable()
```

FKs: `business_unit_id` → `business_units` `CASCADE` (`fk_twpn_business_unit`); `telework_photo_notice_template_id` → `telework_photo_notice_templates` `SET NULL` (`fk_twpn_template`); `created_by_user_id` y `updated_by_user_id` → `users` `RESTRICT` (`fk_twpn_created_by_user`, `fk_twpn_updated_by_user`); `published_by_user_id` → `users` `SET NULL` (`fk_twpn_published_by_user`). Índices: `table.unique(['business_unit_id', 'telework_photo_notice_version'], { indexName: 'uq_twpn_business_unit_version' })` y `table.index(['business_unit_id', 'telework_photo_notice_is_current'], 'idx_twpn_business_unit_current')`.

`<P>003` — `telework_photo_notice_acknowledgements` (inmutable; sin `updated_at` ni `deleted_at`): `telework_photo_notice_acknowledgement_id` increments; `telework_photo_notice_id`/`employee_id`/`business_unit_id` int unsigned notNullable con FKs `RESTRICT` (`fk_twpna_notice`, `fk_twpna_employee`, `fk_twpna_business_unit`); `…_acknowledged_at` timestamp notNullable; `…_ip` string(191) nullable; `…_user_agent` text nullable; `…_created_at` timestamp notNullable. `UNIQUE(['telework_photo_notice_id', 'employee_id'], { indexName: 'uq_twpna_notice_employee' })` e `index(['business_unit_id', 'employee_id'], 'idx_twpna_business_unit_employee')`.

`down()` de las tres: `this.schema.dropTableIfExists(this.tableName)` y nada más. **Sin `await` sobre `this.schema`.**

- [ ] **Paso 5: escribir los tres modelos**

`TeleworkPhotoNoticeTemplate` (`extends BaseModel`, sin mixin): `teleworkPhotoNoticeTemplateVersion`, `…TemplateTitle`, `…TemplateContent`, `…TemplateIsCurrent` con `consume: (value: boolean | number) => Boolean(value)`, y los dos timestamps (`autoCreate` / `autoCreate + autoUpdate`, nullable el updated).

`TeleworkPhotoNotice` (`compose(BaseModel, SoftDeletes, withBusinessUnitScope())`): `teleworkPhotoNoticeId`, `businessUnitId`, `teleworkPhotoNoticeTemplateId: number | null`, `teleworkPhotoNoticeVersion`, `…Title`, `…Content`, `…RenderedContent: string | null`, `teleworkPhotoNoticeStatus: TeleworkPhotoNoticeStatus`, `…IsCurrent` (con `consume` booleano), `…ContentHash: string | null`, `createdByUserId` y `publishedByUserId` con `serializeAs: null`, `updatedByUserId`, `publishedAt` con `@column.dateTime()`, los timestamps y `deletedAt` con `@column.dateTime({ columnName: 'telework_photo_notice_deleted_at' })`. Relaciones `businessUnit` y `publisher` (`@belongsTo(() => User, { foreignKey: 'publishedByUserId' })`, es la que resuelve `publishedByName`).

`TeleworkPhotoNoticeAcknowledgement` (`compose(BaseModel, withBusinessUnitScope())`, sin `SoftDeletes`): copia literal del tratamiento de `app/models/telework_policy_acknowledgement.ts` para `…Ip` (`string(191)`) y `…UserAgent`: `serializeAs: null`, `prepare` con `encryption.encrypt`, `consume` con `encryption.decrypt` dentro de `try/catch` que devuelve `null` (fallo-cerrado). Más `teleworkPhotoNoticeId`, `employeeId`, `businessUnitId`, `teleworkPhotoNoticeAcknowledgementAcknowledgedAt` (`@column.dateTime()`) y `…CreatedAt` (`autoCreate`, **sin** `updatedAt`). Relación `notice` (`@belongsTo(() => TeleworkPhotoNotice, { foreignKey: 'teleworkPhotoNoticeId' })`).

- [ ] **Paso 6: escribir `app/constants/telework_photo_notice.ts`**

Con los tres exports de Interfaces y su JSDoc citando la regla (lista cerrada de §7 y R4; el mapa de sustitución; `razon_social` → `business_unit_legal_name`, única fuente del dato de la empresa).

- [ ] **Paso 7: escribir el seeder `0067_telework_photo_notice_templates_seeder.ts`**

```ts
const TEMPLATE_VERSION = '2026.1'
const TEMPLATE_TITLE = 'Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo'
const TEMPLATE_CONTENT =
  '<p><strong>Texto provisional: sustituir por el machote de asesoría.</strong> ' +
  '{{razon_social}} pone a tu disposición el presente aviso de privacidad respecto de las ' +
  'fotografías de tu espacio de trabajo que se recaban como evidencia de la lista de ' +
  'verificación de condiciones del teletrabajo, en los términos de la Ley Federal de ' +
  'Protección de Datos Personales en Posesión de los Particulares.</p>'

export default class extends BaseSeeder {
  async run() {
    await TeleworkPhotoNoticeTemplate.updateOrCreate(
      { teleworkPhotoNoticeTemplateVersion: TEMPLATE_VERSION },
      {
        teleworkPhotoNoticeTemplateTitle: sanitizeTeleworkPolicyHtml(TEMPLATE_TITLE),
        teleworkPhotoNoticeTemplateContent: sanitizeTeleworkPolicyHtml(TEMPLATE_CONTENT),
        teleworkPhotoNoticeTemplateIsCurrent: true,
      }
    )
  }
}
```

**El texto legal no se inventa** (C0129 R11): es un párrafo provisional marcado con la leyenda, con su marcador, saneado antes de guardarse, e idempotente por versión.

- [ ] **Paso 8: migrar, sembrar y verificar el verde**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed`
Expected: sin errores, las tres tablas nuevas y el seeder `0067` entre los corridos.

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace db:seed --files=database/seeders/0067_telework_photo_notice_templates_seeder.ts` (dos veces)
Expected: idempotente; conteo de `telework_photo_notice_templates` = **1** en ambas corridas.

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:rollback && NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:run` (nunca dos migraciones a la vez)
Expected: reversión limpia (las tres tablas se dropean) y re-run limpio. Volver a dejar la base al día con `migration:fresh --seed` antes de la siguiente corrida de pruebas.

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="telework_photo_notice.spec.ts"`
Expected: PASSED (los tres casos del grupo «esquema y semilla»).

- [ ] **Paso 9: commit**

```bash
git add database/migrations/<P>001_create_telework_photo_notice_templates_table.ts \
        database/migrations/<P>002_create_telework_photo_notices_table.ts \
        database/migrations/<P>003_create_telework_photo_notice_acknowledgements_table.ts \
        app/models/telework_photo_notice_template.ts app/models/telework_photo_notice.ts \
        app/models/telework_photo_notice_acknowledgement.ts app/constants/telework_photo_notice.ts \
        database/seeders/0067_telework_photo_notice_templates_seeder.ts \
        tests/functional/telework_photo_notice.spec.ts
git commit -m "feat(teletrabajo): agrega el aviso de privacidad de las fotos del puesto a nivel de datos

Plantilla base global, avisos versionados por empresa con su llave
unica y la tabla de acuses que nace vacia para contar por version,
mas el seeder de la plantilla con texto provisional marcado.

Refs: VLRH-H1791306079310"
```

(El mensaje del commit anota los nombres reales de las tres migraciones.)

---

### Tarea 2 (gsti-rh-api): Dominio de lectura — error, DTO, puerto, adaptador y servicio (estado, borrador, versiones y acuse vigente)

El contrato completo sin HTTP: la forma del error de dominio, los dos DTO de §11, el puerto con sus escrituras, el adaptador que filtra la empresa en cada consulta, y el servicio que sirve la plantilla, el estado, el ciclo del borrador, el historial y `hasAcknowledgedCurrent`.

**Files:**
- Create: `app/modules/telework-photo-notice/telework_photo_notice.error.ts`
- Create: `app/modules/telework-photo-notice/dto/telework_photo_notice.dto.ts`
- Create: `app/modules/telework-photo-notice/validators/telework_photo_notice_update.validator.ts`
- Create: `app/modules/telework-photo-notice/telework_photo_notice.repository.ts`
- Create: `app/modules/telework-photo-notice/telework_photo_notice.repository.mysql.ts`
- Create: `app/modules/telework-photo-notice/telework_photo_notice.service.ts`
- Test: Create `tests/unit/modules/telework-photo-notice/telework_photo_notice.service.spec.ts` (parte 1: plantilla, estado, borrador, versiones y acuse vigente)

**Interfaces:**
- Consumes: las tres tablas y los modelos de la Tarea 1; `sanitizeTeleworkPolicyHtml` de `#helpers/sanitize_telework_policy_content`; `TELEWORK_PHOTO_NOTICE_PLACEHOLDERS`.
- Produces (Tareas 3-4 y las HUs de §9 lo consumen):
  - `TeleworkPhotoNoticeError` con `key: TeleworkPhotoNoticeErrorKey` y `details?: Record<string, unknown>` (mismo molde de `app/modules/telework-checklist/telework_checklist.error.ts`). Claves de esta tarea: `'aviso-no-publicado' | 'borrador-ya-existe' | 'borrador-no-encontrado' | 'plantilla-no-encontrada'` (`aviso-no-publicado` es el 404 fallo-cerrado del alcance no resuelto y del colaborador inválido). La Tarea 3 agrega `'marcador-no-reconocido' | 'contenido-vacio'`, y con las seis el controller de la Tarea 4 arma su mapa completo.
  - `app/modules/telework-photo-notice/dto/telework_photo_notice.dto.ts` (verbatim de §11, con la unión discriminada por `status`):
    ```ts
    export type NoticeDraftDto = {
      status: 'draft'
      teleworkPhotoNoticeId: number
      version: number
      title: string
      content: string
      templateId: number | null
      updatedAt: string
    }

    export type NoticeVersionDto = {
      status: 'published'
      teleworkPhotoNoticeId: number
      version: number
      title: string
      content: string // resuelto y saneado
      contentHash: string
      isCurrent: boolean
      publishedAt: string
      publishedByUserId: number | null
      publishedByName: string | null
      acknowledgementsCount: number
    }

    export type NoticeStateDto = { current: NoticeVersionDto | null; draft: NoticeDraftDto | null }

    export type NoticeTemplateDto = {
      templateId: number
      version: string
      title: string
      content: string // con marcadores, saneado
      placeholders: string[]
    }
    ```
  - Puerto `TeleworkPhotoNoticeRepository` (`telework_photo_notice.repository.ts`):
    ```ts
    export interface CreateDraftData { businessUnitId: number; version: number; title: string; content: string; templateId: number | null; createdByUserId: number }
    export interface UpdateDraftData { title: string; content: string; updatedByUserId: number }
    export interface MarkAsPublishedData { publishedByUserId: number; renderedContent: string; contentHash: string }

    export interface TeleworkPhotoNoticeRepository {
      findTemplateCurrent(): Promise<TeleworkPhotoNoticeTemplate | null>
      findDraftByBusinessUnit(businessUnitId: number): Promise<TeleworkPhotoNotice | null>
      findDraftByBusinessUnitForUpdate(businessUnitId: number, trx: TransactionClientContract): Promise<TeleworkPhotoNotice | null>
      findCurrentByBusinessUnit(businessUnitId: number): Promise<TeleworkPhotoNotice | null>
      findCurrentByBusinessUnitForUpdate(businessUnitId: number, trx: TransactionClientContract): Promise<TeleworkPhotoNotice | null>
      clearCurrentFlag(teleworkPhotoNoticeId: number, businessUnitId: number, trx: TransactionClientContract): Promise<void>
      findMaxVersion(businessUnitId: number): Promise<number>
      findBusinessUnitLegalName(businessUnitId: number): Promise<string | null>
      createDraft(data: CreateDraftData): Promise<TeleworkPhotoNotice>
      updateDraft(teleworkPhotoNoticeId: number, businessUnitId: number, data: UpdateDraftData): Promise<TeleworkPhotoNotice>
      softDeleteDraft(teleworkPhotoNoticeId: number, businessUnitId: number): Promise<void>
      markAsPublished(teleworkPhotoNoticeId: number, businessUnitId: number, data: MarkAsPublishedData, trx: TransactionClientContract): Promise<TeleworkPhotoNotice>
      listPublishedVersions(businessUnitId: number): Promise<TeleworkPhotoNotice[]>
      countAcknowledgementsByNotice(businessUnitId: number): Promise<Map<number, number>>
      hasAcknowledgement(businessUnitId: number, teleworkPhotoNoticeId: number, employeeId: number): Promise<boolean>
    }
    ```
    Semántica que fija el puerto: las dos consultas de borrador filtran `telework_photo_notice_status = 'draft'` **y** `telework_photo_notice_deleted_at IS NULL`; `findMaxVersion` usa `withTrashed()` (la versión nunca se reutiliza); `listPublishedVersions` filtra `status = 'published'` y `deleted_at IS NULL` y ordena por versión descendente; **todos** los métodos con `businessUnitId` filtran `business_unit_id = ?` explícito.
  - Servicio `TeleworkPhotoNoticeService` (métodos públicos que consumen la Tarea 4 y las HUs de §9):
    ```ts
    constructor(repository: TeleworkPhotoNoticeRepository = new TeleworkPhotoNoticeRepositoryMysql())
    getTemplate(): Promise<NoticeTemplateDto>
    getState(businessUnitId: number): Promise<NoticeStateDto>
    createDraft(businessUnitId: number, actorUserId: number): Promise<NoticeDraftDto>
    updateDraft(businessUnitId: number, input: TeleworkPhotoNoticeUpdateInput, actorUserId: number): Promise<NoticeDraftDto>
    discardDraft(businessUnitId: number): Promise<void>
    listVersions(businessUnitId: number): Promise<NoticeVersionDto[]>
    hasAcknowledgedCurrent(businessUnitId: number, employeeId: number): Promise<boolean>
    ```
    (`publish` llega en la Tarea 3.)
  - `validators/telework_photo_notice_update.validator.ts` con `teleworkPhotoNoticeUpdateValidator` y su tipo de entrada (es lo que `updateDraft` consume y lo que el controller de la Tarea 4 importa):
    ```ts
    export const teleworkPhotoNoticeUpdateValidator = vine.compile(
      vine.object({
        title: vine.string().trim().minLength(3).maxLength(150),
        content: vine.string().trim().minLength(1).maxLength(100_000),
      })
    )
    export type TeleworkPhotoNoticeUpdateInput = Awaited<
      ReturnType<typeof teleworkPhotoNoticeUpdateValidator.validate>
    >
    ```

- [ ] **Paso 1: escribir la parte 1 del spec unitario (rojo)**

`tests/unit/modules/telework-photo-notice/telework_photo_notice.service.spec.ts` — molde `tests/unit/modules/telework-policy/telework_policy.service.spec.ts`: repositorio falso en memoria con bitácora de llamadas (`calls: Array<{ method: string; args: unknown[] }>`) y `db.transaction` real (no se mockea). Filas falsas con la forma de `TeleworkPhotoNotice` y `publisher` opcional, más un `callsOf(method)` para afirmar qué se llamó. Casos:

```ts
test('Objetivo: Review Focus 3 — todo método público falla cerrado sin tocar el repositorio (businessUnitId <= 0)', …)
// getTemplate no recibe empresa; getState/createDraft/updateDraft/discardDraft/listVersions/hasAcknowledgedCurrent
// lanzan TeleworkPhotoNoticeError('aviso-no-publicado') con businessUnitId 0 y -1, y calls queda vacío.

test('Objetivo: Review Focus 4 — el estado de una empresa sin aviso no consulta la plantilla', …)
// getState() → { current: null, draft: null } y calls NO contiene 'findTemplateCurrent'.

test('Objetivo: CA-11 — sin plantilla vigente, getTemplate rechaza con plantilla-no-encontrada', …)
// findTemplateCurrent → null ⇒ throw key 'plantilla-no-encontrada'.

test('Objetivo: CA-01 — la plantilla base se sirve con marcadores sin resolver y la lista cerrada', …)
// getTemplate() → { templateId, version, title, content con '{{razon_social}}', placeholders: ['razon_social'] }.

test('Objetivo: CA-02 — el primer borrador nace de la plantilla vigente con version 1', …)
// createDraft(5, 9) ⇒ draft con version 1, title/content de la plantilla, templateId de la plantilla,
// status 'draft'; y en el repo la fila se creó con createdByUserId 9 e isCurrent false.

test('Objetivo: CA-02 — el segundo borrador nace de la última versión publicada y con la versión siguiente', …)
// con v1 publicada (id 30): createDraft(5, 9) ⇒ version 2, title/content de v1 (con marcadores), templateId heredado.

test('Objetivo: CA-10 — un borrador vivo rechaza otro borrador (409 borrador-ya-existe)', …)

test('Objetivo: CA-09 — el UNIQUE atrapado se traduce a 409 y nunca a 500', …)
// el repo falso lanza un Error con code 'ER_DUP_ENTRY' ⇒ key 'borrador-ya-existe'.

test('Objetivo: CA-10 — editar/descartar sin borrador es borrador-no-encontrado', …)
// updateDraft y discardDraft con repo sin borrador ⇒ key 'borrador-no-encontrado' (404);
// y discardDraft con borrador ⇒ softDeleteDraft llamado UNA vez con (id, businessUnitId) y ninguna escritura a published.

test('Objetivo: CA-05 — las versiones salen descendentes, sin borradores y con el conteo de cada una', …)
// v1 y v2 publicadas + un borrador vivo + counts {1: 1} ⇒ [v2 (count 0), v1 (count 1)] y sin el borrador.

test('Objetivo: CA-05 y CA-12 — sin versiones publicadas la lista es vacía y no es 404', …)

test('Objetivo: CA-15 — hasAcknowledgedCurrent responde por la vigente y solo por ella', …)
// (a) sin publicada ⇒ false sin consultar acuses; (b) acuse del empleado 10 en la vigente ⇒ true;
// (c) tras publicar la v2 ⇒ false y la fila del acuse de v1 sigue en el repo;
// (d) un acuse de la empresa 6 no hace true la consulta de la empresa 5;
// (e) businessUnitId <= 0 o employeeId <= 0 ⇒ lanza sin consultar.
```

- [ ] **Paso 2: correr y verificar el rojo**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test unit --files="telework-photo-notice/telework_photo_notice.service.spec.ts"`
Expected: FAIL (el módulo y el servicio no existen).

- [ ] **Paso 3: implementar error, DTO, validador, puerto, adaptador y servicio**

- `telework_photo_notice.error.ts`: el union y la clase con `key`/`details` (molde `telework_checklist.error.ts`), JSDoc citando que el `code` lo resuelve el controller.
- `telework_photo_notice_update.validator.ts`: el validador y su tipo, con el JSDoc que explica por qué el tope de contenido es 100 000 (el spec lo fija en §11 y lo comprueba CA-14) y por qué la forma la valida Vine mientras las reglas de negocio las decide el servicio.
- El adaptador `repository.mysql.ts`: molde `telework_policy.repository.mysql.ts` en la mecánica (`firstOrFail`, `useTransaction`, `load('publisher', …)`, `$extras` del `max()`, `withTrashed()`), con **filtro explícito `where('business_unit_id', businessUnitId)` en cada consulta** (desviación obligatoria del molde, §7). `countAcknowledgementsByNotice` se resuelve con un `group by` sobre `telework_photo_notice_id` en `telework_photo_notice_acknowledgements` y devuelve `Map<number, number>`; `hasAcknowledgement` con un `select … first()` booleano; `findBusinessUnitLegalName` con `db.from('business_units').where('business_unit_id', …).select('business_unit_legal_name')`; `softDeleteDraft` **sin `.delete()`** (CA-17): carga la fila escopeada, `record.deletedAt = DateTime.now()`, `await record.save()`; `createDraft` escribe `status 'draft'`, `isCurrent false`, `contentHash null`, `publishedByUserId null`, `publishedAt null`, `publishedByUserId/createdBy` …
- El servicio, con los métodos de Interfaces y estas reglas, todas verificables:
  - `assertScopeResolved(businessUnitId)`: si `businessUnitId` no es entero positivo → `TeleworkPhotoNoticeError('aviso-no-publicado')` (mismo criterio fallo-cerrado que `assertScopeResolved` del molde, que reusa su 404 más cercano).
  - `getTemplate`: plantilla vigente → `{ templateId, version, title, content: sanitizeTeleworkPolicyHtml(content), placeholders: [...TELEWORK_PHOTO_NOTICE_PLACEHOLDERS] }`; sin plantilla → `plantilla-no-encontrada`.
  - `getState`: `{ current, draft }`, cada uno mapeado a su DTO; **no** consulta la plantilla y **no** crea nada; `current` lleva su `acknowledgementsCount` (0 si el mapa no lo trae).
  - `createDraft`: borrador vivo → `borrador-ya-existe`; si no, versión vigente publicada → copia `title`/`content` (con marcadores) y hereda `templateId`; si no hay ninguna, plantilla vigente → 404 `plantilla-no-encontrada` si falta; `version = findMaxVersion + 1`; el `INSERT` se envuelve en `try/catch` y `ER_DUP_ENTRY` se traduce a `borrador-ya-existe` (CA-09: nunca 500). El guardado sanea el contenido con `sanitizeTeleworkPolicyHtml`.
  - `updateDraft`: sin borrador → `borrador-no-encontrado`; guarda `title` y `content` saneado y devuelve el DTO.
  - `discardDraft`: sin borrador → `borrador-no-encontrado`; llama `softDeleteDraft`.
  - `listVersions`: versiones publicadas descendentes con su conteo; **lista vacía = `[]` con 200**, nunca 404 (CA-12; desviación consciente del molde que lanza 404 al vacío).
  - `hasAcknowledgedCurrent`: `assertScopeResolved`; `employeeId` no entero positivo → lanza sin consultar; sin vigente → `false` sin consultar acuses; con vigente → `hasAcknowledgement(businessUnitId, current.teleworkPhotoNoticeId, employeeId)`.
  - `buildVersionDto` / `buildDraftDto`: `publishedByName` se resuelve del `publisher` precargado (nombre de la persona y, si no hay, el correo del usuario; `null` si la fila no está publicada o el usuario se eliminó) y `publishedAt` sale del `DateTime` de la fila; el `content` que viaja en un `NoticeVersionDto` es el **resuelto** (`renderedContent`), saneado.

- [ ] **Paso 4: correr y verificar el verde**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test unit --files="telework-photo-notice/telework_photo_notice.service.spec.ts"`
Expected: PASSED (todos los casos de la parte 1).

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="telework_photo_notice.spec.ts"` → PASSED (el grupo de la Tarea 1 sigue verde).
Run: `./node_modules/.bin/tsc --noEmit` → exit 0. `./node_modules/.bin/eslint app/modules/telework-photo-notice` → 0 problemas.

- [ ] **Paso 5: commit**

```bash
git add app/modules/telework-photo-notice/telework_photo_notice.error.ts \
        app/modules/telework-photo-notice/dto/telework_photo_notice.dto.ts \
        app/modules/telework-photo-notice/telework_photo_notice.repository.ts \
        app/modules/telework-photo-notice/telework_photo_notice.repository.mysql.ts \
        app/modules/telework-photo-notice/telework_photo_notice.service.ts \
        tests/unit/modules/telework-photo-notice/telework_photo_notice.service.spec.ts
git commit -m "feat(teletrabajo): agrega el dominio de lectura del aviso de fotos del puesto

Estado, plantilla, ciclo del borrador, historial de versiones con su
conteo de acuses y hasAcknowledgedCurrent, con el filtro de empresa
explicito en cada consulta del adaptador.

Refs: VLRH-H1791306079310"
```

---

### Tarea 3 (gsti-rh-api): Publicación — motor de marcadores, saneado, huella y transacción del aviso

Lo que convierte un borrador en una versión inmutable: detección y sustitución escapada de marcadores, segundo saneado, no-vacío, SHA-256 y el orden de publicación dentro de una transacción que deja una sola vigente.

**Files:**
- Modify: `app/modules/telework-photo-notice/telework_photo_notice.service.ts` (`publish` y sus privados; el union de `telework_photo_notice.error.ts` gana dos claves)
- Test: Modify `tests/unit/modules/telework-photo-notice/telework_photo_notice.service.spec.ts` (parte 2: publicación)

**Interfaces:**
- Consumes: el puerto y el servicio de la Tarea 2; `TELEWORK_PHOTO_NOTICE_PLACEHOLDERS` y `TELEWORK_PHOTO_NOTICE_PLACEHOLDER_MARKERS` de la Tarea 1; `sanitizeTeleworkPolicyHtml`.
- Produces (la Tarea 4 lo cablea y las HUs de §9 dependen del resultado publicado):
  - `publish(businessUnitId: number, actorUserId: number): Promise<NoticeVersionDto>` — el texto resuelto queda en `rendered_content`, `content` conserva los marcadores, `content_hash` el SHA-256, `is_current` en la vigente nueva y la anterior apagada, `published_at`/`published_by_user_id` sellados.
  - Claves nuevas del error de dominio: `'marcador-no-reconocido'` (con `details.placeholders: string[]`) y `'contenido-vacio'`.

- [ ] **Paso 1: escribir la parte 2 del spec unitario (rojo)**

Casos (mismo archivo y molde del Paso 1 de la Tarea 2):

```ts
test('Objetivo: CA-03 — publicar resuelve el marcador con el valor escapado y sella la versión', …)
// Empresa A con businessUnitLegalName 'Acme <b>& Hijos</b>' y borrador 'La empresa {{razon_social}} informa.'
// → NoticeVersionDto con status 'published', version 1, isCurrent true, publishedByUserId = actor,
//   publishedAt no vacío y content 'La empresa Acme &lt;b&gt;&amp; Hijos&lt;/b&gt; informa.'
// → la fila guardada conserva content CON el marcador y rendered_content ya resuelto.
// → contentHash === createHash('sha256').update(`${title}\n${content}`, 'utf8').digest('hex')  (del DTO).

test('Objetivo: Review Focus 1 — un marcador con espacios internos se resuelve y todas sus apariciones se sustituyen', …)
// '{{ razon_social }} y otra vez {{razon_social}}' ⇒ 'Acme &lt;b&gt;&amp; Hijos&lt;/b&gt; y otra vez Acme …';
// el texto publicado no contiene '{{'.

test('Objetivo: CA-06 — un marcador fuera de la lista rechaza la publicación y no toca la vigente', …)
// '{{domicilio}}' y '{{ correo }}' ⇒ throw key 'marcador-no-reconocido' con details.placeholders ['domicilio','correo'];
// la vigente anterior conserva is_current true y el borrador sigue en 'draft'.

test('Objetivo: CA-07 — un contenido que queda vacío tras sanear rechaza la publicación', …)
// content '<script>alert(1)</script>' ⇒ throw key 'contenido-vacio'.

test('Objetivo: CA-04 — la v1 publicada no cambia y la v2 queda vigente', …)
// con v1 publicada y un borrador v2: al publicar, v1 queda is_current false sin cambio en content,
// rendered_content, content_hash ni published_at, y v2 is_current true.

test('Objetivo: CA-10 — publicar sin borrador es borrador-no-encontrado y no escribe nada', …)

test('Objetivo: el alcance no resuelto o la empresa inexistente rechazan la publicación sin escribir', …)
// businessUnitId 0 ⇒ lanza y cero llamadas; findBusinessUnitLegalName → null ⇒ lanza y no publica.

test('Objetivo: la huella del texto es la misma para el mismo título y texto resuelto, y distinta si cambia el texto', …)
// determinismo del SHA-256 (dos publicaciones del mismo contenido ⇒ mismo hash; un cambio ⇒ hash distinto).
```

- [ ] **Paso 2: correr y verificar el rojo**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test unit --files="telework-photo-notice/telework_photo_notice.service.spec.ts"`
Expected: FAIL (`publish` no existe).

- [ ] **Paso 3: implementar la publicación en el servicio**

Un solo patrón de detección y sustitución, en privados del servicio (el censo no incluye un archivo de hash propio: el SHA-256 vive aquí, no se reimplementa `telework_policy.hash.ts`, que es por componentes):

```ts
const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

/** Marcadores presentes en el texto, sin repetir y en orden de aparición. */
private extractPlaceholders(content: string): string[] {
  const found = new Set<string>()
  for (const match of content.matchAll(PLACEHOLDER_PATTERN)) found.add(match[1])
  return [...found]
}

/** `& < > " '` escapados, en ese orden: el valor de la empresa nunca viaja como HTML. */
private escapePlaceholderValue(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

private renderPlaceholders(content: string, businessUnitLegalName: string): string {
  return content.replace(PLACEHOLDER_PATTERN, (_match, key: string) => {
    const resolve = TELEWORK_PHOTO_NOTICE_PLACEHOLDER_MARKERS[key as TeleworkPhotoNoticePlaceholder]
    return this.escapePlaceholderValue(resolve({ businessUnitLegalName }))
  })
}

/** Texto sin etiquetas: decide si el aviso quedó vacío tras sanear. */
private plainText(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}

private computeContentHash(title: string, renderedContent: string): string {
  return createHash('sha256').update(`${title}\n${renderedContent}`, 'utf8').digest('hex')
}
```

`matchAll` (no `.test`/`.exec`) porque la expresión es compartida y con bandera `g`: `matchAll` clona la expresión y no arrastra `lastIndex`. `sanitize-html` conserva `{{razon_social}}` y convierte un `&` suelto en `&amp;` (medido con la whitelist real), así que las dos estrellas del orden —escapar antes de sanear— son las que fijan `Acme &lt;b&gt;&amp; Hijos&lt;/b&gt;`.

`publish(businessUnitId, actorUserId)`, en este orden exacto:

1. `assertScopeResolved`. Si `businessUnitId` es inválido → 404 fallo-cerrado.
2. `db.transaction`:
   a. `findDraftByBusinessUnitForUpdate(businessUnitId, trx)` → sin fila → `borrador-no-encontrado`.
   b. `findBusinessUnitLegalName(businessUnitId)` → `null` → `aviso-no-publicado` (imposible en HTTP: el middleware ya resolvió la empresa; fallo-cerrado fuera de él).
   c. saneado del texto del borrador → marcadores desconocidos (los que no están en `TELEWORK_PHOTO_NOTICE_PLACEHOLDERS`, sin repetir) → `marcador-no-reconocido` con `details: { placeholders: [...] }`; **nada se ha escrito todavía**.
   d. sustitución con el valor escapado → **segundo saneado** → si el texto sin etiquetas queda vacío → `contenido-vacio`.
   e. `contentHash = computeContentHash(title, renderedContent)`.
   f. `findCurrentByBusinessUnitForUpdate(businessUnitId, trx)` → si hay, `clearCurrentFlag(id, businessUnitId, trx)`.
   g. `markAsPublished(draft.id, businessUnitId, { publishedByUserId: actorUserId, renderedContent, contentHash }, trx)`.
3. Devolver `buildVersionDto` de la fila publicada (con `acknowledgementsCount: 0`, la versión recién nacida no tiene acuses).

El título que entra a la huella es el **guardado** (saneado y recortado en la Tarea 2), el mismo que sale en el DTO: la prueba recalcula el hash con `title` y `content` del DTO y tiene que coincidir.

- [ ] **Paso 4: correr y verificar el verde**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test unit --files="telework-photo-notice/telework_photo_notice.service.spec.ts"`
Expected: PASSED (partes 1 y 2).

Run: `./node_modules/.bin/tsc --noEmit` → exit 0. `./node_modules/.bin/eslint app/modules/telework-photo-notice` → 0 problemas.

- [ ] **Paso 5: commit**

```bash
git add app/modules/telework-photo-notice/telework_photo_notice.service.ts \
        app/modules/telework-photo-notice/telework_photo_notice.error.ts \
        tests/unit/modules/telework-photo-notice/telework_photo_notice.service.spec.ts
git commit -m "feat(teletrabajo): publica el aviso de fotos con sus marcadores resueltos

Lista cerrada de marcadores con sustitucion escapada, segundo saneado,
huella del texto publicado y publicacion en transaccion que deja una
sola version vigente.

Refs: VLRH-H1791306079310"
```

---

### Tarea 4 (gsti-rh-api): HTTP — catálogo de códigos, i18n, validador, controller y rutas

La superficie del Backoffice bajo `/api/nom037/telework-photo-notice` con el permiso de `telework-policy`, con su sobre de éxito, sus siete códigos de error y sus textos en los dos idiomas.

**Files:**
- Create: `app/constants/telework_photo_notice_error_codes.ts`
- Create: `app/modules/telework-photo-notice/telework_photo_notice.controller.ts`
- Modify: `start/routes/nom037_routes.ts` (grupo nuevo al final, fuera de todo grupo ajeno)
- Modify: `resources/langs/es.json` y `resources/langs/en.json`
- Test: Modify `tests/functional/telework_photo_notice.spec.ts` (grupos CA-01 a CA-14)

**Interfaces:**
- Consumes: el servicio completo (Tareas 2-3), `assertComplianceRepsePermission` de `#helpers/compliance_repse_rbac`, el molde de controller `app/modules/telework-checklist/telework_checklist.controller.ts` (403 sin `detail`, `validationError` con `code` y `data.errors`).
- Produces (contrato de §11 y §9 para `VLRH-H1791311160233`, `VLRH-H1791311160825` y `VLRH-H1791311161420`):
  - `TELEWORK_PHOTO_NOTICE_ERROR_CODES` con exactamente: `INVALID_INPUT: 'TWN.VAL.001'`, `UNKNOWN_PLACEHOLDER: 'TWN.VAL.002'`, `EMPTY_CONTENT: 'TWN.VAL.003'`, `DRAFT_ALREADY_EXISTS: 'TWN.CONF.001'`, `NOTICE_NOT_PUBLISHED: 'TWN.NF.001'`, `DRAFT_NOT_FOUND: 'TWN.NF.002'`, `TEMPLATE_NOT_FOUND: 'TWN.NF.004'`, `FORBIDDEN: 'TWN.AUTH.001'`, `UNEXPECTED: 'TWN.SYS.001'` (+ tipo del valor). **No** se declaran `TWN.NF.003`, `TWN.VAL.004` ni `TWN.VAL.GATING.001` (reservados).
  - Rutas: `GET /api/nom037/telework-photo-notice` (read), `GET …/template` (read), `POST …/draft` (create), `PUT …/draft` (update), `DELETE …/draft` (delete), `POST …/publish` (update), `GET …/versions` (read) — handlers `#modules/telework-photo-notice/telework_photo_notice.controller.<método>`.
  - El controller importa `teleworkPhotoNoticeUpdateValidator` de la Tarea 2 (no se vuelve a declarar aquí).

- [ ] **Paso 1: escribir los grupos HTTP del spec funcional (rojo)**

En `tests/functional/telework_photo_notice.spec.ts`, colgando de las fixtures de la Tarea 1, con envoltorios por endpoint (`getState`, `getTemplate`, `createDraft`, `updateDraft`, `discardDraft`, `publish`, `listVersions`) que hacen `.loginAs(actor.user).header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)`:

```ts
test.group('avisos de fotos — 401 sin sesión y header de empresa ausente', …)  // los 7 endpoints sin sesión + uno con sesión y sin X-Business-Unit-Id (400 BU.VAL.000, middleware existente)
test.group('avisos de fotos — CA-01 estado sin aviso', …)          // 200 { current: null, draft: null } + plantilla con placeholders; cero filas creadas
test.group('avisos de fotos — CA-02 primer borrador', …)           // 201, version 1, copia de la plantilla, templateId, createdByUserId
test.group('avisos de fotos — CA-03 editar y publicar v1', …)      // 200 NoticeVersionDto, isCurrent, publishedAt, publishedByName, marcador escapado, hash recalculado
test.group('avisos de fotos — CA-04 segunda versión', …)           // borrador v2 desde v1; v1 inmutable; v2 vigente
test.group('avisos de fotos — CA-05 versiones con conteo', …)      // [v2, v1] descendente, acknowledgementsCount 0 y 1, sin borrador
test.group('avisos de fotos — CA-06 marcador fuera de la lista', …)
test.group('avisos de fotos — CA-07 contenido vacío tras sanear', …)
test.group('avisos de fotos — CA-08 saneado al guardar y al servir', …)
test.group('avisos de fotos — Review Focus 2 saneado de la versión servida', …)
test.group('avisos de fotos — CA-09 un solo borrador', …)
test.group('avisos de fotos — CA-10 descartar', …)
test.group('avisos de fotos — Review Focus 5 el borrador descartado no reaparece', …)
test.group('avisos de fotos — CA-11 sin plantilla', …)
test.group('avisos de fotos — CA-12 aislamiento entre empresas', …)
test.group('avisos de fotos — CA-13 permisos', …)
test.group('avisos de fotos — CA-14 validación de entrada', …)
```

Detalles que el ejecutor no puede adivinar, y que las pruebas afirman tal cual:

- **CA-03:** el `content` publicado de la empresa A (`Acme <b>& Hijos</b>`) es `La empresa Acme &lt;b&gt;&amp; Hijos&lt;/b&gt; informa.` y `contentHash` se recalcula con `createHash('sha256').update(\`${body.data.title}\n${body.data.content}\`, 'utf8').digest('hex')`. En BD se comprueba con `db.from('telework_photo_notices')`: `telework_photo_notice_rendered_content` lleva el texto resuelto y `telework_photo_notice_content` **conserva** `{{razon_social}}`.
- **CA-05:** el acuse lo inserta la fixture (`insertAcknowledgement`) para la fila de v1; el conteo que devuelve `/versions` es 0 para v2 y 1 para v1.
- **CA-06:** el cuerpo exacto es `{ key: 'marcador-no-reconocido', code: 'TWN.VAL.002', title: 'Marcador no reconocido', detail: 'El texto usa marcadores que no existen: {{domicilio}}, {{correo}}. Permitidos: {{razon_social}}.', data: { placeholders: ['domicilio', 'correo'] } }`; después, `is_current` no cambió.
- **CA-08:** `PUT /draft` con `<p onclick="x()">Hola</p><iframe src="//e"></iframe>` deja en BD y en `GET /` `<p>Hola</p>`; y una fila alterada por SQL (`db.table('telework_photo_notices').where(…).update({ telework_photo_notice_content: '<p>Hola</p><script>alert(1)</script>' })`) se sirve sin el `<script>`.
- **Review Focus 2:** la misma alteración sobre `telework_photo_notice_rendered_content` de una fila publicada: se sirve saneada en `GET /` (campo `current.content`) y en `GET /versions`.
- **CA-09:** el caso de dos peticiones simultáneas usa `Promise.all([createDraft(), createDraft()])` y afirma que una responde 201 y la otra 409 con `key: 'borrador-ya-existe'` / `code: 'TWN.CONF.001'`, y que `countNotices` deja un solo borrador (el `UNIQUE` traducido, nunca 500). Se limpian los borradores antes del caso para que el 409 sea por la carrera y no por un borrador previo.
- **CA-10:** tras `DELETE /draft`, la fila queda con `telework_photo_notice_deleted_at` no nulo y v1 sigue vigente; `PUT`, `DELETE` y `POST /publish` sin borrador responden 404 `key: 'borrador-no-encontrado'` / `code: 'TWN.NF.002'`; el siguiente `POST /draft` crea `version: 3`.
- **CA-11:** sin plantilla vigente (`db.table('telework_photo_notice_templates').update({ telework_photo_notice_template_is_current: false })` **dentro** del caso y restaurado en su `finally`, para no romper los demás grupos) → `GET /template` y `POST /draft` responden 404 `key: 'plantilla-no-encontrada'` / `code: 'TWN.NF.004'`.
- **CA-12:** con `scenario.b`, concesiones completas y **su** header: `GET /` → `{ current: null, draft: null }`, `GET /versions` → `[]` (200), y `PUT`/`DELETE`/`POST /publish` → 404 idéntico al de «inexistente» (mismo `key` y `code`); después, las filas de A siguen igual.
- **CA-13:** `lector-a` con `grantModulePermissions(scenario.a, 'telework-policy', ['read'])` → los tres GET en 200 y las cuatro escrituras en 403 con `{ key: 'sin-permiso', errorCode: 'TWN.AUTH.001' }` y **sin** `detail` (lo escribe el helper); el mismo actor con `['read','create','update','delete']` pasa las cuatro; y un actor con `['gestion']` en `telework-policy` pasa todas.
- **CA-14:** `PUT /draft` con `title: 'ab'` y con `content` de 100 001 caracteres (`'x'.repeat(100_001)`) responden 422 `key: 'entrada-invalida'` / `code: 'TWN.VAL.001'` con `data.errors` no vacío.
- Cualquier caso que siembre concesiones usa `grantModulePermissions` al principio (el rol del actor nace vacío) y deja la limpieza en el `teardown` del grupo con el orden de la Tarea 1.

- [ ] **Paso 2: correr y verificar el rojo**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="telework_photo_notice.spec.ts"`
Expected: FAIL (404 de ruta: el grupo de rutas y el controller no existen).

- [ ] **Paso 3: implementar el catálogo, el i18n, el controller y las rutas**

- `telework_photo_notice_error_codes.ts`: los nueve códigos de Interfaces, con JSDoc por código y la nota de que `UNEXPECTED` y `NOTICE_NOT_PUBLISHED` quedan declarados aquí aunque los ejercite otra HU (el 404 de `aviso-no-publicado` lo responde `VLRH-H1791311160825`).
- i18n (`es.json` y `en.json`, nunca al final del archivo):
  ```json
  "telework_photo_notice": {
    "title": "Aviso de privacidad de las fotos del puesto",
    "get_success": "Estado del aviso de privacidad obtenido correctamente.",
    "template_success": "Plantilla base del aviso de privacidad obtenida correctamente.",
    "create_draft_success": "Borrador del aviso de privacidad creado correctamente.",
    "update_draft_success": "Borrador del aviso de privacidad actualizado correctamente.",
    "discard_draft_success": "Borrador del aviso de privacidad descartado correctamente.",
    "publish_success": "Aviso de privacidad publicado correctamente.",
    "versions_success": "Versiones del aviso de privacidad obtenidas correctamente.",
    "errors": {
      "entrada-invalida": { "title": "Entrada inválida", "detail": "Revisa los campos de la petición." },
      "marcador-no-reconocido": { "title": "Marcador no reconocido", "detail": "El texto usa marcadores que no existen: {markers}. Permitidos: {allowed}." },
      "contenido-vacio": { "title": "Contenido vacío", "detail": "El aviso quedó sin texto después de limpiarlo; escríbelo antes de publicar." },
      "borrador-ya-existe": { "title": "Borrador ya existe", "detail": "Ya existe un borrador del aviso; edítalo en vez de crear otro." },
      "aviso-no-publicado": { "title": "Aviso no publicado", "detail": "La empresa aún no tiene una versión publicada del aviso de privacidad." },
      "borrador-no-encontrado": { "title": "Borrador no encontrado", "detail": "La empresa no tiene un borrador del aviso de privacidad." },
      "plantilla-no-encontrada": { "title": "Plantilla no encontrada", "detail": "Todavía no hay una plantilla base vigente del aviso de privacidad." },
      "error-inesperado": { "title": "Error inesperado", "detail": "Ocurrió un error inesperado al procesar el aviso de privacidad." }
    }
  }
  ```
  Insertado tras la última clave `telework_location_*` (`es.json:3166` / `en.json:3163`), y las cuatro claves planas junto a las de `telework_policy` (`es.json:3084` / `en.json:3081`):
  ```json
  "telework_photo_notice_forbidden_read_title": "Sin permiso de consulta",
  "telework_photo_notice_forbidden_read_message": "No tienes permiso para consultar el aviso de privacidad de las fotos del puesto.",
  "telework_photo_notice_forbidden_write_title": "Sin permiso",
  "telework_photo_notice_forbidden_write_message": "No tienes permiso para gestionar el aviso de privacidad de las fotos del puesto.",
  ```
  (en `en.json`, sus equivalentes en inglés.)
- Validador: ya existe (Tarea 2); el controller solo lo importa y llama `teleworkPhotoNoticeUpdateValidator.validate(ctx.request.all())` dentro del `try` de `updateDraft`, cayendo en `this.validationError(ctx, error)` cuando Vine lanza (`E_VALIDATION_ERROR`), que responde 422 `entrada-invalida` + `code: TWN.VAL.001` + `data: { errors }`.
- Controller: `MODULE_SLUG = 'telework-policy'`, `RBAC_FORBIDDEN = { errorCode: TELEWORK_PHOTO_NOTICE_ERROR_CODES.FORBIDDEN, i18nPrefix: 'telework_photo_notice' }`, `ERROR_STATUS_BY_KEY: Record<TeleworkPhotoNoticeErrorKey, { status: number; code: string }>` con `marcador-no-reconocido` 422/`TWN.VAL.002`, `contenido-vacio` 422/`TWN.VAL.003`, `borrador-ya-existe` 409/`TWN.CONF.001`, `aviso-no-publicado` 404/`TWN.NF.001`, `borrador-no-encontrado` 404/`TWN.NF.002`, `plantilla-no-encontrada` 404/`TWN.NF.004`. Cada handler: `if (!(await this.assertHasPermission(ctx, '<acción>')) return`, `const businessUnitId = ctx.businessUnitScope[0]`, `try` con el sobre `{ type: 'success', title: ctx.i18n.formatMessage('telework_photo_notice.title'), message: ctx.i18n.formatMessage('telework_photo_notice.<success>'), data }` (201 en `createDraft`, `data: null` en `discardDraft`) y `catch` con `this.domainError(ctx, error)`. `validationError` (422 `entrada-invalida` + `code: TWN.VAL.001` + `data: { errors }`) y `domainError` (título y detalle por clave, `code` del mapa, `data` solo si hay `details`) como en el molde; el `domainError` interpola `{markers}` y `{allowed}` **solo** para `marcador-no-reconocido`, con los `details.placeholders` y con `TELEWORK_PHOTO_NOTICE_PLACEHOLDERS` formateados como `{{clave}}` y unidos por `', '`. Swagger en cada handler con el ejemplo de éxito y uno de cada error que puede salir por ahí (DoD).
- Rutas: grupo nuevo al final de `start/routes/nom037_routes.ts`, con el comentario de la HU, `.prefix('/api').use(middleware.auth()).use(middleware.businessScope())` y los siete `router.<verbo>` (sin `permissionGate`: el permiso se valida en el controller, §8).

- [ ] **Paso 4: correr y verificar el verde**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="telework_photo_notice.spec.ts"`
Expected: PASSED (grupos de la Tarea 1 y CA-01 a CA-14).

Run: `node ace list:routes | grep -c "telework-photo-notice"` → **7** (antes: 0).
Run: `grep -cE "telework-photo-notice/(current|acknowledgements)" start/routes/nom037_routes.ts` → **0** (esas rutas son de `VLRH-H1791311160825`).
Run: `./node_modules/.bin/tsc --noEmit` → exit 0. `./node_modules/.bin/eslint app/modules/telework-photo-notice app/constants/telework_photo_notice_error_codes.ts start/routes/nom037_routes.ts` → 0 problemas.
Run: `python3 -c "import json;[json.load(open(f, encoding='utf-8')) for f in ['resources/langs/es.json','resources/langs/en.json']]"` → exit 0 (los dos JSON siguen válidos).

- [ ] **Paso 5: commit**

```bash
git add app/constants/telework_photo_notice_error_codes.ts \
        app/modules/telework-photo-notice/telework_photo_notice.controller.ts \
        start/routes/nom037_routes.ts resources/langs/es.json resources/langs/en.json \
        tests/functional/telework_photo_notice.spec.ts
git commit -m "feat(teletrabajo): expone el aviso de fotos del puesto en el API del backoffice

Siete endpoints bajo el permiso de politicas de teletrabajo, catalogo
de codigos TWN, textos en los dos idiomas y el validador del borrador.

Refs: VLRH-H1791306079310"
```

---

### Tarea 5 (gsti-rh-api): Manual de QA (API) — último entregable, solo se entrega

Esta HU no trae pantalla, así que el manual es el de **API** (`~/.agents/rules/manual-qa/manual-qa-api.md`): se escribe y se entrega; el recorrido lo hace el usuario. No se ejecuta ni se automatiza aquí.

**Files:**
- Modify: `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (bloque nuevo de la HU; ese archivo **no** se commitea)
- Create: `docs/superpowers/plans/2026-10-21-publicar-el-aviso-de-privacidad-de-la-evidencia-qa-api.md`

**Interfaces:**
- Consumes: la skill `manual-qa` y la regla de API + la de ejecución (leídas, no citadas de memoria). Los correos exactos y la contraseña literal salen del sembrador de QA (si falta una cuenta, se agrega ahí: es su sitio).
- Produce: el manual para el recorrido, y los hallazgos que el usuario reporte van a `~/Documents/projects/qa-valanserh/hallazgos.md` (cuadro de 14 campos; el código archivo:línea en Comentarios/Historial) y se corrigen en esta misma rama.

- [ ] **Paso 1: completar el sembrador y correrlo**

Lee el archivo y comprueba qué falta para ESTE manual; agrega un bloque nuevo `VLRH-H1791306079310` con el molde de los bloques hermanos: una cuenta con `telework-policy` `read`/`create`/`update`/`delete` (la que crea, edita y publica) y otra solo con `read` (la que comprueba el 403 de la escritura), sobre una empresa con nombre legal reconocible y con los ajustes de teletrabajo que la lista necesite. Corre el único comando del playbook (imprime `[qa-seeder] listo`) **sin commitear el archivo**.

- [ ] **Paso 2: escribir el manual**

Con la skill cargada y los correos/contraseña leídos del sembrador. Escenarios recorribles a mano: consultar el estado de una empresa sin aviso (no hay borrador ni versión y llega la plantilla con su marcador); crear el borrador desde la plantilla, cambiar un párrafo y publicar (queda la versión 1 con fecha, autor y la razón social ya sustituida, sin marcadores); editar de nuevo y publicar (versión 2 vigente, versión 1 consultable); listar versiones (de la más reciente a la más antigua, cada una con su conteo de acuses); descartar un borrador y volver a crearlo (la versión no se reutiliza); la cuenta solo lectura (ve todo y no puede escribir). Cada escenario con su `Objetivo:` antes de los pasos, el endpoint y su response exacto, y «Qué significa cada dato». Los que el ambiente no puede provocar (aislamiento de otra empresa, marcador fuera de la lista, contenido vacío tras sanear, saneado de HTML peligroso, dos borradores a la vez, el 403 de la cuenta sin permiso) van con la misma forma en la sección de escenarios que resuelven las pruebas automatizadas, nombrando el caso real de `tests/functional/telework_photo_notice.spec.ts` o del spec unitario, y su `Qué pasó:`. Casillas **vacías**.

- [ ] **Paso 3: verificación de formato y commit**

Recorre el manual sección por sección contra la regla (no contra este plan): cada escenario con su `Objetivo:`; sin líneas de evidencia ni capturas; sin comandos que no sean el del sembrador; correos exactos y la contraseña literal.

```bash
git add docs/superpowers/plans/2026-10-21-publicar-el-aviso-de-privacidad-de-la-evidencia-qa-api.md
git commit -m "docs(qa): agrega el manual de API del aviso de fotos del puesto

Refs: VLRH-H1791306079310"
```

---

## Definition of Done — líneas base medidas (2026-10-21, rama de la HU sin commits propios)

- [ ] **CA-01 a CA-17 en verde:** los CA-01 a CA-14 en `tests/functional/telework_photo_notice.spec.ts`; CA-15 en el unitario del servicio; CA-16 y CA-17 por los comandos de abajo.
- [ ] `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed` limpio, `migration:rollback` + `migration:run` limpios y `node ace db:seed --files=database/seeders/0067_telework_photo_notice_templates_seeder.ts` idempotente (conteo = 1 en dos corridas).
- [ ] `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test unit --files="telework-photo-notice/telework_photo_notice.service.spec.ts"` → PASSED; y `--files="constants/"` sigue en **156 passed (156), 0 failed** (línea base).
- [ ] `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="telework_photo_notice.spec.ts"` → PASSED.
- [ ] Sin regresiones en los vecinos: `--files="telework_policy.spec.ts"` → **29 passed (29)** y `--files="telework_checklist.spec.ts"` → **19 passed (19)** (ambos sin editarse); `--files="telework_policy_publish.spec.ts"` → **ningún fallo nuevo**: su línea base es 24 passed / 7 failed (fragilidad de fixture del difusor y el recordatorio, ajena a esta HU).
- [ ] `./node_modules/.bin/tsc --noEmit` → exit 0 (línea base) y `./node_modules/.bin/eslint` sobre lo tocado → 0 problemas; **cero `any`**.
- [ ] **CA-16 (frontera):** `git diff --name-only --diff-filter=AM multitenant...HEAD` **excluyendo `docs/superpowers/` y `.superpowers/`** (el plan y el manual se versionan y no son filas del censo) lista solo filas `nuevo`/`editado` del censo; `git diff --name-only multitenant...HEAD -- app/modules/consent app/modules/legal-documents app/constants/system_modules_menu app/modules/telework-policy app/helpers app/modules/telework-checklists` sale **vacío**; `grep -cE "telework-photo-notice/(current|acknowledgements)" start/routes/nom037_routes.ts` = **0**; `git -C ../gsti-rh-bo log --oneline multitenant..HEAD` y el de la app salen vacíos.
- [ ] **CA-17 (inmutabilidad):** `grep -nE "\.delete\(\)|forceDelete|DELETE FROM" app/modules/telework-photo-notice` = **0**; ninguna ruta ni método borra o edita una fila publicada salvo `is_current` dentro de `publish`.
- [ ] **`no-tocado` del censo intacto:** `git diff --name-only multitenant...HEAD -- app/helpers/sanitize_telework_policy_content.ts app/constants/system_modules_menu/system_modules.constant.ts app/modules/consent/consent.constants.ts` sale vacío.
- [ ] Swagger en cada handler con el ejemplo de éxito y uno de cada error.
- [ ] El manual de QA entregado (Tarea 5), con sus casillas vacías. El machote definitivo de asesoría **no** es requisito (C0129 R11).
- [ ] Sin PR y sin despliegue: eso es proceso aparte.
