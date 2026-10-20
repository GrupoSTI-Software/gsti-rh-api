# Adjuntar la evidencia de la declaración de equipo propio — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que RH pueda adjuntar un archivo opcional de evidencia (PDF o foto del equipo) al declarar el equipo propio de un teletrabajador, que toda declaración (vigente o cerrada) exponga `hasEvidence`, y que quien puede ver Activos e insumos descargue ese archivo desde la ficha por stream privado, sin datos del colaborador en la key ni en el nombre de descarga.

**Architecture:** Sin migración: la columna `employee_own_equipment_declaration_file` (VARCHAR(500) NULL) ya existe desde `VLRH-H1791306075599` y nadie la escribe. En el API la subida va dentro del `create` existente: el controller lee `request.file('file')`, el servicio lo sube con `UploadService.fileUpload(file, 'evidence-document', '', { fileName })` DESPUÉS de las validaciones baratas (pertenencia, teletrabajo, cuota, cobertura, vigente) y ANTES de la transacción, y el `insert` persiste la key; el rechazo del intake sale por una rama nueva en `respondAssetsModuleError` con su propio sobre (`{ type, title, detail, key, code }`). La descarga reutiliza el slice de descargas: el `streamFile` privado de `AssetsService` se extrae a la función exportada `streamAssetFile` (mismo archivo), el handler `ownEquipmentEvidence` vive en `AssetFilesController` (que parametriza su `send` en `inline`/`attachment` y agrega `nosniff` siempre), con ruta nueva gateada a `supplies:read` y 404 único para inexistente/ajena/sin archivo. En el BO el mismo panel `ownEquipmentDeclarationPanel` gana el campo de archivo solo en el modo `create` (con prevalidación de tipo y tamaño), los chips "Con evidencia adjunta"/"Sin evidencia" en la vigente y en cada renglón del histórico, y el botón de descarga con `assetDownload` + `triggerBlobDownload` (nunca `openBlob`).

**Tech Stack:** AdonisJS 6 (vine, Japa, Lucid `db.from`/`db.transaction`, `@adonisjs/core/helpers` cuid), perfil de intake `evidence-document` (magic bytes, 10 MB, re-encode a JPEG sin EXIF/GPS), Nuxt/Vue 3 `setup` + PrimeVue (`Drawer`, `Message`, `Tag`, `Toast`), vitest, `assetFetch`/`assetDownload` del slice de activos.

**Spec:** `/Users/noeabelvargaslopez/Downloads/spec-VLRH-H1791493046616.md` (HU `VLRH-H1791493046616`; versión viva en `04-gsti/03-valanserh/02-plannings/00-docs-hu/VLRH-H1791493046616/`). El plan argumenta desde el spec: léelo completo antes de cada tarea; sus §10-§13 y el censo de archivos son el contrato. Anclas revalidadas contra el código el 2026-10-19 en ambos repos, ya en su rama, a la par de la base B `feature/VLRH-H1791493045968-precargar-ajustar-y-terminar-la-declaracion-de` (con `multitenant` ya mezclada): **la rama existe pero no tiene ningún commit propio — esta HU no ha arrancado y el plan parte de cero**. El drift trivial (un nombre, una línea) se corrige al momento; el de alcance, contrato o regla de negocio **se escala a Wilvardo**, no se cambia en silencio.

## Restricciones globales

- **Ramas:** `feature/VLRH-H1791493046616-adjuntar-la-evidencia-de-la-declaracion-de-equipo` en ambos repos, ya creadas y limpias a la par de la base. La base de TODOS los `git diff` de verificación es `feature/VLRH-H1791493045968-precargar-ajustar-y-terminar-la-declaracion-de`. No se crea PR ni se despliega: el plan termina en la verificación automatizada y la entrega del manual de QA.
- **Sin migración (§2):** `git diff --name-only <base>...HEAD -- database/migrations` sale vacío; ningún `node ace make:migration`. Tampoco se toca `resources/langs/*.json` del API (ninguna llave nueva del API: los errores del intake traen su detail fijo y `AssetError.fileNotFound()` ya existe).
- **Un solo archivo nuevo en toda la rama (censo):** `tests/functional/assets_own_equipment_evidence.spec.ts` (api). En el BO no se crea archivo alguno: todo es edición. El API no crea nada más.
- **No tocar (censo `no-tocado` + no-objetivos):** api: `app/modules/assets/validators/own_equipment_declarations.validator.ts` (el archivo no pasa por vine; solo se REUTILIZA `declarationIdParamsValidator`), `app/modules/assets/dto/telework_supplies.dto.ts` (hereda `hasEvidence` por el tipo), `tests/functional/assets_own_equipment_declarations.spec.ts` (**corre y se queda en 25/25 sin editarlo**), `app/constants/system_modules_menu/system_modules.constant.ts`, `app/services/employee_supplie_service.ts`, `app/services/telework_compliance_setting_service.ts`, `app/services/file_intake_service.ts` y `app/constants/file_intake.ts` (el perfil `evidence-document` ya existe y hace todo), el `PUT` de ajuste (ni validador ni servicio aceptan archivo; CA-10 lo prueba). BO: `pages/employees/[employeeSlug]/**` (el gate `canReadAssets` ya existe y no cambia), `components/employeeTeleworkSuppliesPanel/**`.
- **La key del archivo (§14):** `own-equipment-declarations/${businessUnitId}/${cuid()}` pasada como `options.fileName` (sin `clientName`, sin sufijo saneado — a diferencia del molde de offboarding); `replaceExtension` agrega la extensión real. `businessUnitId` sale de la fila del colaborador leída en alcance, nunca del body. **Nunca** llamar `fileUpload` con archivo nulo (devuelve el centinela `'file_not_found'`) ni concatenar `file.clientName`.
- **Orden del alta (§7):** validar vine → colaborador en alcance y vivo → teletrabajo > 0 → cuota (`parseMonthlyFee` o precarga) → `hasOpenCoverage` → `hasOpenDeclaration` → **subir el archivo si viene** → transacción (candado, re-chequeo, `insert` con la key) → 201. Si la transacción truena después de subir: `logger.warn({ storedKey }, 'Equipo propio: evidencia sin declaración')` (la key no lleva PII) y se relanza el error original; el objeto queda huérfano (residual aceptado, regla 8: nada se borra).
- **Multi-tenant fail-closed (R3):** el alcance viaja `whereIn('business_unit_id', ...)` DENTRO de la consulta de `findEvidencePath` y con `deleted_at IS NULL`; ajena, inexistente y sin archivo dan el MISMO 404 con el MISMO cuerpo (CA-8). La subida va después de la pertenencia: un id ajeno nunca sube nada (CA-6).
- **Descarga (CA-7):** `Content-Disposition: attachment` con `filename="equipo-propio-<declarationId>.<ext>"` (armado por `buildDownloadFileName` con `ASSET_FILE_NAME_PREFIX.ownEquipmentEvidence`), `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` y el `Content-Type` del objeto. `send` conserva `inline` por defecto: la responsiva y las fotos NO cambian (CA-12), solo ganan `nosniff`.
- **En el BO no se abre la evidencia en pestaña:** `triggerBlobDownload` (`resources/scripts/utils/blob-download.ts`), NUNCA `openBlob` del mismo archivo (abre `_blank` y vale para PDF/imagen). El botón solo existe con `hasEvidence: true`.
- **Cero `any`** en ambos repos. Errores del API del módulo: `{ type, title, message, detail, key, data }` sin `code`; el sobre del intake: `{ type, title, detail, key, code }`. i18n del BO es + en, sin emojis; llaves nuevas bajo `own_equipment_declaration_panel.` de los JSON del panel.
- **Commits:** Conventional Commits en español (tipo en inglés, descripción imperativa), cuerpo con el porqué y `Refs: VLRH-H1791493046616`. El hook del api solo corre eslint (no correr `prettier --write` sobre archivos ajenos). En el BO, la auditoría de `.claude/rules/compliance-check.md` archivo-por-archivo sobre los tocados cierra cada tarea (línea **Compliance**).
- **BD de pruebas:** `sae_pruebas` (`NODE_ENV=test`), ya puesta al día en esta rama con `migration:fresh --seed`. Un esquema atrasado produce fallos falsos.
- **Manual de QA:** único, de frontend, **último entregable y solo se ENTREGA** (el recorrido lo hace el usuario). Los hallazgos se registran en `qa-valanserh/hallizgos.md` (cuadro de 14 campos) y se corrigen en esta misma rama.

