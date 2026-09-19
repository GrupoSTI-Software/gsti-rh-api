# Prueba manual API — Alcance de empleados sin departamento

**Problema:** Quien ve a toda la plantilla de la empresa (el usuario principal, o cualquier rol con acceso total a colaboradores asignados) se topaba con que un colaborador sin departamento asignado simplemente no aparecía: ni en la lista de Empleados, ni en la lista para elegir a quién le asigna un responsable, ni entre los destinatarios de un aviso para toda la empresa. En una empresa recién creada, que todavía no tiene ningún departamento capturado, el efecto era peor: la lista de empleados salía vacía aunque la empresa sí tuviera gente contratada.

**Solución:** Ahora quien ve a toda la plantilla ve también a los colaboradores sin departamento, en los tres lugares de arriba, exactamente igual que ve a los que sí tienen uno. Un colaborador sin departamento sale con ese dato vacío (no se le inventa ningún texto). Esto no cambia nada para quien tiene acceso restringido (sigue viendo solo a sus colaboradores a cargo) y nunca mezcla colaboradores de una empresa con los de otra.

Ejemplo: es como la lista completa de alumnos de toda la escuela que revisa el director — si un alumno nuevo todavía no tiene salón asignado, el director debe seguir viéndolo en la lista general, y un aviso para "toda la escuela" le tiene que llegar a él también; el maestro de un salón en particular, en cambio, sigue viendo solo a los alumnos de SU salón, tenga o no salón asignado el alumno nuevo.

Se prueba con un cliente de API (Postman, Insomnia, Bruno). La autenticación se asume resuelta por tu cliente: se envía el token del usuario en el header `Authorization: Bearer <token>`. Este manual asume español (idioma con el que nace toda petición si el cliente no pide otro explícitamente); si tu cliente pide inglés, el `title` y el `message` de la respuesta de Empleados salen en inglés tal cual los transcribe este manual (nacen ya en inglés en el servidor, sin traducción), y los del aviso salen traducidos a ese idioma.

**URL base:** `http://127.0.0.1:3333`

**Header obligatorio en toda petición de este manual.** Además del token, cada endpoint exige el header `X-Business-Unit-Id` con el identificador público de la empresa desde la que actúa el usuario. En Preparar están las consultas para resolverlo: los usuarios A, B y C usan el de la empresa de prueba; el usuario D usa el de la empresa nueva.

**Un dato de la historia no se puede observar tal cual con un cliente de API.** La historia también pide que, en el momento en que sale un aviso programado para toda la empresa, el colaborador sin departamento esté entre quienes lo reciben. Ese envío lo dispara un proceso agendado del servidor, no una petición HTTP: no hay endpoint que lo provoque desde aquí. Lo cubre la prueba automatizada del expediente técnico; este manual no le inventa pasos.

## 1. Preparar (una sola vez)

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Deja listas tres empresas y los cuatro usuarios y nueve colaboradores de esta prueba.

| | Correo | Contraseña | Variante |
|---|---|---|---|
| **A** | `qa-alcance-principal@gsti-tests.local` | `password` | Usuario principal (acceso total) de la empresa de prueba |
| **B** | `qa-alcance-completo@gsti-tests.local` | `password` | Rol con acceso total a colaboradores asignados en Empleados, y con lectura y creación en Avisos, en la empresa de prueba |
| **C** | `qa-alcance-restringido@gsti-tests.local` | `password` | Rol con acceso restringido en Empleados (solo ve a quien tiene a cargo), en la empresa de prueba |
| **D** | `qa-alcance-nueva@gsti-tests.local` | `password` | Usuario principal de una segunda empresa, sin ningún departamento capturado |

| Código de nómina | Empresa | Estructura |
|---|---|---|
| `QA-ALC-01` | de prueba | Con departamento activo |
| `QA-ALC-02` | de prueba | Sin departamento ni puesto |
| `QA-ALC-03` | de prueba | Apunta a un departamento que fue dado de baja |
| `QA-ALC-04` | de prueba | Sin departamento; a cargo del usuario **C** |
| `QA-ALC-05` | de prueba | Sin departamento y dado de baja |
| `QA-ALC-06` | ajena (no se usa en ningún escenario de este manual) | Sin departamento |
| `QA-ALC-11`, `QA-ALC-12`, `QA-ALC-13` | nueva | Sin departamento |

Los identificadores que van en las respuestas no se inventan ni se hardcodean: resuélvelos con estas consultas.

El `id` de cada colaborador (sustituye el código de nómina de la tabla de arriba; sirve para `QA-ALC-01`, `QA-ALC-02`, `QA-ALC-04`, `QA-ALC-11`, `QA-ALC-12` y `QA-ALC-13`, los que se identifican por su fila en las respuestas de abajo):

