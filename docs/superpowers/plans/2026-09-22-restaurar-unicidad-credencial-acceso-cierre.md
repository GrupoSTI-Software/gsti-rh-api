# Resumen de cierre — USRH1789698261611 Restaurar la unicidad de la credencial de acceso

Rama: `feature/USRH1789698261611-unicidad-credencial-acceso`. No se crea ningún PR: este documento ES la narrativa de entrega sobre la rama. Plan: `docs/superpowers/plans/2026-09-22-restaurar-unicidad-credencial-acceso.md`. Evidencia de respaldo: `.superpowers/sdd/2026-09-22-restaurar-unicidad-credencial-acceso/task-5-report.md` (348 líneas, fuente de todos los outputs, demos CA-10 y residuales).

## Qué cambia

`users` gana la columna generada VIRTUAL `user_email_active` (`CASE WHEN user_deleted_at IS NULL THEN TRIM(user_email) ELSE NULL END`) y el índice UNIQUE `users_email_active_unique` sobre ella. Hereda `utf8mb4_0900_ai_ci`: mayúsculas y acentos no distinguen por construcción. VIRTUAL, no STORED: el índice secundario materializa igual y el ALTER es solo metadatos. El índice se condiciona sobre `user_deleted_at`, nunca sobre `user_active`: desactivar no libera el correo, solo la baja lo libera. Sin `COLLATE` explícito, sin declarar la columna en el modelo, sin tocar validators ni espejo.

La migración (`database/migrations/1790089196691_add_email_active_unique_to_users.ts`, prefijo de 13 dígitos) registra PRIMERO un censo en `this.defer` que aborta sin aplicar ningún DDL si hay vivas compartiendo correo; el mensaje lista `user_id`/`person_id`/`user_active` y conteos, nunca proyecta correos. `down()` tolerante vía `information_schema` (ciclo up→down→up verificado).

El conflicto se rechaza con 400 `{title, detail, key:'correo-de-acceso-ya-registrado', code:'USR.MAIL.002'}`: catálogo nuevo `DUPLICATED` en `USER_ACCESS_EMAIL_ERRORS`, claves i18n en `es.json` y `en.json`, detectores `isUserAccessEmailDuplicatedValidationError` (VineJS `.unique()`, rule observado `database.unique`) e `isUserAccessEmailDuplicatedIndexError` (MySQL 1062 sobre el índice, la perdedora de una carrera) y respondedores `respond…`. En `update` se retiró el reenvío de `verifyInfo.data` (traía hash scrypt, `userToken`, `pinCode`); en `store` y `update` los catch distinguen validación y carrera antes del 500 genérico. `user_service.ts` cierra la guarda fail-open: `''` ahora es 400. El login endurecido compara el id que verificó la contraseña contra el que emite la sesión (`verifiedUserId !== user.userId → 404` con el mismo cuerpo de credencial inválida).

Swagger: una sola entrada `'400'` por bloque (`store`, `update`) con `oneOf` (genérico + conflicto USR.MAIL.002) — corrección `f27de411`, que además devolvió `POST /api/users` a la especificación generada.

Onda de corrección `741533f0` (esta entrega): ambos respondedores (MASKED y DUPLICATED) leen `status`/`key`/`code` desde `USER_ACCESS_EMAIL_ERRORS` (conducta idéntica: MASKED 422 + su clave, DUPLICATED 400 + su clave); el spec funcional renombra sus correos a `mailuniq-ca1-…` y su barrido a `LIKE 'mailuniq-%'` excluyendo al actor propio.

## Qué NO cambia

Ninguna pantalla, ningún campo de request ni de response salvo el cuerpo del 400 de duplicado en edición (ver Notas), ningún status salvo los documentados. Quien entra con un correo único sigue entrando igual. Sin tocar: `app/models/user.ts`, `app/validators/user.ts`, `platform_auth_controller.ts`, `platform_recovery_controller.ts`, `passkey_controller.ts`, `platform_magic_link_service.ts`, `person_controller.ts`, `employee_controller.ts`, `signup_draft_service.ts`, `database/seeders/0008_user_seeder.ts`, `system_modules.constant.ts`, rutas y middlewares, `valanserh-bo`. Nada se retira a `__TO_DELETE__/`. `pnpm-lock.yaml` y `pnpm-workspace.yaml` aparecen sucios por causas ajenas y no se commitean.

## Notas para revisión

