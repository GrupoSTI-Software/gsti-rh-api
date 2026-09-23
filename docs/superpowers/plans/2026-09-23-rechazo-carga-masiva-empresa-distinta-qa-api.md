# Prueba manual API — Rechazo de carga masiva por empresa distinta

**Problema:** un archivo de empleados podía mezclar empresas y cargarse entero en la empresa activa sin avisar que algunas filas declaraban otra empresa.

**Solución:** si una fila declara una empresa de trabajo o de nómina distinta de la activa, se rechaza el archivo completo antes de crear o modificar a alguien. La respuesta explica el motivo y enumera todas las filas que deben corregirse. El texto del rechazo cita cada fila una sola vez, con el o los nombres que ahí se escribieron; la lista de abajo (`offendingRows`) trae una entrada por celda de empresa señalada, así que una fila con las dos columnas equivocadas aparece dos veces en esa lista: una por la columna de trabajo y otra por la de nómina.

Ejemplo: es como entregar a una escuela una lista de asistencia que también incluye alumnos de otra escuela. En vez de guardar toda la lista en la escuela equivocada, se devuelve completa indicando cuáles renglones pertenecen a la otra.

Se prueba con un cliente de API (Postman, Insomnia, Bruno). La autenticación se asume resuelta por tu cliente: se envía el token del usuario en el header `Authorization: Bearer <token>`.

**URL base:** `http://127.0.0.1:3333`

## 1. Preparar

Ejecutar el seeder compartido:

```bash
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Debe dejar dos empresas de plataforma: `QA Carga Empresa A` (`qa-carga-a`) y `QA Carga Empresa B` (`qa-carga-b`). Solo A necesita usuario: B nunca actúa; su nombre únicamente se escribe dentro de los archivos.

| Correo | Contraseña | Variante |
|---|---|---|
| `qa-carga-capturista-a@gsti-tests.local` | `password` | Capturista de la empresa A |

Obtener los identificadores públicos sin inventarlos:

```sql
SELECT business_unit_slug, business_unit_public_id FROM business_units WHERE business_unit_slug IN ('qa-carga-a', 'qa-carga-b');
```

Usar en todos los escenarios los headers:

```text
Authorization: Bearer <token del capturista de A>
X-Business-Unit-Id: <business_unit_public_id de qa-carga-a>
```

### Preparar los archivos

**Endpoint de plantilla:** `GET /api/employees/template-excel`

Descargar la plantilla real con los headers anteriores. Para cada fila de datos llenar al menos:

- `Identificador de nómina`
- `Nombre del empleado`
- `Apellido paterno del empleado`

Las columnas `Unidad de negocio de trabajo` y `Unidad de negocio de nómina` pueden dejarse vacías: vacío significa la empresa activa (A). Si las llenas, escribe exactamente `QA Carga Empresa A` o `QA Carga Empresa B`. El Escenario 1 también llena `CURP` en una fila para preparar el duplicado propio del Escenario 6.

**Endpoint de subida:** `POST /api/employees/import-excel`

Enviar como `multipart/form-data`, en el campo `file`, el archivo Excel de cada escenario.

## 2. Escenario 1 — Todas las filas pertenecen a A

Crear un archivo con:

| Fila | Identificador de nómina | Unidad de negocio de trabajo | Unidad de negocio de nómina | Nombre del empleado | Apellido paterno del empleado | CURP |
|---:|---|---|---|---|---|---|
| 2 | `QA-CARGA-OK-01` | `QA Carga Empresa A` | `QA Carga Empresa A` | `Carga` | `CorrectaUno` | `QACG000101HDFXXX01` |
| 3 | `QA-CARGA-OK-02` | `QA Carga Empresa A` | `QA Carga Empresa A` | `Carga` | `CorrectaDos` | |

**Endpoint:** `POST /api/employees/import-excel`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Importación completada",
  "message": "Importación exitosa: 2 empleados creados, 0 empleados actualizados.",
  "data": {
    "summary": {
      "totalRows": 2,
      "processed": 2,
      "created": 2,
      "updated": 0,
      "failed": 0,
      "skipped": 0,
      "limitReached": false
    },
    "rowErrors": [],
    "warnings": [],
    "errors": []
  }
}
```

