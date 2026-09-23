# Resumen de cierre — USRH1789747321650 Rechazo de carga masiva por empresa distinta

## Qué cambia

Pasada 1 del importador compara las dos columnas resueltas contra la activa
(misma fuente que el cupo) y rechaza el archivo entero con 422
(`empresa-distinta-en-archivo` / `EMP.IMPORT.VAL_COMPANY`) enumerando TODAS
las filas ofensoras, antes del cupo y antes de crear o modificar nada.
El `catch` de la pasada 2 re-lanza el fallo de dato protegido (403) en vez
de registrarlo como fila fallida.

## Qué NO cambia

Formato del archivo, columnas, pasos de subida; duplicado intra-empresa
(salta y sigue); cupo (409); 403 de cabeceras sensibles; status de todo lo
demás. Nombres no resueltos conservan el fallback de hoy. Sin migración,
sin catálogo, sin pantallas.

## Notas para revisión (los puntos que más atención piden)

- No es fuga entre clientes: hoy todo caía en la activa; es claridad, no seguridad.
- Se revisaron las DOS columnas (la de nómina tiene criterio propio).
- Regla 5: la guarda que re-lanza el fallo de dato protegido queda instalada, pero hoy es inalcanzable porque la importación corre unguarded y el permiso sensible se exige por cabeceras antes de las pasadas; el 403 que sí ocurre en importación es el de cabeceras.
- Alcance: `null` no resuelto ≠ empresa distinta (ver Global Constraints).
- Suite de importación en verde antes y después (incluida la sensible HTTP).

## Pruebas

Spec funcional `tests/functional/services/employee_import_company_scope.spec.ts`
(5 casos, criterios 1-5; regla 5 en unitario del predicado + contenido del catch).
Manual hermano (5 escenarios). Lo no revisable con base sembrada, declarado en el manual.

Manual QA: escrito, pendiente de recorrido y verificación contra seed por el bloqueo descrito arriba.