- **Cambio de forma del 400 en edición.** Antes el duplicado en `PUT /api/users/:userId` respondía el legado `{type, title, message, data}`; ahora responde `{title, detail, key, code}` igual que el alta. El backoffice tiene su rama sobre el 400: esa rama no se verificó contra el repo del backoffice en esta entrega.
- **Payloads con varios campos inválidos reportan solo el conflicto de correo.** Si el `userEmail` duplica a otra viva y además otro campo falla validación, el guard de duplicado responde primero con USR.MAIL.002 y los demás errores no se enumeran.
- **Filas con correo vacío cuentan como duplicadas para el censo.** El censo agrupa por `TRIM(user_email)`, así que N vivas con `''` forman un grupo duplicado y abortan la migración; el mensaje de aborto no puede decir que se trata de correos vacíos porque la Regla 7 prohíbe proyectar correos (ni completos ni enmascarados).
- **El `.unique()` de VineJS no está acotado por empresa y ahora su fallo es legible.** El oráculo entre empresas (probar si un correo existe en cualquier empresa) queda expuesto en un 400 con mensaje claro; es inherente a la Regla 1 (la unicidad es global, no por empresa), no un defecto de esta HU.
- **Residual de carrera ampliado: tres superficies, un solo seguimiento.** El índice evita el duplicado silencioso en las tres, pero ninguna mapea a USR.MAIL.002: (a) `app/controllers/auth_signup_controller.ts` (`completeSignup`, `:727-752`): su 500 genérico reenvía `error.message`, que en una carrera perdida contendría el correo y el nombre del índice; (b) `app/controllers/platform_user_controller.ts:197` (`store`): crea usuario de plataforma sin `try/catch` propio; (c) `app/modules/onboarding/demo_seed/demo_seed.repository.mysql.ts:221`: la siembra demo crea el usuario vía `UserService.create` dentro de su transacción. El seguimiento es UN solo mapeador compartido que reuse `isUserAccessEmailDuplicatedIndexError`, no un parche solo para signup.
- Par indivisible y ventana: *Blindar el espejo* va al mismo sprint o no va ninguna (si solo cabe una, no entra ésta). La base arranca limpia el 2026-09-28 (decisión de Wilvardo del 2026-09-17); el resultado esperado de la verificación previa en la ventana es no encontrar nada.

## Evidencia (DoD)

### 1. Base vacía + siembra completa en verde

`NODE_ENV=test DB_DATABASE=sae_pruebas ROOT_USER_EMAIL=root-test@gsti-tests.local ROOT_USER_PASSWORD='<solo-pruebas>' node ace migration:fresh --seed` → `exit_code: 0` en ~37 s. `Dropped tables successfully`, 680 migraciones `migrated` (incluidas `1790089196691_add_email_active_unique_to_users` y `create_passkey_credentials_table`), todos los seeders `completed`.

### 2. El censo aborta con duplicados vivos, sin proyectar correos

Siembra a mano: B=187 `DUPE-CA10@GSTI-TESTS.LOCAL` (mayúsculas, inactivo) creado primero, A=188 `dupe-ca10@gsti-tests.local` (activo). `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:run` → EXIT:1, mensaje literal:

```text
[USRH1789698261611] Cuentas vivas compartiendo correo de acceso — resolver manualmente antes de continuar:
  - x2 -> user_id=187 person_id=1 user_active=0, user_id=188 person_id=2 user_active=1
Consultas de diagnóstico (sin proyectar correos):
  SELECT user_id, person_id, user_active, COUNT(*) OVER (PARTITION BY TRIM(`user_email`)) AS repetidos FROM `users` WHERE `user_deleted_at` IS NULL ORDER BY user_id;
```

Inspección literal: ningún correo (el texto no contiene `@`), ningún `business_unit_id`; solo `user_id`, `person_id`, `user_active` y el conteo `x2`. Detectó el par pese a las mayúsculas y abortó ANTES de cualquier DDL (`passkey_credentials` nunca se creó). Tras `DELETE` manual de ambas filas, `migration:run` aplica las 12 pendientes sin errores.

### 3. `migration:rollback` corre limpio tras el aborto

`NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:rollback` → `Reverted` sin errores. Lectura honesta: el censo abortó antes de cualquier DDL, así que no había estado parcial propio que revertir; el rollback limpio demuestra que el aborto no deja la corrida a medias. La tolerancia del `down()` propio se demostró aparte: tras la corrida buena, el rollback revierte el lote completo (ruta `information_schema`, cero residuos) y la re-corrida migra limpio. Ciclo up→down→up cerrado.

### 4. Columna: cero filas tras el aborto, generada con la collation esperada tras la corrida buena

`SHOW COLUMNS FROM users LIKE 'user_email_active'` tras el aborto → `[]`. Tras la corrida buena, `SHOW FULL COLUMNS` → `varchar(200)`, `Collation: utf8mb4_0900_ai_ci`, `VIRTUAL GENERATED`, `Key: UNI`.

### 5. Índice: cero filas tras el aborto, único tras la corrida buena

`SHOW INDEX FROM users WHERE Key_name = 'users_email_active_unique'` tras el aborto → `[]`. Tras la corrida buena → presente sobre `user_email_active`, único (`Non_unique: 0`).

### 6. Registro: cero filas tras el aborto

`SELECT name FROM adonis_schema WHERE name LIKE '%email_active_unique%'` tras el aborto → `[]` (la migración abortada no quedó registrada). Tras la corrida buena → registrada en su lote.

### CA-10: abuso demostrado por los dos extremos