Qué significa cada dato:

- `type`: resultado general. Puede valer `success` (se hizo todo lo pedido), `warning` (se procesó el archivo, pero hubo filas con error o avisos) o `error` (no se procesó el archivo).
- `title` / `message`: resumen legible del resultado y cantidades procesadas.
- `data.summary.totalRows`: filas de empleados recibidas.
- `data.summary.processed`: filas que sí terminaron de guardarse.
- `data.summary.created`: empleados nuevos.
- `data.summary.updated`: empleados existentes modificados.
- `data.summary.failed`: filas distintas que tuvieron error.
- `data.summary.skipped`: filas omitidas.
- `data.summary.limitReached`: puede valer `false` (el cupo no detuvo la carga) o `true` (el cupo sí la detuvo).
- `data.rowErrors`: filas que no pudieron guardarse y su motivo.
- `data.warnings`: avisos que no impidieron terminar la carga.
- `data.errors`: lista de errores por fila en el formato anterior que todavía consume la aplicación.

## 3. Escenario 2 — Una fila declara otra empresa de trabajo

Crear un archivo con:

| Fila | Identificador de nómina | Unidad de negocio de trabajo | Unidad de negocio de nómina | Nombre del empleado | Apellido paterno del empleado |
|---:|---|---|---|---|---|
| 2 | `QA-CARGA-TRABAJO-01` | `QA Carga Empresa A` | `QA Carga Empresa A` | `Carga` | `TrabajoCorrecto` |
| 3 | `QA-CARGA-TRABAJO-02` | `QA Carga Empresa B` | `QA Carga Empresa A` | `Carga` | `TrabajoAjeno` |

Antes de subirlo, anotar el resultado de esta consulta. Repetirla después del rechazo: el conteo debe ser el mismo.

```sql
SELECT COUNT(*) AS total
FROM employees
WHERE business_unit_id = (
  SELECT business_unit_id FROM business_units WHERE business_unit_slug = 'qa-carga-a'
)
AND employee_deleted_at IS NULL;
```

**Endpoint:** `POST /api/employees/import-excel`

**Response exacto:** `409`

```json
{
  "type": "error",
  "title": "El archivo tiene empleados de otra empresa",
  "message": "La empresa activa es «QA Carga Empresa A». Estas filas declaran otra: fila 3 («QA Carga Empresa B»). No se aplicó ninguna línea del archivo: sube un archivo por empresa, o cambia la empresa activa y vuelve a intentarlo.",
  "detail": "La empresa activa es «QA Carga Empresa A». Estas filas declaran otra: fila 3 («QA Carga Empresa B»). No se aplicó ninguna línea del archivo: sube un archivo por empresa, o cambia la empresa activa y vuelve a intentarlo.",
  "key": "archivo-de-otra-empresa",
  "code": "EMP.IMPORT.VAL_BUSINESS_UNIT",
  "data": {
    "offendingRows": [
      {
        "row": 3,
        "businessUnit": "QA Carga Empresa B",
        "payrollBusinessUnit": ""
      }
    ]
  }
}
```

Qué significa cada dato nuevo:

- `type`: aquí vale `error`, es decir, no se procesó el archivo: ninguna fila se guardó.
- `title`: motivo del rechazo en una frase, para mostrar al usuario.
- `message`: el mismo texto de `detail` (el envelope repite ambos para no romper a quien lea uno u otro).
- `detail`: explicación completa del rechazo (empresa activa, filas citadas y que no se guardó nada); coincide con `message`.
- `key`: clave estable del rechazo; `archivo-de-otra-empresa` significa que al menos una celda de empresa en el archivo no corresponde a la activa.
- `code`: código estable del catálogo; `EMP.IMPORT.VAL_BUSINESS_UNIT` identifica el rechazo por empresa en la importación.
- `data.offendingRows`: todo lo que debe corregirse, con una entrada por celda de empresa señalada; si una misma fila tiene mal las dos columnas, aparece en dos entradas (el texto del rechazo, en cambio, la cita una sola vez).
- `row`: número de la fila en el Excel (la fila 1 es la cabecera).
- `businessUnit`: texto tecleado en la columna de trabajo cuando esa celda es la ofensora; vacío si la ofensa fue solo en nómina.
- `payrollBusinessUnit`: texto tecleado en la columna de nómina cuando esa celda es la ofensora; vacío si la ofensa fue solo en trabajo.

