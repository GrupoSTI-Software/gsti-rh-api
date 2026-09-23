# Resumen de cierre — USRH1789698261610 Unicidad de identidad por empresa

## Qué cambia

RFC, CURP y NSS únicos por empresa entre expedientes vivos: 3 columnas generadas
VIRTUAL (`person_*_active`) + 3 UNIQUE `(business_unit_id, *_active)` con censo
previo que aborta sin proyectar PII. Alta, edición y verificación comparan por
empresa explícita; la carga masiva compara CURP por empresa de la fila; el correo
sigue global (restaurado explícito con `runUnscoped`, contrato idéntico); vaciar
libera la huella; la baja libera por construcción; sin empresa nunca hay
veredicto (400); los tres rechazos hablan `{title, detail, key, code}`
(`PERSON.IDENTITY.001-003`) sin datos internos.

## Qué NO cambia

Ninguna pantalla, ningún campo de request/response, ningún status (422 en
duplicados, como hoy), ninguna ruta ni middleware, ningún mensaje del correo,
ningún seed versionado, ningún catálogo (no hizo falta
`permissions:check-consistency`). Filas sin empresa fuera de la regla (límite
declarado, regla 8). Sin saneo (regla 11).

## Notas para revisión (los dos puntos que más atención piden)

- Correo por arrastre: el validador y `verifyInfo` comparan identidad con
  `business_unit_id` explícito y correo con `runUnscoped` (global). Auditoría:
  `grep business_unit_id app/validators/person.ts` solo en los 3 unique de
  identidad; `grep business_unit_id app/services/person_service.ts` solo en
  ramas de identidad. El correo quedó global por trabajo explícito, que es lo
  que la HU exigía ("no basta con no tocarlo").
- Regla que aparenta funcionar: criterio 6 verde en
  `tests/functional/person_identity_company_scope.spec.ts` (POST sin header →
  400 `BU.VAL.000` sin veredicto) + Esc. 5 del manual.
- Status 422 conservado a propósito (el BO tiene su rama sobre ese status).
  Visto bueno BO: pendiente (sin checkout local de valanserh-bo).
- Primer-choque-gana CURP>RFC>NSS también en carrera (re-chequeo en ambos
  `catch`, fallback al índice).
- PUT no puede vaciar sensibles (`convertEmptyStringsToNull` + null = "no
  actualizar", flujo masked-echo preexistente): el criterio 4 vacía vía modelo
  en el spec y vía SQL de preparación en el manual. Límite documentado, no defecto.

## Evidencia

- `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed`
  (con `ROOT_USER_*`, quirk preexistente de `0008_user_seeder`) → exit 0,
  681 migraciones, DDL verificado en `people`.
- Censo (simulacro en BD scratch `sae_pruebas_t7`, creada/ensuciada/borrada el
  2026-09-23): dos vivos misma empresa mismo RFC →
  `[USRH1789698261610] ... resolver manualmente: - x2 RFC empresa=1 ->
  person_id=1, person_id=2 / No se aplicó ningún cambio...` y `SHOW COLUMNS
  LIKE '%_active'` vacío después del aborto. En producción limpia (2026-09-28)
  el resultado esperado es no encontrar nada.
- `down()` validado en dev-DB: `run → rollback → run` limpio (batch propio).
- Suite: 4637 pasan / 286 fallan — todo ruido 429 ambiental bajo carga +
  diferidos abajo; baseline 287. Typecheck exit 0. Lint: limpio en producto
  (68 errores solo en `_tmp_do_not_commit_qa_seeder.ts`, no versionado,
  de muchas HUs).
- Diferidos al final review: asserts CURP/NSS en spec de detectores;
  warn-noise de `runUnscoped` por alta con correo; assert de import en
  `employee_import_excel_bulk_performance` (preexistente, otra historia).

## Pruebas

Spec funcional `tests/functional/person_identity_company_scope.spec.ts` (7 casos,
criterios 1-6). Manual hermano:
`docs/superpowers/plans/2026-09-22-unicidad-identidad-por-empresa-qa-api.md`
(5 escenarios, lo recorre una persona). Fixture CA-8 ajustado (RFC distintos
por persona; defaults intactos para write/mask-echo).

## Notas operativas

- Las columnas generadas `*_active` dependen de `person_*_hash` y de
  `person_deleted_at`: una migración futura que altere o elimine cualquiera de
  ellas falla por esa dependencia. La salida es correr antes el `down()` de
  `1790106682775_add_person_identity_active_uniques_to_people_table` y volver a
  aplicarla después.
- El UNIQUE sobre una columna VIRTUAL se construye con INPLACE, no INSTANT:
  recorre la tabla. Sobre la BD limpia del 2026-09-28 no importa; con volumen sí.
- El correo sigue único de forma global (regla 5 de la HU): su 422 revela que el
  correo existe en otra empresa. Canal de enumeración aceptado, no defecto.
- La historia de reincorporación debe traducir el `ER_DUP_ENTRY` al restaurar
  una persona dada de baja igual que lo hacen el alta y la edición por HTTP;
  si no, el choque con el UNIQUE sale como 500 con el texto crudo de MySQL.