Pre-endurecimiento (código `0552cd31` en worktree desechable contra BD desechable `sae_pruebas_base`, índice ausente verificado): par vivo duplicado B=653 (mayúsculas, inactivo, contraseña propia) y A=654 (activo, otra contraseña). `POST /api/auth/login` con el correo y la contraseña **de B** → `status=200`, sesión y par de tokens de **A** (`tokenable_id=654`), `type=success message=You have successfully logged in`. Abuso ejecutado, no deducido.

Post-endurecimiento (código de esta HU, misma forma de par B=187/A=188): login con la contraseña de B → `status=404 body={"type":"warning","title":"Login","message":"Incorrect email or password","data":{"user":{}}}`. Sin token, sin sesión. Tras aplicar la migración ese estado es inalcanzable (el censo aborta si existe y el índice impide crearlo).

### Suite, typecheck, lint, consistencia

Comparación normalizada por identidad de caso (misma máquina, secuencial, misma siembra): base `0552cd31` → `4616 passed, 286 failed, 19 skipped (4921)`; HEAD con la HU → `4631 passed, 285 failed, 19 skipped (4935)`. Cruce: (a) 285 fallos en ambos árboles → preexistentes; (b) 0 fallos solo con la HU → **cero rojo atribuible**; (c) 1 fallo solo en la base (caso inestable ajeno). La diferencia de totales son exactamente los 14 casos nuevos de esta HU, todos en verde: `user_access_email_uniqueness.spec.ts` 9/9 (CA-1…CA-9) y `user_access_email_duplicated_error.spec.ts` 5/5. Radio de blast: `USR.MAIL.002`, `correo-de-acceso-ya-registrado` y `users_email_active_unique` aparecen una sola vez en todo el log (el propio unitario en verde). `npm run typecheck` → limpio, exit 0. Lint acotado a los 7 `.ts` de la HU → exit 0, cero hallazgos (los 67 errores del lint completo viven todos en `database/seeders/_tmp_do_not_commit_qa_seeder.ts`, local e ignorado por git, fuera de la HU). `NODE_ENV=test DB_DATABASE=sae_pruebas node ace permissions:check-consistency` → `fin: sin hallazgos`, exit 0.

### Residuales de §12 (no se venden como cerrados)

1. `platform_auth_controller.ts:109-122`: el login de plataforma no tiene `if (!verifiedUser.userActive)` junto al gate `isPlatformAdmin` de `:111`: un admin de plataforma desactivado sigue entrando a la consola landlord. HU aparte (~1 SP).
2. Passkey (`passkey_controller.ts:93`, `:201`, `:336`, `:598` — `.first()` por correo), magic link y recuperación de plataforma (`platform_recovery_controller.ts:69`): el índice las cubre sin tocar línea (sin duplicados vivos, el `.first()` vuelve determinista). Persiste el oráculo distinguible preexistente: correo desconocido → 404 en `:93-97` vs 200 `{hasPasskeys:false}` en `:598`. No se toca.
3. Homoglifos: la collation pliega caso y acentos (CA-7/CA-8) pero no homoglifos de otros alfabetos (`а@x.com` cirílica vs `a@x.com` latina conviven). Declarado, no mitigado.
4. `user_deleted_at` + auth: **cerrado** con evidencia de `node_modules` (`@adonisjs/auth@9.2.3`, `findForAuth` usa `this.query()` con el scope de `SoftDeletes` + `limit(1).first()`).
5. Sin limiter en `POST`/`PUT /api/users` (solo limiters de reenvío de acceso en `user_routes.ts:8-16`). Declarado, no arreglado aquí.
6. Carrera de registro con tres superficies y un solo seguimiento compartido (ver Notas para revisión).
7. Ya cerrados en esta rama: swagger con claves `'400'` duplicadas (corregido en `f27de411`, verificado con `swagger-jsdoc`: cero avisos YAML, `POST /api/users` de vuelta en la especificación, USR.MAIL.002 presente en ambas rutas).

## Onda de corrección final (revisión de todo el branch)

La revisión final encontró el código sólido y pidió solo acta de entrega más dos menores baratos, ejecutados aquí: (a) los dos respondedores leen `status`/`key`/`code` desde `USER_ACCESS_EMAIL_ERRORS` — unitario 5/5 + `tsc --noEmit` limpio; (b) el barrido del spec funcional usa el prefijo `mailuniq-` y excluye al actor propio — spec 9/9 en verde. Commits: `741533f0` (código + spec) y el commit de estos documentos (plan + cierre). Reporte de la onda: `.superpowers/sdd/2026-09-22-restaurar-unicidad-credencial-acceso/fix-wave-report.md`.

## Pruebas

Manual de QA de API hermano: `docs/superpowers/plans/2026-09-22-restaurar-unicidad-credencial-acceso-qa-api.md` (6 escenarios; lo recorre una persona, no el agente). Japa en esta entrega: unitario 5/5 y funcional 9/9 (ver arriba); suite completa normalizada sin delta atribuible (ver Evidencia).