## 4. Escenario 3 — Una fila declara otra empresa de nómina

Crear un archivo con:

| Fila | Identificador de nómina | Unidad de negocio de trabajo | Unidad de negocio de nómina | Nombre del empleado | Apellido paterno del empleado |
|---:|---|---|---|---|---|
| 2 | `QA-CARGA-NOMINA-01` | `QA Carga Empresa A` | `QA Carga Empresa A` | `Carga` | `NominaCorrecta` |
| 3 | `QA-CARGA-NOMINA-02` | `QA Carga Empresa A` | `QA Carga Empresa B` | `Carga` | `NominaAjena` |

**Endpoint:** `POST /api/employees/import-excel`

**Response exacto:** `409`

```json
{
  "type": "error",
  "title": "El archivo tiene empleados de otra empresa",
  "message": "La empresa activa es «QA Carga Empresa A». Estas filas declaran otra: fila 3 («QA Carga Empresa B»). No se aplicó ninguna línea del archivo: sube un archivo por empresa, o cambia la empresa activa y vuelve a intentarlo.",
  "detail": "La empresa activa es «QA Carga Empresa A». Estas filas declaran otra: fila 3 («QA Carga Empresa B»). No se aplicó ninguna línea del archivo: sube un archivo por empresa, o cambia la empresa activa y vuelve a intentarlo.",
  "key": "archivo-de-otra-empresa",
  "code": "EMP.IMPORT.VAL_BUSINESS_UNIT",
  "data": {
    "offendingRows": [
      {
        "row": 3,
        "businessUnit": "",
        "payrollBusinessUnit": "QA Carga Empresa B"
      }
    ]
  }
}
```

(Todos los datos de esta respuesta son los ya explicados en el Escenario 2. Lo único distinto es cuál de las dos columnas quedó señalada: aquí el nombre ajeno viaja en `payrollBusinessUnit` y `businessUnit` va vacío.)

## 5. Escenario 4 — Varias filas ofensoras: el rechazo las enumera todas

Crear un archivo con:

| Fila | Identificador de nómina | Unidad de negocio de trabajo | Unidad de negocio de nómina | Nombre del empleado | Apellido paterno del empleado |
|---:|---|---|---|---|---|
| 2 | `QA-CARGA-VARIAS-01` | `QA Carga Empresa B` | `QA Carga Empresa A` | `Carga` | `TrabajoAjeno` |
| 3 | `QA-CARGA-VARIAS-02` | `QA Carga Empresa A` | `QA Carga Empresa A` | `Carga` | `Correcta` |
| 4 | `QA-CARGA-VARIAS-03` | `QA Carga Empresa A` | `QA Carga Empresa B` | `Carga` | `NominaAjena` |

**Endpoint:** `POST /api/employees/import-excel`

**Response exacto:** `409`

```json
{
  "type": "error",
  "title": "El archivo tiene empleados de otra empresa",
  "message": "La empresa activa es «QA Carga Empresa A». Estas filas declaran otra: fila 2 («QA Carga Empresa B»), fila 4 («QA Carga Empresa B»). No se aplicó ninguna línea del archivo: sube un archivo por empresa, o cambia la empresa activa y vuelve a intentarlo.",
  "detail": "La empresa activa es «QA Carga Empresa A». Estas filas declaran otra: fila 2 («QA Carga Empresa B»), fila 4 («QA Carga Empresa B»). No se aplicó ninguna línea del archivo: sube un archivo por empresa, o cambia la empresa activa y vuelve a intentarlo.",
  "key": "archivo-de-otra-empresa",
  "code": "EMP.IMPORT.VAL_BUSINESS_UNIT",
  "data": {
    "offendingRows": [
      {
        "row": 2,
        "businessUnit": "QA Carga Empresa B",
        "payrollBusinessUnit": ""
      },
      {
        "row": 4,
        "businessUnit": "",
        "payrollBusinessUnit": "QA Carga Empresa B"
      }
    ]
  }
}
```