```sql
SELECT employee_id AS id FROM employees
WHERE employee_payroll_code = 'QA-ALC-02' AND employee_deleted_at IS NULL;
```

El identificador de empresa que va en el header `X-Business-Unit-Id` de los usuarios **A**, **B** y **C** (la empresa de prueba):

```sql
SELECT business_unit_public_id FROM business_units WHERE business_unit_slug = 'qa-alcance-prueba';
```

El identificador de empresa que va en el header `X-Business-Unit-Id` del usuario **D** (la empresa nueva, sin departamentos):

```sql
SELECT business_unit_public_id FROM business_units WHERE business_unit_slug = 'qa-alcance-nueva';
```

## 2. Escenario 1 — El usuario principal ve al colaborador sin departamento junto a los demás

Usuario: **A**.

**Endpoint:** `GET /api/employees/?page=1&limit=100`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador de la empresa de prueba, resuelto en Preparar>`

**Response — 200:**

```json
{
  "type": "success",
  "title": "Employees",
  "message": "The employees were found successfully",
  "data": {
    "employees": {
      "meta": { "...": "..." },
      "data": [
        {
          "employeeId": <id de QA-ALC-01, resuelto en Preparar>,
          "employeePayrollCode": "QA-ALC-01",
          "...": "..."
        },
        {
          "employeeId": <id de QA-ALC-02, resuelto en Preparar>,
          "employeePayrollCode": "QA-ALC-02",
          "departmentId": null,
          "department": null,
          "...": "..."
        },
        {
          "employeeId": <id de QA-ALC-04, resuelto en Preparar>,
          "employeePayrollCode": "QA-ALC-04",
          "departmentId": null,
          "department": null,
          "...": "..."
        }
      ]
    }
  }
}
```

`QA-ALC-03` (apunta a un departamento dado de baja), `QA-ALC-05` (dado de baja) y `QA-ALC-06` (otra empresa) **no están en la lista** — ninguno de los tres aparece en `data.employees.data`.

Qué significa cada dato:

- `type`: qué tan bien salió la petición. Puede valer `success` (salió bien — el que se prueba en este manual), `warning` (algo no dejó completar la acción, sin ser un error del servidor; no se prueba en este manual) o `error` (falló el servidor; no se prueba en este manual).
- `title` / `message`: el encabezado y la frase de la respuesta, en el idioma de la petición.
- `data.employees`: la lista de colaboradores, con paginación. `meta` trae los datos de paginación (cuántas páginas hay, cuántos colaboradores en total); no importa a este caso.
- `data.employees.data`: el arreglo con una fila por colaborador que la búsqueda encontró.
- `employeeId`: el identificador único del colaborador.
- `employeePayrollCode`: el código de nómina con el que se identifica al colaborador en este manual.
- `departmentId` / `department`: el departamento asignado al colaborador. Cuando no tiene ninguno asignado, ambos llegan vacíos (`null`) — sin ningún texto que simule un departamento. Es justo lo que verifica este escenario con `QA-ALC-02` y `QA-ALC-04`.

## 3. Escenario 2 — El acceso total a colaboradores asignados ve lo mismo que el usuario principal

Usuario: **B**.

**Endpoint:** `GET /api/employees/?page=1&limit=100`

Headers: `Authorization: Bearer <token de B>`, `X-Business-Unit-Id: <identificador de la empresa de prueba, resuelto en Preparar>`

**Response — 200:** igual al Escenario 1, con los mismos tres colaboradores y las mismas ausencias. (Los datos son los ya explicados en el Escenario 1.)

## 4. Escenario 3 — La búsqueda sigue aplicando sobre el colaborador sin departamento

Usuario: **B**.

**Endpoint:** `GET /api/employees/?page=1&limit=100&search=QA-ALC-02`

Headers: `Authorization: Bearer <token de B>`, `X-Business-Unit-Id: <identificador de la empresa de prueba, resuelto en Preparar>`

`QA-ALC-02` es el código de nómina del colaborador de prueba. Se usa el código en vez del apellido porque la búsqueda por código hace match exacto (`UPPER(employee_payroll_code) = ?`); una búsqueda por apellido es un `LIKE` de subcadena que, en una base de datos compartida, puede coincidir por accidente con apellidos preexistentes que contengan esas mismas letras (p. ej. Granados, Mercados, Prados) y dar un falso fallo de QA.

**Response — 200:**

```json
{
  "type": "success",
  "title": "Employees",
  "message": "The employees were found successfully",
  "data": {
    "employees": {
      "meta": { "...": "..." },
      "data": [
        {
          "employeeId": <id de QA-ALC-02, resuelto en Preparar>,
          "employeePayrollCode": "QA-ALC-02",
          "departmentId": null,
          "department": null,
          "...": "..."
        }
      ]
    }
  }
}
```

Ahora repite la misma petición con una búsqueda que no le pertenece a nadie:

**Endpoint:** `GET /api/employees/?page=1&limit=100&search=NADIE-SE-LLAMA-ASI`

**Response — 200:**

```json
{
  "type": "success",
  "title": "Employees",
  "message": "The employees were found successfully",
  "data": {
    "employees": {
      "meta": { "...": "..." },
      "data": []
    }
  }
}
```

(Los datos son los ya explicados en el Escenario 1.) Qué significa lo nuevo aquí: el criterio de "sin departamento" no reemplaza a la búsqueda ni la desactiva — un colaborador sin departamento sigue apareciendo solo cuando coincide con lo que se buscó, y sigue sin aparecer cuando no coincide con nada, igual que cualquier otro colaborador.

## 5. Escenario 4 — La lista para asignar colaboradores incluye al que no tiene departamento

Usuario: **B**.

**Endpoint:** `GET /api/employees/to-assigned?page=1&limit=100`

Headers: `Authorization: Bearer <token de B>`, `X-Business-Unit-Id: <identificador de la empresa de prueba, resuelto en Preparar>`

**Response — 200:**

```json
{
  "type": "success",
  "title": "Employees",
  "message": "The employees were found successfully",
  "data": {
    "employees": {
      "meta": { "...": "..." },
      "data": [
        {
          "employeeId": <id de QA-ALC-01, resuelto en Preparar>,
          "employeePayrollCode": "QA-ALC-01",
          "...": "..."
        },
        {
          "employeeId": <id de QA-ALC-02, resuelto en Preparar>,
          "employeePayrollCode": "QA-ALC-02",
          "departmentId": null,
          "department": null,
          "...": "..."
        },
        {
          "employeeId": <id de QA-ALC-04, resuelto en Preparar>,
          "employeePayrollCode": "QA-ALC-04",
          "departmentId": null,
          "department": null,
          "...": "..."
        }
      ]
    }
  }
}
```

`QA-ALC-03`, `QA-ALC-05` y `QA-ALC-06` **no están en la lista**, igual que en el Escenario 1. (Los datos son los ya explicados en el Escenario 1: esta es la misma lista de colaboradores, ahora para elegir a quién asignarle un responsable.)

## 6. Escenario 5 — Un aviso programado para toda la empresa incluye al colaborador sin departamento

Usuario: **B**.

**Endpoint:** `POST /api/notices`

Headers: `Authorization: Bearer <token de B>`, `X-Business-Unit-Id: <identificador de la empresa de prueba, resuelto en Preparar>`

```json
{
  "noticeSubject": "Aviso para toda la plantilla",
  "noticeDescription": "<p>Mensaje de prueba</p>",
  "noticeAudience": "company",
  "noticeSendMode": "scheduled",
  "noticeScheduledAt": "2026-12-31T10:00:00.000-06:00"
}
```

**Response — 201:**

```json
{
  "type": "success",
  "title": "Aviso",
  "message": "Aviso programado exitosamente",
  "data": {
    "notice": {
      "noticeId": <número que te asigna el servidor: no se resuelve, solo úsalo para leer el resto de esta misma respuesta>,
      "noticeSubject": "Aviso para toda la plantilla",
      "noticeAudience": "company",
      "noticeType": "text",
      "noticeStatus": "scheduled",
      "recipients": [
        {
          "employeeId": <id de QA-ALC-04, resuelto en Preparar>,
          "...": "..."
        },
        {
          "employeeId": <id de QA-ALC-02, resuelto en Preparar>,
          "...": "..."
        },
        {
          "employeeId": <id de QA-ALC-01, resuelto en Preparar>,
          "...": "..."
        }
      ],
      "...": "..."
    },
    "dispatched": 0
  }
}
```

`QA-ALC-03` (departamento dado de baja) y `QA-ALC-06` (otra empresa) **no están en `recipients`**.

Qué significa cada dato:

- `noticeAudience`: a quién va dirigido el aviso. Puede valer `company` (toda la empresa — el que se prueba en este escenario), `department` (un departamento específico; esta historia no lo toca, no se prueba en este manual) o `manual` (una lista de colaboradores elegidos uno por uno; tampoco se prueba en este manual).
- `noticeSendMode` (va en la petición, no en la respuesta): qué hacer al guardar el aviso. Puede valer `scheduled` (programarlo para que salga después — el que se prueba en este escenario), `now` (enviarlo de inmediato; no se prueba en este manual), `draft` (guardarlo sin enviar; no se prueba en este manual) o `update` (guardar cambios sobre un aviso que ya salió, sin reenviarlo; no se prueba en este manual).
- `noticeStatus`: en qué momento va el aviso. Puede valer `scheduled` (ya se guardó y espera su fecha para salir — el que se prueba en este escenario), `sent` (ya salió; no se prueba en este manual) o `draft` (se guardó sin programarlo ni enviarlo; no se prueba en este manual).
- `noticeType`: qué tipo de contenido lleva el aviso. Puede valer `text` (un mensaje de texto — el que se prueba en este escenario, y el que trae un aviso si no se especifica otro), `image` (una imagen; no se prueba en este manual) o `pdf` (un documento; no se prueba en este manual).
- `recipients`: la lista de colaboradores que van a recibir el aviso. Cada fila trae el `employeeId` del colaborador.
- `dispatched`: cuántos colaboradores ya recibieron el aviso en el momento de guardar. Con un aviso programado siempre es `0`: todavía no sale, sale después, cuando llega su fecha.

## 7. Escenario 6 — El acceso restringido sigue viendo solo a su colaborador a cargo

Usuario: **C**.

**Endpoint:** `GET /api/employees/?page=1&limit=100`

Headers: `Authorization: Bearer <token de C>`, `X-Business-Unit-Id: <identificador de la empresa de prueba, resuelto en Preparar>`

**Response — 200:**

```json
{
  "type": "success",
  "title": "Employees",
  "message": "The employees were found successfully",
  "data": {
    "employees": {
      "meta": { "...": "..." },
      "data": [
        {
          "employeeId": <id de QA-ALC-04, resuelto en Preparar>,
          "employeePayrollCode": "QA-ALC-04",
          "departmentId": null,
          "department": null,
          "...": "..."
        }
      ]
    }
  }
}
```

`QA-ALC-04` es el único colaborador en la lista: no gana a ningún colaborador más por tener acceso restringido, aunque `QA-ALC-04` no tenga departamento. (Los demás datos son los ya explicados en el Escenario 1.)

## 8. Escenario 7 — En una empresa nueva, sin ningún departamento, el usuario principal ve a toda su plantilla

Usuario: **D**.

**Endpoint:** `GET /api/employees/?page=1&limit=100`

Headers: `Authorization: Bearer <token de D>`, `X-Business-Unit-Id: <identificador de la empresa nueva, resuelto en Preparar>`

**Response — 200:**

```json
{
  "type": "success",
  "title": "Employees",
  "message": "The employees were found successfully",
  "data": {
    "employees": {
      "meta": { "...": "..." },
      "data": [
        {
          "employeeId": <id de QA-ALC-11, resuelto en Preparar>,
          "employeePayrollCode": "QA-ALC-11",
          "departmentId": null,
          "department": null,
          "...": "..."
        },
        {
          "employeeId": <id de QA-ALC-12, resuelto en Preparar>,
          "employeePayrollCode": "QA-ALC-12",
          "departmentId": null,
          "department": null,
          "...": "..."
        },
        {
          "employeeId": <id de QA-ALC-13, resuelto en Preparar>,
          "employeePayrollCode": "QA-ALC-13",
          "departmentId": null,
          "department": null,
          "...": "..."
        }
      ]
    }
  }
}
```

Los tres colaboradores de la empresa nueva están en la lista — no una lista vacía, aunque esa empresa no tenga ningún departamento capturado. (Los demás datos son los ya explicados en el Escenario 1.)

## 9. Checklist

- [ ] Escenario 1: el usuario principal ve a `QA-ALC-02` (sin departamento) junto con `QA-ALC-01` y `QA-ALC-04`; `QA-ALC-03`, `QA-ALC-05` y `QA-ALC-06` no aparecen
- [ ] Escenario 2: el acceso total a colaboradores asignados ve lo mismo que el usuario principal
- [ ] Escenario 3: la búsqueda encuentra a `QA-ALC-02` por su apellido y no encuentra nada con una búsqueda que no coincide con nadie
- [ ] Escenario 4: la lista para asignar colaboradores incluye a `QA-ALC-02` y a `QA-ALC-04`
- [ ] Escenario 5: al guardar un aviso programado para toda la empresa, `QA-ALC-02` y `QA-ALC-04` están entre los destinatarios; `QA-ALC-03` y `QA-ALC-06` no
- [ ] Escenario 6: el acceso restringido solo ve a `QA-ALC-04`, su colaborador a cargo
- [ ] Escenario 7: en la empresa nueva sin departamentos, el usuario principal ve a los tres colaboradores, no una lista vacía
