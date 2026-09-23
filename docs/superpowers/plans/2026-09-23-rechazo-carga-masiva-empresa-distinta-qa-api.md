# Prueba manual API — Rechazo de carga masiva por empresa distinta

**Problema:** un archivo de empleados podía mezclar empresas y cargarse entero en la empresa activa sin avisar que algunas filas declaraban otra empresa.

**Solución:** si una fila declara una empresa de trabajo o de nómina distinta de la activa, se rechaza el archivo completo antes de crear o modificar a alguien. La respuesta explica el motivo y enumera todas las filas que deben corregirse.

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

Descargar la plantilla real con los headers anteriores. Para cada fila llenar estas cinco columnas obligatorias:

- `Identificador de nómina`
- `Unidad de negocio de trabajo`
- `Unidad de negocio de nómina`
- `Nombre del empleado`
- `Apellido paterno del empleado`

En las dos columnas de empresa escribir exactamente `QA Carga Empresa A` o `QA Carga Empresa B`. El Escenario 1 también llena `CURP` en una fila para preparar el duplicado propio del Escenario 5.

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

**Response exacto:** `422`

```json
{
  "type": "error",
  "title": "El archivo declara otra empresa",
  "message": "El archivo declara una empresa distinta de la activa en 1 fila(s): Fila 3 (trabajo «QA Carga Empresa B», nómina «QA Carga Empresa A»). No se procesó ninguna fila: corrige las empresas del archivo y vuelve a subirlo.",
  "detail": "El archivo declara una empresa distinta de la activa en 1 fila(s): Fila 3 (trabajo «QA Carga Empresa B», nómina «QA Carga Empresa A»). No se procesó ninguna fila: corrige las empresas del archivo y vuelve a subirlo.",
  "key": "empresa-distinta-en-archivo",
  "code": "EMP.IMPORT.VAL_COMPANY",
  "data": {
    "offendingRows": [
      {
        "row": 3,
        "businessUnit": "QA Carga Empresa B",
        "payrollBusinessUnit": "QA Carga Empresa A"
      }
    ]
  }
}
```

Qué significa cada dato nuevo:

- `detail`: explicación completa del rechazo y la acción para corregirlo; coincide con `message`.
- `key`: clave estable del rechazo; `empresa-distinta-en-archivo` significa que al menos una fila declara una empresa diferente de la activa.
- `code`: código estable del catálogo; `EMP.IMPORT.VAL_COMPANY` identifica el rechazo por empresa.
- `data.offendingRows`: todas las filas que deben corregirse.
- `row`: número de la fila en el Excel.
- `businessUnit`: empresa de trabajo escrita en esa fila.
- `payrollBusinessUnit`: empresa de nómina escrita en esa fila.

## 4. Escenario 3 — Una fila declara otra empresa de nómina

Crear un archivo con:

| Fila | Identificador de nómina | Unidad de negocio de trabajo | Unidad de negocio de nómina | Nombre del empleado | Apellido paterno del empleado |
|---:|---|---|---|---|---|
| 2 | `QA-CARGA-NOMINA-01` | `QA Carga Empresa A` | `QA Carga Empresa A` | `Carga` | `NominaCorrecta` |
| 3 | `QA-CARGA-NOMINA-02` | `QA Carga Empresa A` | `QA Carga Empresa B` | `Carga` | `NominaAjena` |

**Endpoint:** `POST /api/employees/import-excel`

**Response exacto:** `422`

```json
{
  "type": "error",
  "title": "El archivo declara otra empresa",
  "message": "El archivo declara una empresa distinta de la activa en 1 fila(s): Fila 3 (trabajo «QA Carga Empresa A», nómina «QA Carga Empresa B»). No se procesó ninguna fila: corrige las empresas del archivo y vuelve a subirlo.",
  "detail": "El archivo declara una empresa distinta de la activa en 1 fila(s): Fila 3 (trabajo «QA Carga Empresa A», nómina «QA Carga Empresa B»). No se procesó ninguna fila: corrige las empresas del archivo y vuelve a subirlo.",
  "key": "empresa-distinta-en-archivo",
  "code": "EMP.IMPORT.VAL_COMPANY",
  "data": {
    "offendingRows": [
      {
        "row": 3,
        "businessUnit": "QA Carga Empresa A",
        "payrollBusinessUnit": "QA Carga Empresa B"
      }
    ]
  }
}
```

(Los datos son los ya explicados en los Escenarios 1 y 2.)

## 5. Escenario 4 — Varias filas ofensoras: el rechazo las enumera todas

Crear un archivo con:

| Fila | Identificador de nómina | Unidad de negocio de trabajo | Unidad de negocio de nómina | Nombre del empleado | Apellido paterno del empleado |
|---:|---|---|---|---|---|
| 2 | `QA-CARGA-VARIAS-01` | `QA Carga Empresa B` | `QA Carga Empresa A` | `Carga` | `TrabajoAjeno` |
| 3 | `QA-CARGA-VARIAS-02` | `QA Carga Empresa A` | `QA Carga Empresa A` | `Carga` | `Correcta` |
| 4 | `QA-CARGA-VARIAS-03` | `QA Carga Empresa A` | `QA Carga Empresa B` | `Carga` | `NominaAjena` |

**Endpoint:** `POST /api/employees/import-excel`

**Response exacto:** `422`

```json
{
  "type": "error",
  "title": "El archivo declara otra empresa",
  "message": "El archivo declara una empresa distinta de la activa en 2 fila(s): Fila 2 (trabajo «QA Carga Empresa B», nómina «QA Carga Empresa A»); Fila 4 (trabajo «QA Carga Empresa A», nómina «QA Carga Empresa B»). No se procesó ninguna fila: corrige las empresas del archivo y vuelve a subirlo.",
  "detail": "El archivo declara una empresa distinta de la activa en 2 fila(s): Fila 2 (trabajo «QA Carga Empresa B», nómina «QA Carga Empresa A»); Fila 4 (trabajo «QA Carga Empresa A», nómina «QA Carga Empresa B»). No se procesó ninguna fila: corrige las empresas del archivo y vuelve a subirlo.",
  "key": "empresa-distinta-en-archivo",
  "code": "EMP.IMPORT.VAL_COMPANY",
  "data": {
    "offendingRows": [
      {
        "row": 2,
        "businessUnit": "QA Carga Empresa B",
        "payrollBusinessUnit": "QA Carga Empresa A"
      },
      {
        "row": 4,
        "businessUnit": "QA Carga Empresa A",
        "payrollBusinessUnit": "QA Carga Empresa B"
      }
    ]
  }
}
```

Lo nuevo aquí es que `data.offendingRows` trae las dos filas que deben corregirse, no solo la primera.

(Los datos son los ya explicados en el Escenario 2.)

## 6. Escenario 5 — Una CURP repetida en A se omite y el resto continúa

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

El caso del fallo al guardar un dato protegido no se puede provocar con la base sembrada y no se recorre aquí; está cubierto por pruebas automáticas.

Sin limpieza: este recorrido no toca ningún interruptor global.

## 7. Checklist

- [ ] Escenario 1 — Dos filas de A: `200`, ambas creadas y sin errores
- [ ] Escenario 2 — Trabajo de B: `422`, fila 3 identificada y conteo de A intacto
- [ ] Escenario 3 — Nómina de B: `422` y fila 3 identificada
- [ ] Escenario 4 — Dos filas ofensoras: `422`, filas 2 y 4 enumeradas
- [ ] Escenario 5 — CURP repetida en A: `200`, fila duplicada omitida y la otra creada