Lo nuevo aquí es que `data.offendingRows` trae las dos filas que deben corregirse, no solo la primera.

(Los datos son los ya explicados en el Escenario 2.)

Si el archivo tuviera más de 20 filas ofensoras, el texto del rechazo solo citaría las primeras 20 en `message`/`detail` y cerraría con «… y N filas más.» (N = resto). Este recorrido no incluye un escenario para provocarlo; está cubierto por pruebas automáticas.

## 6. Escenario 5 — Celdas de empresa vacías: se interpretan como la activa

Crear un archivo con:

| Fila | Identificador de nómina | Unidad de negocio de trabajo | Unidad de negocio de nómina | Nombre del empleado | Apellido paterno del empleado |
|---:|---|---|---|---|---|
| 2 | `QA-CARGA-VACIA-01` | | | `Carga` | `AmbasVacias` |
| 3 | `QA-CARGA-VACIA-02` | `QA Carga Empresa A` | | `Carga` | `SoloNominaVacia` |

**Endpoint:** `POST /api/employees/import-excel`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Importación completada",
  "message": "Importación exitosa: 2 empleados creados, 0 empleados actualizados.",
  "data": {
    "summary": {
      "totalRows": 2,
      "processed": 2,
      "created": 2,
      "updated": 0,
      "failed": 0,
      "skipped": 0,
      "limitReached": false
    },
    "rowErrors": [],
    "warnings": [],
    "errors": []
  }
}
```

(Los datos son los ya explicados en el Escenario 1.)

## 7. Escenario 6 — Una CURP repetida en A se omite y el resto continúa

Este escenario usa la CURP creada en la fila 2 del Escenario 1.

Crear un archivo con:

| Fila | Identificador de nómina | Unidad de negocio de trabajo | Unidad de negocio de nómina | Nombre del empleado | Apellido paterno del empleado | CURP |
|---:|---|---|---|---|---|---|
| 2 | `QA-CARGA-DUP-01` | `QA Carga Empresa A` | `QA Carga Empresa A` | `Carga` | `CurpRepetida` | `QACG000101HDFXXX01` |
| 3 | `QA-CARGA-DUP-02` | `QA Carga Empresa A` | `QA Carga Empresa A` | `Carga` | `CurpLibre` | |

**Endpoint:** `POST /api/employees/import-excel`

**Response exacto:** `200`

```json
{
  "type": "warning",
  "title": "Importación completada con advertencias",
  "message": "Se procesaron 1 empleados: 1 creados, 0 actualizados. 1 filas con error.",
  "data": {
    "summary": {
      "totalRows": 2,
      "processed": 1,
      "created": 1,
      "updated": 0,
      "failed": 1,
      "skipped": 1,
      "limitReached": false
    },
    "rowErrors": [
      {
        "row": 2,
        "message": "CURP duplicado"
      }
    ],
    "warnings": [],
    "errors": [
      "Fila 2: CURP duplicado"
    ]
  }
}
```

Qué significa lo nuevo aquí:

- `CURP duplicado`: esa fila se omitió porque la misma CURP ya pertenece a una persona activa de A; la otra fila sí se creó.

El caso del fallo al guardar un dato protegido no se puede provocar con la base sembrada y no se recorre aquí; está cubierto por pruebas automáticas. Otros fallos técnicos inesperados al guardar una fila mostrarían el mensaje genérico `No fue posible procesar esta fila` en `rowErrors`, sin detener el resto del archivo (salvo el dato protegido, que detiene todo).

Sin limpieza: este recorrido no toca ningún interruptor global.

## 8. Checklist

- [ ] Escenario 1 — Dos filas de A: `200`, ambas creadas y sin errores
- [ ] Escenario 2 — Trabajo de B: `409`, fila 3 identificada y conteo de A intacto
- [ ] Escenario 3 — Nómina de B: `409` y fila 3 identificada
- [ ] Escenario 4 — Dos filas ofensoras: `409`, filas 2 y 4 enumeradas
- [ ] Escenario 5 — Celdas de empresa vacías: `200`, ambas creadas
- [ ] Escenario 6 — CURP repetida en A: `200`, fila duplicada omitida y la otra creada