## Review Focus

Entradas o condiciones que el spec implica pero ningún CA ejercita por sí solo, y que por eso son las más propensas a morder. Cada línea lleva su prueba en la tarea dueña del código.

1. **El POST existe en JSON y pasa a multipart (§11):** el alta ya vivía como JSON y los demás campos no cambian. La prueba de regresión es dura: `tests/functional/assets_own_equipment_declarations.spec.ts` (que poste-a `.json()`) debe seguir en 25/25 **sin editarse** — ese spec es el test del contrato JSON intacto. Prueba en Tarea 3 (verificación) y en la tabla de líneas base.
2. **El objeto huérfano (regla 8, §7):** transacción que truena DESPUÉS de subir deja el archivo guardado sin declaración. No se borra (nada se borra): se registra en log con la key y se relanza el original. Prueba en Tarea 3 (caso del huérfano: `fileUpload` llamado 1 vez, log WARN, cero filas).
3. **Declaración cerrada de OTRA empresa CON archivo (CA-8b):** el 404 de la ajena tiene que ser exactamente igual al de la inexistente y al de la propia sin archivo, porque el alcance viaja dentro de la consulta y `deleted_at IS NULL`. Una consulta que filtre después de leer rompería la igualdad. Prueba en Tarea 3 (los tres cuerpos comparados con `deepEqual`).
4. **`send` conserva `inline` (CA-12):** la responsiva y las fotos de resguardo ya se descargan por el mismo controller; parametrizarlo no puede cambiarles la disposición. Prueba en Tarea 3 (caso inline: foto de resguardo 200 con `Content-Disposition: inline` y `nosniff`).
5. **Prevalidación BO con MIME mentiroso (CA-13):** un `.pdf` cuyo MIME real sea `text/plain` debe rebotar en el BO por MIME, no solo por extensión — y el botón Guardar no dispara petición. Prueba en Tarea 4 (`validateEvidenceFile` con MIME fuera de la lista aunque la extensión sea `pdf`).

---

### Tarea 1 (gsti-rh-api): el contrato de la evidencia — constantes, DTO, puerto e insert

Lo que las tareas 2-3 consumen, sin HTTP: la carpeta y el prefijo de descarga, el `hasEvidence` del DTO, el método de lectura del puerto y la escritura de la columna en el `insert`.

**Files:**
- Modify: `app/modules/assets/assets.constants.ts` (carpeta junto a `ASSET_FILE_NAME_PREFIX`; prefijo nuevo dentro de `ASSET_FILE_NAME_PREFIX`)
- Modify: `app/modules/assets/dto/own_equipment_declarations.dto.ts` (`hasEvidence` en el DTO; `file` opcional en el `Insert`)
- Modify: `app/modules/assets/own_equipment_declarations.repository.ts` (firma nueva del puerto)
- Modify: `app/modules/assets/own_equipment_declarations.repository.mysql.ts` (columna en `DECLARATION_DTO_COLUMNS`, mapper, `insert` y `findEvidencePath`)
- Test: Create `tests/functional/assets_own_equipment_evidence.spec.ts` (nace con la parte de puerto; las partes HTTP las agregan las Tareas 2-3)

**Interfaces:**
- Consumes: patrón `DECLARATION_DTO_COLUMNS`/`toDto`/`calendarDate` del mismo adaptador; `OwnEquipmentDbExecutor`.
- Produces (firmas exactas que las Tareas 2-3 consumen):
  - `export const OWN_EQUIPMENT_EVIDENCE_S3_FOLDER = 'own-equipment-declarations'` y `ASSET_FILE_NAME_PREFIX` gana `ownEquipmentEvidence: 'equipo-propio'` (`assets.constants.ts`).
  - `OwnEquipmentDeclarationDto` gana `hasEvidence: boolean` — sigue sin `businessUnitId` y **nunca** expone la key. `OwnEquipmentDeclarationInsert` gana `file?: string | null` (OPCIONAL: el alta de la Tarea 3 lo trae; el ajuste y el término no lo tocan y el adaptador escribe `row.file ?? null`, con lo que la versión nueva del ajuste nace sin evidencia de facto, regla 5).
  - Puerto: `findEvidencePath(businessUnitIds: readonly number[], declarationId: number): Promise<{ declarationId: number; storedPath: string | null } | null>` — la declaración (vigente **o cerrada**) con `deleted_at IS NULL` dentro del alcance; ajena, inexistente o borrada lógicamente → `null` indistinguible; sin archivo → `storedPath: null`.
  - Adaptador: `DECLARATION_DTO_COLUMNS` gana `'employee_own_equipment_declaration_file as evidence_file'`; `DeclarationRow` gana `evidence_file: string | null`; `toDto` mapea `hasEvidence: row.evidence_file !== null && row.evidence_file.trim() !== ''`; el `insert` escribe `employee_own_equipment_declaration_file: row.file ?? null`.

- [ ] **Paso 1: escribir en rojo la parte 1 del spec funcional (puerto, sin HTTP)**

`tests/functional/assets_own_equipment_evidence.spec.ts` — mismo molde de fixtures que `tests/functional/assets_own_equipment_declarations.spec.ts`: `RUN` único, `createTenantActor` para el actor A y el actor B, `createEmployeeFixture` por empresa, `insertDeclaration(overrides)` por `db.table` (gana `file?: string | null` para el caso de la evidencia), `dbErrorCode(fn)` y limpieza en `group.each.teardown`/`group.teardown` (borra declaraciones, insumos y colaboradores creados). Casos:

```ts
test('RF: insert escribe la columna de evidencia y findById expone hasEvidence')
// insertDeclaration({ file: 'valanserhfiles/own-equipment-declarations/1/c1.pdf' }) → findById →
//   dto.hasEvidence === true; la key NO viaja en el DTO (assert.notProperty(dto, 'employee_own_equipment_declaration_file'))
// insertDeclaration({}) → hasEvidence === false y la columna en BD es NULL (row.file ?? null)
// insertDeclaration({ file: '' }) → hasEvidence === false (cadena vacía no es evidencia)

test('RF: findEvidencePath devuelve la ruta viva dentro del alcance, vigente o cerrada')
// con file → { declarationId, storedPath: '<key>' } · sin file → storedPath: null
// cerrada (status 'closed' por update directo) con file → storedPath (regla 8: se conserva)
// id de B con alcance de A → null · id inexistente → null · fila con deleted_at → null
```

- [ ] **Paso 2: correr y verificar el rojo**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="assets_own_equipment_evidence.spec.ts"`
Expected: FAIL (`findEvidencePath` no existe; `hasEvidence` no está en el DTO).

- [ ] **Paso 3: implementar el contrato**

Constantes, DTO, firma del puerto y adaptador con las firmas exactas de Interfaces (los JSDoc citan su regla y la HU). La consulta de `findEvidencePath` espeja `findById`: `whereIn('business_unit_id', [...businessUnitIds])` dentro de la consulta + `whereNull('employee_own_equipment_declaration_deleted_at')`, select de `employee_own_equipment_declaration_id` y `employee_own_equipment_declaration_file`.

- [ ] **Paso 4: correr y verificar el verde**

```
node ace test functional --files="assets_own_equipment_evidence.spec.ts"     → PASSED (parte 1)
node ace test functional --files="assets_own_equipment_declarations.spec.ts" → PASSED 25/25 (sin editar el archivo)
node ace test unit --files="constants/"                                        → PASSED 156/156 (sin cambios de catálogo)
npm run typecheck                                                              → exit 0
npx eslint app/modules/assets                                                  → 0 problemas
```

- [ ] **Paso 5: commit**

```bash
git add app/modules/assets/assets.constants.ts app/modules/assets/dto/own_equipment_declarations.dto.ts \
        app/modules/assets/own_equipment_declarations.repository.ts \
        app/modules/assets/own_equipment_declarations.repository.mysql.ts \
        tests/functional/assets_own_equipment_evidence.spec.ts
