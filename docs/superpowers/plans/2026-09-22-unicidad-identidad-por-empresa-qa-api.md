# Prueba manual API — El mismo trabajador en dos empresas; dentro de tu empresa no hay duplicados

**Problema:** hoy el sistema trata el RFC, la CURP y el número de seguro social como únicos en todo el mundo: si otra empresa ya registró a un trabajador, tu empresa no puede darlo de alta ni uno por uno ni por plantilla. Y cuando lo intentas, el mensaje confirma que esa persona existe en la cuenta de alguien más.

**Solución:** esos tres datos pasan a ser únicos dentro de cada empresa. Registrar a alguien que ya está en otra empresa procede sin mencionar a la otra empresa. Intentar repetirlo dentro de tu propia empresa se rechaza explicando qué dato está repetido, sin datos internos. El correo personal sigue único en todo el sistema, como siempre. Vaciar el RFC de un expediente libera ese RFC; dar de baja libera los tres.

Ejemplo: es como las listas de asistencia de dos escuelas distintas: que un alumno esté en la lista de una escuela no impide anotarlo en la otra; pero dentro de la misma escuela no puede aparecer dos veces en la lista.

Se prueba con un cliente de API (Postman, Insomnia, Bruno). La autenticación se asume resuelta por tu cliente: se envía el token del usuario en el header `Authorization: Bearer <token>`.

**URL base:** `http://127.0.0.1:3333`

## 1. Preparar (una sola vez)

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Deja listas dos empresas (A y B), un capturista en cada una, el mismo trabajador en ambas y un choque dentro de A. Volver a correr el seeder restaura lo que un escenario haya modificado.

| | Correo | Contraseña | Variante |
|---|---|---|---|
| **A** | `qa-ident-capturista-a@gsti-tests.local` | `password` | Capturista de la empresa A |
| **B** | `qa-ident-capturista-b@gsti-tests.local` | `password` | Capturista de la empresa B |

Identificadores públicos de las dos empresas, para el header `X-Business-Unit-Id`:

```sql
SELECT business_unit_slug, business_unit_public_id FROM business_units WHERE business_unit_slug IN ('qa-ident-a', 'qa-ident-b');
```

Identificadores de los expedientes sembrados:

```sql
SELECT person_id, person_lastname, business_unit_id FROM people WHERE person_second_lastname = 'Ident' AND person_lastname IN ('IdentCompartidoA', 'IdentCompartidoB', 'IdentChoqueA');
```

## 2. Escenario 1 — Alta en B de alguien que ya está en A: procede y no menciona a A

Usuario: **B**.

**Endpoint:** `POST /api/persons`

Headers: `Authorization: Bearer <token de B>`, `X-Business-Unit-Id: <identificador público de B>`

```json
{
  "personFirstname": "Compartido",
  "personLastname": "Nuevo",
  "personSecondLastname": "Ident",
  "personEmail": "qa-ident-nuevo-b@gsti-tests.local",
  "personCurp": "QAID800101HDFXXX01",
  "personRfc": "QAID800101AAA",
  "personImssNss": "12345678901"
}
```

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Persons",
  "message": "The person was created successfully",
  "data": { "person": { "personId": 123, "personFirstname": "Compartido", "...": "..." } }
}
```

El cuerpo no menciona en ningún lado que ese trabajador exista en otra empresa.

Qué significa cada dato:
- `type`: qué tan bien salió la petición. Puede valer `success` (sí se hizo lo pedido).
- `title` / `message`: el encabezado y la frase del resultado.
- `data.person.personId`: el número del expediente recién creado en tu empresa.

## 3. Escenario 2 — Repetir el RFC dentro de A: se rechaza diciendo qué dato y nada más

Usuario: **A**. El expediente `IdentCompartidoA` ya tiene el RFC del cuerpo; `IdentChoqueA` es otro expediente en la misma empresa con RFC distinto (el PUT del final intenta repetir el RFC).

**Endpoint:** `POST /api/persons`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador público de A>`

