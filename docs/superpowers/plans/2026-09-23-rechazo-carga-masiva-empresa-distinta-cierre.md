# Resumen de cierre — USRH1789747321650 Rechazo de carga masiva por empresa distinta

## Qué cambia

Pasada 1 del importador compara cada celda cruda de las dos columnas de empresa contra la lista en scope (un solo elemento, misma fuente que el cupo) y rechaza el archivo entero con **409** (`archivo-de-otra-empresa` / `EMP.IMPORT.VAL_BUSINESS_UNIT`) antes del cupo y antes de crear o modificar nada. Ofensora = celda con contenido que no resuelve en esa lista; celda vacía = activa (CA-8). El `detail`/`message` nombra la activa, lista hasta 20 filas (`fila N («texto tecleado»)`) y cierra con «… y N filas más.» si aplica, más «No se aplicó ninguna línea del archivo…». **Anti-requisito §12:** sin padrón global, sin oráculo de empresas fuera del scope — eliminados `allBusinessUnitsForResolution` y caché asociada.

El `catch` de la pasada 2 (CA-11): mensajes que el importador redacta siguen tal cual; cualquier otra excepción de fila devuelve `No fue posible procesar esta fila` al cliente (DoD: grep sin filtrar `error.message` crudo hacia `rowErrors` en el camino de importación). La regla 5 re-lanza el fallo de dato protegido (403) en vez de registrarlo como fila fallida.

## Qué NO cambia

Formato del archivo, columnas, pasos de subida; duplicado intra-empresa (salta y sigue); cupo (409); 403 de cabeceras sensibles; status de todo lo demás. Sin migración, sin catálogo, sin pantallas.

## Notas para revisión (los puntos que más atención piden)

- No es fuga entre clientes: hoy todo caía en la activa; es claridad, no seguridad.
- Se revisan las DOS columnas (la de nómina tiene criterio propio).
- **CA-7 (orden):** el aborto por empresa distinta ocurre antes de `assertImportWithinQuota` y de la pasada 2 → cero escrituras en BD (empleados, personas, domicilios, contactos) por construcción; conteos antes/después en spec funcional.
- **CA-6 e2e (403 a media pasada 2):** superseded por arquitectura — la importación corre `runUnguarded` y el permiso sensible se exige por cabeceras antes de las pasadas; el 403 alcanzable en importación es el de cabeceras (e2e propio en verde). Confirmación de Wilvardo solo si se exige el e2e literal del spec.
- Regla 5: la guarda que re-lanza el fallo de dato protegido queda instalada; hoy es inalcanzable en pasada 2 por lo anterior.
- Alcance: celda vacía no es ofensa; nombre no resuelto en scope se trata igual que nombre ajeno real (CA-9/CA-10, respuestas indistinguibles).
- Suite de importación en verde antes y después (incluida la sensible HTTP).

## Desviaciones conscientes respecto al spec técnico

- **Forma interna del error (N1):** se mantiene `Error` con flags (`isCompanyMismatchError`, `statusCode`, `offendingRows`) en lugar de la clase/factory espejo de cupo; contrato HTTP observable idéntico.
- **Ubicación del spec funcional:** casos CA-1..CA-11 (negocio) viven en `tests/functional/services/employee_import_company_scope.spec.ts`, no en la ruta nominal del spec; sin renombrar archivo mergeado.
- **`message` = `detail`:** en rechazo por empresa, ambos llevan el texto interpolado con filas (no el i18n genérico de `es.json` cuando hay listado).
- **`data.offendingRows`:** campo aditivo en el envelope de error (no estaba en la redacción mínima del spec); una entrada por celda ofensora con el valor tecleado.
- **Warn estructurado:** el log de rechazo no incluye `userId` (no plumbeado en esta entrega).

## Pruebas

Spec funcional `tests/functional/services/employee_import_company_scope.spec.ts` (criterios 1–5, CA-8 vacías, CA-9 indistinguibilidad, CA-10 warn sin nombres, CA-11 sintético, tope-20 con 21 filas; regla 5 en unitario del predicado + contenido del catch). Unitarios: resolver 409, factory de mensaje truncado, grep CA-11.

Manual hermano (6 escenarios): `docs/superpowers/plans/2026-09-23-rechazo-carga-masiva-empresa-distinta-qa-api.md`. Lo no revisable con base sembrada (403 dato protegido en pasada 2, listado >20 ofensoras), declarado en el manual.

Manual QA: alineado al spec técnico; pendiente de recorrido humano contra seed.