git commit -m "feat(activos): agrega el contrato de la evidencia de la declaracion de equipo propio

Carpeta y prefijo de descarga de la evidencia, hasEvidence en el DTO
que nunca expone la key, y findEvidencePath en el puerto con el
alcance de empresas dentro de la consulta.

Refs: VLRH-H1791493046616"
```

---

### Tarea 2 (gsti-rh-api): la descarga — streamAssetFile, send con disposición, handler, ruta y rama del intake

La descarga por stream privado con 404 único y el rechazo del archivo con su propio sobre. El handler y la ruta nacen JUNTOS (la ruta apunta al handler por cadena).

**Files:**
- Modify: `app/modules/assets/assets.service.ts` (extrae `streamFile` a la función exportada `streamAssetFile`)
- Modify: `app/modules/assets/asset_files.controller.ts` (handler `ownEquipmentEvidence`; `send` con `disposition` y `nosniff`)
- Modify: `app/modules/assets/own_equipment_declarations.service.ts` (`evidenceFile` + almacenamiento inyectable)
- Modify: `app/modules/assets/assets.error.ts` (rama `isFileIntakeError` en `respondAssetsModuleError`)
- Modify: `app/modules/assets/assets.routes.ts` (ruta de descarga con su gate)
- Modify: `app/constants/supplies_permission_declarations.ts` (`downloadOwnEquipmentDeclarationFile`)
- Test: Modify `tests/unit/routes/supplies_organization_chart_permission_gate_routes.spec.ts` (fila de la ruta en el contrato de `assets.routes.ts`)
- Test: Modify `tests/unit/helpers/file_intake_module_resolvers.spec.ts` (`app/modules/assets/assets.error.ts` en la lista de resolvers)

**Interfaces:**
- Consumes: de la Tarea 1, `findEvidencePath` y `ASSET_FILE_NAME_PREFIX.ownEquipmentEvidence`. De la casa: `AssetFile`/`AssetFileStorage` y el `streamFile` privado de `AssetsService` (`assets.service.ts:252-264`), `hasStoredFile` (`:94-96`, se queda privado igual), `buildDownloadFileName` + `resolveStoredFileExtension`, `declarationIdParamsValidator` (`validators/own_equipment_declarations.validator.ts:43-45`), `respondFileIntakeError`/`isFileIntakeError` (`app/helpers/file_intake_api_error.ts:41-59`).
- Produces (firmas exactas):
  - `export function streamAssetFile(storage: Pick<UploadService, 'streamStoredFile'>, storedPath: string | null, nameParts: Array<string | number>): Promise<AssetFile>` en `assets.service.ts` — el cuerpo actual de `streamFile` (404 si `!hasStoredFile` o si el storage devuelve `null`; nombre con `buildDownloadFileName(nameParts, resolveStoredFileExtension({ storedPath, contentType: object.contentType }))`). `AssetsService.streamFile` queda como `private` de una línea que delega en ella (CA-12 sin riesgo).
  - `export type OwnEquipmentEvidenceStorage = Pick<UploadService, 'fileUpload' | 'streamStoredFile'>` en `own_equipment_declarations.service.ts`; el constructor gana el segundo parámetro `private readonly storage: OwnEquipmentEvidenceStorage = new UploadService()`.
  - `async evidenceFile(declarationId: number): Promise<AssetFile>` en `OwnEquipmentDeclarationsService` — scope del `TenantContext`, `findEvidencePath(scope, declarationId)`; `null` → `AssetError.fileNotFound()`; si no, `streamAssetFile(this.storage, record.storedPath, [ASSET_FILE_NAME_PREFIX.ownEquipmentEvidence, declarationId])`. `@throws AssetError 404 archivo-no-encontrado`.
  - `private send(ctx: Pick<HttpContext, 'response'>, { object, fileName }: AssetFile, disposition: 'inline' | 'attachment' = 'inline')` en `AssetFilesController` — agrega SIEMPRE `response.header('X-Content-Type-Options', 'nosniff')`; el resto igual que hoy.
  - `async ownEquipmentEvidence(ctx: HttpContext)` en `AssetFilesController` — `declarationIdParamsValidator.validate(ctx.params)`, `this.ownEquipmentService.evidenceFile(declarationId)` (el controller se construye con los dos servicios), `return this.send(ctx, file, 'attachment')`; errores por `respondAssetsModuleError`. Con su JSDoc `@swagger` de `/api/own-equipment-declarations/{declarationId}/file` (200 stream attachment, 403 gate, 404 `archivo-no-encontrado`).
  - `SUPPLIES_PERMISSION_DECLARATIONS.downloadOwnEquipmentDeclarationFile = suppliesStandard('read')` (al final del objeto).
  - Ruta: `router.get('/own-equipment-declarations/:declarationId/file', '#modules/assets/asset_files.controller.ownEquipmentEvidence')` con `.use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.downloadOwnEquipmentDeclarationFile))`, dentro del grupo existente de `assets.routes.ts` (prefijo `/api`, `auth`, `businessScope`).
  - `respondAssetsModuleError` (`assets.error.ts:270`): entre la rama `E_VALIDATION_ERROR` y el 500, `if (isFileIntakeError(error)) return respondFileIntakeError(ctx.response, error)`.

- [ ] **Paso 1: escribir en rojo las dos filas de los specs unitarios**

1. En `tests/unit/routes/supplies_organization_chart_permission_gate_routes.spec.ts`, al contrato de `app/modules/assets/assets.routes.ts` (entrada `{ file: 'app/modules/assets/assets.routes.ts', ... }`), agrega al final de `gated`: `{ method: 'get', path: '/own-equipment-declarations/:declarationId/file', handler: '#modules/assets/asset_files.controller.ownEquipmentEvidence', declaration: supplies('downloadOwnEquipmentDeclarationFile') }`.
2. En `tests/unit/helpers/file_intake_module_resolvers.spec.ts`, agrega `'app/modules/assets/assets.error.ts'` a la lista `controladores` del test que exige `isFileIntakeError`.

- [ ] **Paso 2: correr y verificar el rojo**

```
node ace test unit --files="supplies_organization_chart_permission_gate_routes.spec.ts"
Expected: FAIL — "GET /own-equipment-declarations/:declarationId/file debe declarar SUPPLIES_PERMISSION_DECLARATIONS.downloadOwnEquipmentDeclarationFile" y la aserción de declaraciones-usadas-una-vez por la clave sin ruta.
node ace test unit --files="file_intake_module_resolvers.spec.ts"
Expected: FAIL — "app/modules/assets/assets.error.ts degradaría el rechazo a 500".
```

- [ ] **Paso 3: implementar**

`streamAssetFile` y la delegación; `send` parametrizado con `nosniff` siempre; handler `ownEquipmentEvidence` con su `@swagger`; `evidenceFile` + `OwnEquipmentEvidenceStorage` en el servicio de declaraciones (la inyección del storage por constructor es la dependencia que la Tarea 3 usa para el doble en tests); la rama del intake en `respondAssetsModuleError`; constante de permiso y ruta. El JSDoc del `store` en `own_equipment_declarations.controller.ts` NO se toca aquí (va en la Tarea 3, junto con `request.file`).

- [ ] **Paso 4: correr y verificar el verde**

```
node ace test unit --files="supplies_organization_chart_permission_gate_routes.spec.ts" → PASSED 22/22 (mismos tests, una fila más)
node ace test unit --files="file_intake_module_resolvers.spec.ts"                        → PASSED 3/3
node ace test functional --files="assets_module.spec.ts"                                 → PASSED 24/24 (regresión: el send de responsiva/fotos conserva inline)
node ace test functional --files="assets_own_equipment_declarations.spec.ts"            → PASSED 25/25
npm run typecheck                                                                        → exit 0
npx eslint app/modules/assets app/constants                                              → 0 problemas
```

- [ ] **Paso 5: commit**

```bash
git add app/modules/assets/assets.service.ts app/modules/assets/asset_files.controller.ts \
        app/modules/assets/own_equipment_declarations.service.ts app/modules/assets/assets.error.ts \
        app/modules/assets/assets.routes.ts app/constants/supplies_permission_declarations.ts \
        tests/unit/routes/supplies_organization_chart_permission_gate_routes.spec.ts \
        tests/unit/helpers/file_intake_module_resolvers.spec.ts