```json
{
  "personFirstname": "Choque",
  "personLastname": "Otro",
  "personSecondLastname": "Ident",
  "personEmail": "qa-ident-otro-a@gsti-tests.local",
  "personCurp": "QAID800199HDFXXX99",
  "personRfc": "QAID800101AAA",
  "personImssNss": "12999999999"
}
```

**Response exacto:** `422`

```json
{
  "title": "Este RFC ya está registrado en tu empresa",
  "detail": "Otro expediente activo de tu empresa usa este RFC; revisa el dato o da de baja el expediente que lo tiene. No se guardó ningún cambio.",
  "key": "rfc-ya-registrado-en-la-empresa",
  "code": "PERSON.IDENTITY.001"
}
```

Qué significa cada dato:
- `title`: qué pasó, en palabras del negocio.
- `detail`: qué hacer (revisar el dato o dar de baja el expediente que lo tiene) y que nada se guardó.
- `key`: la clave estable del rechazo. Puede valer `rfc-ya-registrado-en-la-empresa` (este caso), `curp-ya-registrada-en-la-empresa` o `nss-ya-registrado-en-la-empresa`.
- `code`: el código interno del catálogo. Puede valer `PERSON.IDENTITY.001` (RFC), `PERSON.IDENTITY.002` (CURP) o `PERSON.IDENTITY.003` (NSS).

Repetir editando: `PUT /api/persons/<person_id de IdentChoqueA>` con `{"personFirstname": "QA", "personLastname": "IdentChoqueA", "personRfc": "QAID800101AAA"}` responde el mismo `422` con el mismo `key`.

## 4. Escenario 3 — El correo sigue único en todo el sistema

Usuario: **B**.

**Endpoint:** `POST /api/persons` con el mismo cuerpo del Escenario 1 pero `personEmail` igual al de un expediente de A (por ejemplo `qa-ident-compartido-a@gsti-tests.local`) y RFC/CURP/NSS distintos.

**Response exacto:** `422` de validación (el mensaje del correo es de otra historia y no cambia aquí).

Qué significa: el correo personal no se aflojó con este cambio; dos empresas no pueden repetirlo. Es el punto que más atención pide en la revisión.

## 5. Escenario 4 — Vaciar el RFC lo libera

Usuario: **A**.

**Endpoint:** `PUT /api/persons/<person_id de IdentChoqueA>` con `{"personFirstname": "QA", "personLastname": "IdentChoqueA", "personRfc": ""}`

**Response exacto:** `200` o `201` de actualizado (el de edición exitosa de hoy).

Después, `POST /api/persons` en A con el RFC `QAID800101AAA` y otro correo: responde `201`. (Los datos son los ya explicados en el Escenario 1.)

Si al volver a correr el seeder el escenario deja de tener sentido, es normal: el seeder restaura el choque.

## 6. Escenario 5 — Sin empresa no hay respuesta sobre duplicados

Usuario: **A**.

**Endpoint:** `POST /api/persons` con el cuerpo del Escenario 2 pero **sin** el header `X-Business-Unit-Id`.

**Response exacto:** `400`

```json
{
  "title": "Header requerido",
  "detail": "El header x-business-unit-id es obligatorio.",
  "key": "BU.VAL.000"
}
```

Qué significa cada dato:
- `key`: puede valer `BU.VAL.000` (falta el header que dice desde qué empresa se trabaja). Lo importante: no dice si el RFC está repetido o no.

## 7. Checklist

- [ ] Escenario 1 — Alta en B de alguien de A: 201 sin mencionar a A
- [ ] Escenario 2 — Alta y edición con RFC repetido en A: 422 con `key` y `code` del dato, sin datos internos
- [ ] Escenario 3 — Mismo correo en A y B: se rechaza (unicidad global intacta)
- [ ] Escenario 4 — RFC vaciado en A se reutiliza en A: 201
- [ ] Escenario 5 — Sin header: 400 sin veredicto sobre el duplicado