git commit -m "feat(activos): agrega la descarga privada de la evidencia del equipo propio

Extrae el stream del slice a streamAssetFile, parametriza send en
inline/attachment con nosniff siempre, agrega el handler con su ruta
gateada a supplies:read, el 404 unico y la rama del intake en el
resolver del modulo.

Refs: VLRH-H1791493046616"
```

---

### Tarea 3 (gsti-rh-api): la subida en el alta — multipart en el controller, upload en el servicio y el spec CA-1 a CA-12

El `POST` existente pasa de JSON a multipart (gana `file?`), el servicio sube después de las validaciones baratas y antes de la transacción, y el spec funcional nuevo crece con las partes HTTP.

**Files:**
- Modify: `app/modules/assets/own_equipment_declarations.controller.ts` (`store` lee `request.file('file')` y lo pasa al servicio; `@swagger` del POST en multipart)
- Modify: `app/modules/assets/own_equipment_declarations.service.ts` (`create` sube la evidencia; orden §7)
- Test: Modify `tests/functional/assets_own_equipment_evidence.spec.ts` (partes 2 y 3: alta HTTP y descarga)

**Interfaces:**
- Consumes: de la Tarea 2, `evidenceFile`, `OwnEquipmentEvidenceStorage` y la ruta de descarga; de la Tarea 1, `file` en el `Insert`. De la casa: `UploadService.fileUpload(file: IncomingFile | null, profileName, folderName, options)` (`upload_service.ts:165`), `IncomingFile = Pick<MultipartFile, 'tmpPath' | 'clientName' | 'extname' | 'size'>` (`file_intake_service.ts:52` — `request.file()` devuelve `MultipartFile | null`, que es estructuralmente compatible), `cuid` de `@adonisjs/core/helpers`, `logger` de `@adonisjs/core/services/logger`, `FileIntakeError` (`app/exceptions/file_intake_error.ts`, status por defecto 422), `OWN_EQUIPMENT_EVIDENCE_S3_FOLDER` (Tarea 1).
- Produces:
  - `create(employeeId: number, input: OwnEquipmentDeclarationInput, rawMonthlyFee: unknown, file: IncomingFile | null, userId: number): Promise<OwnEquipmentDeclarationDto>` — el archivo llega como CUARTO parámetro posicional; el `adjust` y el `close` NO cambian firma.
  - La subida dentro de `create`, después de los dos pre-chequeos (`hasOpenCoverage`/`hasOpenDeclaration`) y antes de `db.transaction`:

```ts
const storedKey = await this.storage.fileUpload(
  file,
  'evidence-document',
  '',
  { fileName: `${OWN_EQUIPMENT_EVIDENCE_S3_FOLDER}/${employee.businessUnitId}/${cuid()}` }
)
```

    y `file: storedKey` en la fila del `insert` DENTRO de la transacción. Si la transacción truena después de subir (y no es `ER_DUP_ENTRY`): `logger.warn({ storedKey }, 'Equipo propio: evidencia sin declaración')` y se relanza el original.
  - Controller: `const file = request.file('file')` después de `rawMonthlyFee`; `this.service.create(employeeId, {...}, rawMonthlyFee, file, userId)`.

- [ ] **Paso 1: escribir en rojo las partes HTTP del spec (parte 2: alta; parte 3: descarga)**

Sobre el mismo grupo del archivo, con `UploadService.prototype.fileUpload`/`getObjectStream` parchados y restaurados en `group.teardown` (molde `tests/functional/employees/employee_biometric_face_photo_stream.spec.ts:209-236`): el doble de `fileUpload` por defecto devuelve una key falsa `own-equipment-declarations/<buId>/c<RUN>.pdf` y CUENTA sus llamadas; los casos que corren el intake real (CA-3) o los rechazos (CA-4) restauran el original en `try/finally`. Helper de envío:

```ts
const postMultipart = (client, user, buPublicId, employeeId, fields: Record<string, string>, file?: { buffer: Buffer; filename: string; contentType: string }) =>
  client.post(`/api/employees/${employeeId}/own-equipment-declarations`).loginAs(user)
    .headers({ 'X-Business-Unit-Id': buPublicId })
    .fields(fields)                       // category/description/conditions/startDate/monthlyFee como texto
    .file('file', ...)                    // solo si el caso trae archivo
```

Casos (los valores exactos de keys/codes en §5-§6 del spec):

```ts
test('CA-1 — alta multipart con PDF: hasEvidence true y la key sin PII')
// PDF válido de ~200 KB con filename "Acuerdo Juan Perez.pdf" → 201, data.hasEvidence === true,
// fila en BD con employee_own_equipment_declaration_file que CONTENGA 'own-equipment-declarations/<buId>/'
// y termine en '.pdf', y que NO contenga 'Juan', 'Perez' ni 'Acuerdo'
// ningún campo del body trae la key (assert.notProperty sobre las propiedades del DTO)

test('CA-2 — alta sin archivo: hasEvidence false y fileUpload no se llama')
// fields sin file → 201, data.hasEvidence === false, columna NULL, doble con 0 llamadas

test('CA-3 — foto PNG con EXIF: se guarda como JPEG sin ubicación')
// PNG de 1px (constante base64 local, molde ONE_PIXEL_PNG de assets_module.spec.ts) con intake REAL
// → 201, key termina en '.jpg' (el re-encode lo hace el perfil, no esta HU)

test('CA-4 — tipo no permitido: el intake rechaza y la declaración no se guarda')
// buffer de texto con nombre .pdf y contentType application/pdf → 422 key 'contenido-no-corresponde',
//   code 'FILE.VAL.004', title 'Archivo no aceptado'; conteo de declaraciones del colaborador sin cambio
// .txt → 422 'extension-no-permitida' / FILE.VAL.003 · buffer de 11 MB con nombre .pdf →
//   422 'archivo-demasiado-grande' / FILE.VAL.005

test('CA-5 — falla del almacenamiento: 500 con su sobre y sin fila')
// doble de fileUpload que lanza FileIntakeError 'archivo-no-almacenado' (status 500,
//   errorCode FILE.SYS.001, detail 'No fue posible guardar el archivo. Vuelve a intentarlo.')
// → response 500 con key 'archivo-no-almacenado' y ese detail; cero filas insertadas

test('CA-6 — validaciones baratas primero: el archivo nunca se sube')
// colaborador de B con alcance de A → 404 'colaborador-no-encontrado' y doble con 0 llamadas
// categoría cubierta por activo → 409 'categoria-cubierta-por-activo' y 0 llamadas
// declaración vigente existente → 409 'declaracion-de-equipo-propio-vigente-existente' y 0 llamadas

test('RF — huérfano: la transacción que truena tras subir registra y no guarda fila')
// doble de OwnEquipmentDeclarationsRepositoryMysql.prototype.insert que lanza Error genérico,
//   fileUpload doblado que devuelve key → 500 'error-inesperado'; fileUpload llamado 1 vez,
//   cero filas; el log WARN existe (se acepta verificar solo el llamado al doble si el logger no se observa)

test('CA-7 — descarga OK: attachment, nosniff, no-store y nombre genérico')
// doble de getObjectStream ({ stream: Readable.from([bytes]), contentType: 'application/pdf',
//   contentLength }) → GET con supplies:read → 200 binario,
//   Content-Disposition empieza con 'attachment; filename="equipo-propio-<id>.pdf"',
//   Cache-Control 'private, no-store', X-Content-Type-Options 'nosniff',
//   Content-Type 'application/pdf'

test('CA-8 — 404 unico: inexistente, ajena y sin archivo responden igual')
// los tres GET (id inexistente / id de B con evidencia / propia sin evidencia) → 404 con
//   deepEqual del cuerpo completo: { key: 'archivo-no-encontrado', title: 'Archivo no encontrado',
//   detail: 'El archivo no existe o no está disponible.' } (más type/message/data del sobre)

test('CA-9 — declaración cerrada con evidencia: 200 y hasEvidence en el histórico')
// declaración cerrada con file → GET 200 como CA-7; y en la matriz (GET telework-supplies de la ficha)
//   ownEquipmentHistory trae el renglón con hasEvidence: true

test('CA-10 — el ajuste no hereda evidencia y el PUT ignora el archivo')
// vigente con evidencia → PUT JSON (monthlyFee 420) → nueva versión hasEvidence: false,
//   la cerrada sigue true; PUT multipart con campo file → fileUpload 0 llamadas y 200

test('CA-11 — permiso de descarga: 403 del gate sin supplies:read; root y owner pasan')
// actor con 'manage-employee-supplies' (Empleados) pero SIN supplies:read → GET → 403 del gate
//   (assertPermissionDenied); root y owner (bypass standard) → pasan el gate

test('CA-12 — las descargas existentes conservan inline y ganan nosniff')
// con la fila de una foto de resguardo (fixture por tabla) y el doble de getObjectStream →
//   GET de su ruta → 200 con Content-Disposition que empieza 'inline' y X-Content-Type-Options 'nosniff'
```

- [ ] **Paso 2: correr y verificar el rojo**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="assets_own_equipment_evidence.spec.ts"`
Expected: FAIL en las partes 2-3 (`store` ignora el `file`: CA-1 sale con `hasEvidence: false`; la descarga de una declaración recién creada sin archivo da… el 404 correcto, pero CA-1/2/3/5/6/10 en rojo).

- [ ] **Paso 3: implementar la subida**

Controller (`request.file('file')` tipado, pasada al servicio, `@swagger` del POST actualizado a `multipart/form-data` con `file` binario opcional) y servicio (subida con el orden §7, `file: storedKey` en el `insert` de la transacción, warn del huérfano). Nada del `adjust`/`close` cambia. El `createOwnEquipmentDeclarationValidator` NO se toca: el archivo no pasa por vine y los demás campos llegan como texto (la cuota ya se lee cruda con `request.input` y `parseMonthlyFee` acepta texto).

- [ ] **Paso 4: correr y verificar el verde**

```
node ace test functional --files="assets_own_equipment_evidence.spec.ts"     → PASSED (partes 1-3 completas)
node ace test functional --files="assets_own_equipment_declarations.spec.ts" → PASSED 25/25 (regresión JSON, sin editar)
node ace test functional --files="assets_module.spec.ts"                      → PASSED 24/24
node ace test functional --files="assets_telework_supplies.spec.ts"           → PASSED 15/15 (la matriz hereda hasEvidence por el tipo)
node ace test functional --files="assets_employee_assets.spec.ts"            → PASSED 15/15
node ace test unit --files="telework_supplies.rules.spec.ts"                  → PASSED 16/16
npm run typecheck                                                             → exit 0
npx eslint app/modules/assets app/constants                                  → 0 problemas
grep -rn "clientName" app/modules/assets/ | wc -l                             → 0
git diff --name-only feature/VLRH-H1791493045968-precargar-ajustar-y-terminar-la-declaracion-de...HEAD -- database/migrations resources/langs
→ (sin resultados)
```

- [ ] **Paso 5: commit**

```bash
git add app/modules/assets/own_equipment_declarations.controller.ts \
        app/modules/assets/own_equipment_declarations.service.ts \
        tests/functional/assets_own_equipment_evidence.spec.ts
git commit -m "feat(activos): sube la evidencia al declarar el equipo propio

El alta acepta multipart con un archivo opcional que se sube con el
perfil evidence-document despues de las validaciones baratas y antes
de la transaccion; la version nueva del ajuste nace sin evidencia y el
rechazo del intake sale con su propio sobre.

Refs: VLRH-H1791493046616"
```

---

### Tarea 4 (gsti-rh-bo): dominio — tipos aceptados, prevalidación y FormData del alta

Todo lo puro del panel: constantes de tipo y tope, `validateEvidenceFile`, el armador de `FormData` (el alta deja de ir como JSON) y los textos i18n. Sin tocar el repositorio ni el composable (Tarea 5).

**Files:**
- Modify: `components/ownEquipmentDeclarationPanel/domain/own-equipment-declaration.interface.ts` (`hasEvidence` en `OwnEquipmentDeclaration`; tipos de la evidencia)
- Modify: `components/ownEquipmentDeclarationPanel/domain/own-equipment-declaration.const.ts` (MIMEs aceptados y tope de 10 MB)
- Modify: `components/ownEquipmentDeclarationPanel/domain/own-equipment-declaration.helpers.ts` (`validateEvidenceFile` y `buildCreateOwnEquipmentFormData`)
- Modify: `components/ownEquipmentDeclarationPanel/domain/locales/own-equipment-declaration-panel.es.json` y `.en.json` (las 10 llaves de evidencia)
- Test: Modify `tests/ownEquipmentDeclarationPanel/own-equipment-declaration.helpers.spec.ts` (casos de `validateEvidenceFile` y del FormData)

**Interfaces:**
- Consumes: `OwnEquipmentDeclarationFormInput` y `AssetTypeTeleworkCategory` existentes del dominio.
- Produces (firmas exactas):
  - `OwnEquipmentDeclaration` gana `hasEvidence: boolean` (el API lo trae desde la Tarea 3; los fixtures de los specs de descarga lo siman). **La key del archivo nunca viaja al BO.**
  - `export const OWN_EQUIPMENT_EVIDENCE_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const` y `export const OWN_EQUIPMENT_EVIDENCE_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'] as const` y `export const OWN_EQUIPMENT_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024`.
  - `export const validateEvidenceFile = (file: File): 'file_type' | 'file_size' | null` — MIME (`file.type`) Y extensión (último segmento del nombre, minúsculas) en la lista → si no, `'file_type'`; `file.size > OWN_EQUIPMENT_EVIDENCE_MAX_BYTES` → `'file_size'`; en orden: primero `'file_type''` (CA-13: un `.docx` nunca llega a quejarse de tamaño).
  - `export const buildCreateOwnEquipmentFormData = (category: AssetTypeTeleworkCategory, input: OwnEquipmentDeclarationFormInput, file: File | null): FormData` — appends: `category` y `description` y `startDate` siempre; `conditions` solo si no vacía (misma normalización del builder actual); `monthlyFee` solo si `input.monthlyFee !== null` (la cuota ausente dispara la precarga del API); `file` solo si `file !== null`. SIN `Content-Type` manual (lo pone el navegador con el boundary).
  - i18n (es/en, bajo `own_equipment_declaration_panel.`): `evidence.attached` "Con evidencia adjunta"/"Evidence attached" · `evidence.none` "Sin evidencia"/"No evidence" · `actions.download_evidence` "Descargar evidencia"/"Download evidence" · `form.evidence` "Evidencia o condiciones (opcional)"/"Evidence or terms (optional)" · `form.evidence_hint` "PDF, JPG, PNG o WEBP de hasta 10 MB."/"PDF, JPG, PNG or WEBP up to 10 MB." · `form.evidence_remove` "Quitar archivo"/"Remove file" · `validation.file_type` "Solo PDF, JPG, PNG o WEBP."/"Only PDF, JPG, PNG or WEBP." · `validation.file_size` "El archivo supera 10 MB."/"The file exceeds 10 MB." · `toast.download_failed` "No fue posible descargar la evidencia."/"The evidence could not be downloaded."
  - El builder JSON (`buildCreateOwnEquipmentPayload`) y su tipo NO se tocan en esta tarea: el repositorio los usa hasta la Tarea 5, que los retira junto con el cambio de firma.

- [ ] **Paso 1: escribir en rojo los casos de dominio**

En `tests/ownEquipmentDeclarationPanel/own-equipment-declaration.helpers.spec.ts`:

```ts
describe('validateEvidenceFile', () => {
  // File { type: 'application/pdf', name: 'a.pdf', size: 1 } → null
  // File { type: 'image/png', name: 'a.png', size: 1 } → null · webp → null
  // File { type: 'application/vnd...', name: 'a.docx' } → 'file_type'
  // File { type: 'text/plain', name: 'a.pdf' } → 'file_type' (MIME miente, Review Focus 5)
  // File { type: 'application/pdf', name: 'a.pdf', size: 10 * 1024 * 1024 } → null (borde exacto)
  // File { type: 'application/pdf', name: 'a.pdf', size: 10 * 1024 * 1024 + 1 } → 'file_size'
})

describe('buildCreateOwnEquipmentFormData', () => {
  // con File → formData.get('file') igual al File · sin archivo → formData.has('file') === false
  // conditions '' → formData.has('conditions') === false · conditions 'x' → 'x'
  // monthlyFee null → formData.has('monthlyFee') === false (precarga) · 350 → '350'
  // category/description/startDate siempre presentes
})
```

- [ ] **Paso 2: correr y verificar el rojo**

Run: `npx --no-install vitest run tests/ownEquipmentDeclarationPanel`
Expected: FAIL (no existen `validateEvidenceFile` ni `buildCreateOwnEquipmentFormData`).

- [ ] **Paso 3: implementar**

Interfaz, constantes, helpers y las 10 llaves en ambos JSON. El `File` de vitest existe (environment `node` con globals; los casos construyen `new File([...], name, { type })`).

- [ ] **Paso 4: correr y verificar el verde**

```
npx --no-install vitest run tests/ownEquipmentDeclarationPanel → PASSED (23 existentes + los nuevos)
npm run lint:i18n                                              → sin claves nuevas sin traducción
npm run typecheck 2>&1 | grep -cE "ownEquipmentDeclarationPanel" → 0 (277 errores TS preexistentes fuera de la HU)
npx eslint components/ownEquipmentDeclarationPanel tests/ownEquipmentDeclarationPanel → 0 errores
```

Auditoría de compliance de `.claude/rules/compliance-check.md` sobre los tocados y línea **Compliance**.

- [ ] **Paso 5: commit**

```bash
git add components/ownEquipmentDeclarationPanel tests/ownEquipmentDeclarationPanel
git commit -m "feat(empleados): agrega el dominio de la evidencia del equipo propio

Tipos aceptados y tope de 10 MB para la prevalidacion del drawer, el
armador del FormData del alta (la cuota ausente viaja sin llave para
que el API la precargue) y los textos de evidencia en es y en.

Refs: VLRH-H1791493046616"
```

---

### Tarea 5 (gsti-rh-bo): aplicación e infraestructura — alta multipart y descarga en el composable

El repositorio del panel manda el alta como `FormData` y gana la descarga; el composable orquesta la descarga con `triggerBlobDownload` inyectado y el toast de error. Se retira el payload JSON del alta.

**Files:**
- Modify: `components/ownEquipmentDeclarationPanel/domain/own-equipment-declaration.interface.ts` (retiro del tipo de payload JSON)
- Modify: `components/ownEquipmentDeclarationPanel/infrastructure/own-equipment-declarations.repository.ts` (create con FormData; download con `assetDownload`)
- Modify: `components/ownEquipmentDeclarationPanel/application/use-own-equipment-declaration.ts` (descarga con dependencias inyectables)
- Test: Modify `tests/ownEquipmentDeclarationPanel/use-own-equipment-declaration.spec.ts` (descarga correcta y con error; adaptar la firma del create)
- Test: Modify `tests/ownEquipmentDeclarationPanel/own-equipment-declaration.helpers.spec.ts` (retiro de los casos del builder JSON)

**Interfaces:**
- Consumes: de la Tarea 4, `buildCreateOwnEquipmentFormData` y las constantes; de la casa, `assetFetch`/`assetDownload` (`pages/supplies/infrastructure/asset-http.ts:23-74`: `assetDownload(params: AssetRequestParams, path): Promise<{ blob: Blob; fileName: string | null }>`, ya resuelve el nombre de `Content-Disposition`), `triggerBlobDownload({ blob, fileName })` (`resources/scripts/utils/blob-download.ts:15-25`), `parseApiError`.
- Produces (firmas exactas):
  - Repositorio: `createOwnEquipmentDeclaration: (params: AssetRequestParams, employeeId: number, formData: FormData): Promise<OwnEquipmentDeclaration>` — `assetFetch<OwnEquipmentDeclarationEnvelope>(params, ownEquipmentDeclarationsPath(employeeId), { method: 'POST', body: formData })`; y `downloadOwnEquipmentEvidence: (params: AssetRequestParams, declarationId: number): Promise<{ blob: Blob; fileName: string | null }> => assetDownload(params, ownEquipmentDeclarationEvidencePath(declarationId))` con `const ownEquipmentDeclarationEvidencePath = (declarationId: number): string => \`/own-equipment-declarations/${declarationId}/file\``. `adjust` y `close` NO cambian.
  - Composable: `UseOwnEquipmentDeclarationDeps` gana `downloadEvidence` y `triggerBlobDownload`, ambas inyectables con default al repositorio y a la util real:

```ts
export interface UseOwnEquipmentDeclarationDeps extends AssetRequestParams {
  repository: typeof ownEquipmentDeclarationsRepository
  downloadEvidence?: (params: AssetRequestParams, declarationId: number) => Promise<{ blob: Blob; fileName: string | null }>
  triggerBlobDownload?: (params: { blob: Blob; fileName: string }) => void
}
```

  - `downloadEvidence(declarationId: number): Promise<boolean>` — fija `downloadingId`, llama a la dependencia, entrega con `triggerBlobDownload({ blob, fileName: fileName ?? \`equipo-propio-${declarationId}\` })`, limpia `downloadingId` y devuelve `true`; en fallo, `apiError.value = parseApiError(cause)`, limpia y `false` (el toast lo pone la vista, no el composable — mismo patrón de `submit`).
  - El retorno del composable gana `downloadingId: Ref<number | null>` y `downloadEvidence`.
  - Retiro: `CreateOwnEquipmentDeclarationPayload` y `buildCreateOwnEquipmentPayload` dejan de existir (el alta va siempre como `FormData`, con o sin archivo — §12). El tipo `Adjust`/`Close` no cambia.

- [ ] **Paso 1: escribir en rojo los casos de descarga**

En `use-own-equipment-declaration.spec.ts` (molde existente: `makeRepository(overrides)`, `failure` con shape `ApiError`), el doble de deps gana `downloadEvidence: vi.fn()` y `triggerBlobDownload: vi.fn()`:

```ts
describe('downloadEvidence', () => {
  // ok: resuelve { blob, fileName: 'equipo-propio-41.pdf' } → true, triggerBlobDownload llamado
  //     con { blob, fileName: 'equipo-propio-41.pdf' }, downloadingId vuelve a null
  // sin fileName: resuelve { blob, fileName: null } → triggerBlobDownload con 'equipo-propio-<id>' (respaldo)
  // fallo: downloadEvidence rechaza con failure (409/shape ApiError) → false, triggerBlobDownload NO
  //     llamado, apiError queda en el shape, downloadingId en null
  // durante la descarga: downloadingId es el id mientras la promesa no resuelve
})
// create: el repo se llama con FormData (expect(...).toHaveBeenCalledWith(params, employeeId, expect.any(FormData)))
```

y en `own-equipment-declaration.helpers.spec.ts` se retiran los casos del builder JSON.

- [ ] **Paso 2: correr y verificar el rojo**

Run: `npx --no-install vitest run tests/ownEquipmentDeclarationPanel`
Expected: FAIL (`downloadEvidence`/`downloadingId` no existen; el create aún espera el payload JSON).

- [ ] **Paso 3: implementar**

Interfaz (retiro del tipo), repositorio (FormData + `assetDownload`) y composable (descarga con dependencias inyectables). El `script.ts` aún no usa nada de esto (Tarea 6).

- [ ] **Paso 4: correr y verificar el verde**

```
npx --no-install vitest run tests/ownEquipmentDeclarationPanel → PASSED (los existentes adaptados + descarga)
npm run typecheck 2>&1 | grep -cE "ownEquipmentDeclarationPanel" → 0
npx eslint components/ownEquipmentDeclarationPanel tests/ownEquipmentDeclarationPanel → 0 errores
npm run lint:i18n → sin claves nuevas sin traducción
```

Compliance y línea **Compliance**.

- [ ] **Paso 5: commit**

```bash
git add components/ownEquipmentDeclarationPanel tests/ownEquipmentDeclarationPanel
git commit -m "feat(empleados): el alta del equipo propio viaja como FormData y gana descarga

El repositorio del panel manda el alta siempre como multipart (con o
sin archivo) y expone la descarga de la evidencia por assetDownload;
el composable la entrega con triggerBlobDownload inyectado y deja el
error listo para el toast de la vista.

Refs: VLRH-H1791493046616"
```

---

### Tarea 6 (gsti-rh-bo): la vista — campo de archivo en el drawer, chips y botón de descarga

El UI del panel: el campo solo en el modo `create`, la prevalidación antes de enviar, los chips en la vigente y en cada renglón del histórico, y el botón de descarga con estado de carga. Sin tests nuevos: el ciclo es vitest de regresión + typecheck + lint de i18n e iconos (los chips y el botón son template; el recorrido manual es la Tarea 7).

**Files:**
- Modify: `components/ownEquipmentDeclarationPanel/script.ts` (estado del archivo, prevalidación, envío FormData y descarga)
- Modify: `components/ownEquipmentDeclarationPanel/index.vue` (campo, chips y botón)
- Modify: `components/ownEquipmentDeclarationPanel/style.scss` (apilado del botón en móvil)

**Interfaces:**
- Consumes: de las Tareas 4-5, `validateEvidenceFile`, `buildCreateOwnEquipmentFormData`, `OWN_EQUIPMENT_EVIDENCE_MIME_TYPES`, `downloadEvidence`/`downloadingId` del composable, y `t('toast.download_failed')`. Molde del input: `components/assetResguardoPanel/index.vue:123-124` (input oculto + botón que lo dispara con `.click()`).
- Produces: nada que otra tarea consuma (última tarea de código).

- [ ] **Paso 1: implementar la vista**

`script.ts`:
- `const evidenceFile = ref<File | null>(null)`, `const evidenceError = ref<string | null>(null)`; `pickEvidence()` dispara el input oculto; `onEvidencePicked(event)` lee `input.files[0]`, lo pasa por `validateEvidenceFile` (código → `validationMessage`-like al `evidenceError` con `t('validation.file_type' | 'validation.file_size')`) y limpia `input.value`; `removeEvidence()` limpia el estado; `clearForm()` también.
- `save()` en modo `create`: si `evidenceError` no vacío, no envía (CA-13: "el botón Guardar no envía y no se hace petición"); si no, `declarationForm.submit(submitInput())` con `submitInput()` que arma el `FormData` con `buildCreateOwnEquipmentFormData(props.category, form, evidenceFile.value)`.
- `downloadEvidence(declarationId)`: `await declarationForm.downloadEvidence(id)`; si `false` → `toast.add({ severity: 'error', summary: props.categoryLabel, detail: apiError?.message ?? t('toast.download_failed'), life: TOAST_LIFE_MS })` (CA-14).

`index.vue`:
- Dentro del bloque `activeMode === modes.CREATE` (después de la cuota, L212-226): label `form.evidence`, hint `form.evidence_hint`, botón que abre el input oculto (`accept="application/pdf,image/jpeg,image/png,image/webp"` VERBATIM), nombre del archivo elegido, botón `form.evidence_remove`, y `Message severity="error"` de `evidenceError`.
- Chip en la vigente (junto al `Tag` de feeSource, L15-19): `Tag` con `evidence.attached`/`evidence.none`.
- En cada renglón del histórico (`__history-meta`, L104-108): el mismo chip por versión (`version.hasEvidence`).
- Botón "Descargar evidencia" (`actions.download_evidence`) SOLO con `hasEvidence` (vigente y por versión del histórico), con `:loading="declarationForm.downloadingId.value === <id>"` y `:disabled` mientras descarga.
- Se elimina el comentario de L88-90 ("«Con evidencia/Sin evidencia» no se pinta…"): ya se pinta, el DTO trae el campo.

`style.scss`: en móvil (<=360/480) el botón de descarga se apila (ancho completo) junto a los chips.

- [ ] **Paso 2: correr y verificar el verde**

```
npx --no-install vitest run tests/ownEquipmentDeclarationPanel → PASSED (23 + nuevos de las Tareas 4-5, sin cambios aquí)
npm run typecheck 2>&1 | grep -cE "ownEquipmentDeclarationPanel" → 0
npx eslint components/ownEquipmentDeclarationPanel → 0 errores
npm run lint:i18n → sin claves nuevas sin traducción
npm run lint:icons → limpio
```

Compliance archivo-por-archivo y línea **Compliance**.

- [ ] **Paso 3: commit**

```bash
git add components/ownEquipmentDeclarationPanel
git commit -m "feat(empleados): el panel de equipo propio gana el campo de evidencia

El drawer de alta adjunta un archivo opcional prevalidado antes de
enviar, y la vigente y el historico marcan Con evidencia adjunta o Sin
evidencia con su boton de descarga que baja el archivo sin abrirlo en
pestana.

Refs: VLRH-H1791493046616"
```

---

### Tarea 7: manual de QA — último entregable, solo se entrega

El usuario recorre este manual él mismo (trae pantalla: manual de frontend, único por historia). No se ejecuta ni se automatiza aquí: se escribe y se entrega (decisión de producto).

**Files:**
- Modify: `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (bloque nuevo de la HU; ese archivo NO se commitea)
- Create: `docs/superpowers/plans/2026-10-19-adjuntar-la-evidencia-de-la-declaracion-qa-flujo.md` (en gsti-rh-api, donde se versiona)

**Interfaces:**
- Consumes: la skill `manual-qa` (reglas en `~/.agents/rules/manual-qa/manual-qa-frontend.md` y `manual-qa-execution.md`): cada escenario abre con su línea `Objetivo:` antes de los pasos; correos exactos y contraseña literal leídos del sembrador compartido (si falta una cuenta, se agrega ahí: es su sitio); datos sembrados sin acentos ni eñes; sin rutas de archivo ni endpoints en el manual; anchos 360/850/escritorio; glosario si aplica; escenarios que resuelven las pruebas automatizadas con su `Objetivo:`, `Qué debe verse:` y `Qué pasó:`; checklist propio de la sección y `## Hallazgos de otras historias` (o «Ninguno»).
- Produces: el manual para el recorrido manual. Los hallazgos que el usuario reporte van a `qa-valanserh/hallazgos.md` (cuadro de 14 campos; el código archivo:línea en Comentarios/Historial) y se corrigen en esta misma rama.

- [ ] **Paso 1: completar el estado del sembrador y correrlo**

El sembrador ya trae los bloques de `VLRH-H1791306075599` y `VLRH-H1791493045968` (cuentas `qa-own-equipment-full@gsti-tests.local` con `manage-employee-supplies` y la cadena de lectura, y `qa-own-equipment-readonly@gsti-tests.local` sin escritura; colaboradores QA-TEL-01 a 07 con una declaración vigente y una versión cerrada para el histórico; la silla sin resguardo y la cuota estándar 350.00). Verifica en el archivo qué falta para ESTE manual y agrégalo en un bloque nuevo `VLRH-H1791493046616` (molde de los bloques hermanos): una cuenta SIN `supplies:read` para el 403/ocultamiento del botón, si es que la readonly ya no la cubre. Corre el único comando del playbook (el que imprime `[qa-seeder] listo`), SIN commitear el archivo.

- [ ] **Paso 2: escribir el manual**

Con la skill `manual-qa` cargada y los correos/contraseña leídos del sembrador (nunca de memoria). Escenarios recorribles: declarar equipo propio adjuntando el PDF del acuerdo (chip "Con evidencia adjunta" y botón que lo baja); declarar adjuntando una foto del celular (descarga sin la ubicación con que se tomó — verificar en el equipo tras descargar); declarar SIN archivo (chip "Sin evidencia", sin botón); descargar la evidencia de una declaración cerrada desde el histórico; ajustar la cuota de una declaración con evidencia (la versión nueva nace "Sin evidencia", la cerrada la conserva); prevalidación en el drawer con un `.docx` y con un PDF de 11 MB (el aviso antes de enviar, sin petición); entrar con la cuenta sin `supplies:read` (no ve el botón de descarga); anchos (360, ~850, escritorio: el campo a lo ancho del drawer y el botón apilado en móvil) e inglés. Escenarios que resuelven las pruebas automatizadas (con su `Objetivo:`, `Qué debe verse:` y `Qué pasó:`): el rechazo de tipo/tamaño/tipo-real por el API, la falla del almacenamiento que no guarda la declaración, el 404 único (inexistente/ajena/sin archivo), el 403 del gate, y el PUT que ignora el archivo.

- [ ] **Paso 3: verificación de formato y commit**

Cada escenario abre con su `Objetivo:`; sin endpoints, rutas de archivo ni comandos más allá del seeder; correos exactos y la contraseña literal del sembrador.

```bash
git add docs/superpowers/plans/2026-10-19-adjuntar-la-evidencia-de-la-declaracion-qa-flujo.md
git commit -m "docs(qa): agrega el manual de la evidencia de la declaracion de equipo propio

Refs: VLRH-H1791493046616"
```

Entregar la ruta al usuario y **esperar su recorrido manual**.

---

## Definition of Done — líneas base medidas (2026-10-19, ambos repos a la par de la base B)

Todas las verificaciones se midieron contra el árbol actual antes de escribir este plan (con `migration:fresh --seed` previo en `sae_pruebas`); estos números son los que valen. La base de los `git diff` es `feature/VLRH-H1791493045968-precargar-ajustar-y-terminar-la-declaracion-de`.

**gsti-rh-api** (`NODE_ENV=test`, BD `sae_pruebas` al día):

| Comando | Línea base | Criterio |
|---|---|---|
| `node ace test functional --files="assets_own_equipment_evidence.spec.ts"` | (nuevo) | PASSED, las tres partes |
| `node ace test functional --files="assets_own_equipment_declarations.spec.ts"` | PASSED 25/25 | PASSED 25/25 **sin editar el archivo** (regresión del contrato JSON, Review Focus 1) |
| `node ace test functional --files="assets_module.spec.ts"` | PASSED 24/24 | PASSED 24/24 (CA-12: inline intacto) |
| `node ace test functional --files="assets_telework_supplies.spec.ts"` | PASSED 15/15 | PASSED 15/15 |
| `node ace test functional --files="assets_employee_assets.spec.ts"` | PASSED 15/15 | PASSED 15/15 |
| `node ace test unit --files="telework_supplies.rules.spec.ts"` | PASSED 16/16 | PASSED 16/16 (sin editar) |
| `node ace test unit --files="supplies_organization_chart_permission_gate_routes.spec.ts"` | PASSED 22/22 | PASSED 22/22 (una fila más en el contrato; el conteo de tests no cambia) |
| `node ace test unit --files="file_intake_module_resolvers.spec.ts"` | PASSED 3/3 | PASSED 3/3 |
| `node ace test unit --files="constants/"` | PASSED 156/156 | PASSED 156/156 (sin cambios de catálogo) |
| `npm run typecheck` | exit 0 | exit 0 |
| `npx eslint app/modules/assets app/constants` | 0 problemas | 0 problemas |
| `grep -rn "clientName" app/modules/assets/` | sin resultados | sin resultados (DoD del spec) |
| `git diff --name-only <base>...HEAD -- database/migrations resources/langs` | (vacío hoy) | sin resultados |
| `git diff --name-only --diff-filter=A <base>...HEAD` | (vacío hoy) | solo `tests/functional/assets_own_equipment_evidence.spec.ts` |
| `git diff --name-only <base>...HEAD` | (vacío hoy) | subconjunto de las filas `editado`/`nuevo` del censo del spec |

**gsti-rh-bo:**

| Comando | Línea base | Criterio |
|---|---|---|
| `npx --no-install vitest run tests/ownEquipmentDeclarationPanel` | 2 archivos, 23 pruebas, PASSED | PASSED con los casos nuevos (prevalidación, FormData, descarga) |
| `npm run typecheck` | exit ≠ 0, **277 errores TS preexistentes, 0 en `ownEquipmentDeclarationPanel`/`employeeTeleworkSuppliesPanel`** | `grep -cE "ownEquipmentDeclarationPanel\|employeeTeleworkSuppliesPanel"` → 0 |
| `npx eslint components/ownEquipmentDeclarationPanel tests/ownEquipmentDeclarationPanel` | 0 errores | 0 errores |
| `npm run lint:i18n` | limpio (31 claves heredadas) | sin claves nuevas sin traducción |
| `npm run lint:icons` | limpio | limpio |
| `git diff --name-only --diff-filter=A <base>...HEAD` | (vacío hoy) | **vacío** (en el BO no se crea archivo) |

**Notas para el executor:**

- El API NO agrega llaves en `resources/langs` ni en `system_modules.constant.ts`; ningún cambio de catálogo: `node ace test unit --files="constants/"` se queda en 156.
- El tipo de archivo en el controller es el que devuelve `request.file('file')` (`MultipartFile | null`), estructuralmente compatible con `IncomingFile`; nada de `file: any` (spec §14).
- El doble de `fileUpload` en los tests del API parcha `UploadService.prototype.fileUpload` (el servicio de declaraciones construye el suyo con `new UploadService()` en el default del constructor) y lo restaura en el `teardown`; CA-3 y CA-4 corren con el intake REAL (el rechazo ocurre antes de tocar el bucket; la subida de CA-1/CA-3 usa el S3 de pruebas, como ya lo hacen `assets_module.spec.ts` con las fotos y `employee_work_disabilities.spec.ts` con los PDFs).
- El `insert` con `file` OPCIONAL (`file?: string | null`, adaptador `row.file ?? null`) es deliberado: mantiene el árbol compilando entre las Tareas 1 y 3 y hace que la versión nueva del ajuste nazca sin evidencia por omisión (regla 5), sin tocar el `adjust`.
- En el BO, `buildCreateOwnEquipmentPayload` (JSON) y su tipo se RETIRAN en la Tarea 5 — nadie más los usa; el alta va siempre como `FormData`.
- `openBlob` existe en `blob-download.ts` y abre en `_blank`: NO se usa para la evidencia (§14); la descarga es `assetDownload` → `triggerBlobDownload`.
- El hook del api solo corre eslint. No pasar `resources/langs/*.json` del api por eslint (errores `quotes` preexistentes sobre JSON).
- La suite unit completa del API no está toda en verde en la base (fallos preexistentes de otras historias): las puertas duras son los comandos acotados de esta tabla; un fallo nuevo fuera del censo se reporta en `## Hallazgos de otras historias` del manual y no se arregla aquí.
- No se crea PR ni se despliega: eso lo levanta el equipo (Wilvardo) por su cuenta.