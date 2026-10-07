# Prueba manual — Configurar por empresa la compensación y la revalidación del teletrabajo

**Estado: entregado el 7 de octubre de 2026. Lo recorre una persona; quien lo escribió no lo caminó.**

**Problema:** antes, cada adenda de teletrabajo se llenaba a mano y cada persona de Recursos Humanos ponía el monto que recordaba, así que la misma empresa terminaba pagando cantidades distintas por un trabajo parecido. Tampoco había un solo lugar para acordar de una vez cuánto se propone por luz, internet y equipo propio, ni cada cuánto hay que volver a revisar el lugar de trabajo en casa.

**Solución:** una pantalla nueva, **por empresa**, donde se define una sola vez esa compensación por defecto y los plazos de revalidación y de aviso. Mientras la empresa no guarde nada, rigen los **valores del sistema** (revalidar cada 12 meses, avisar 30 días antes y sin montos propuestos).

Ejemplo: es como en una tienda con varias cajas: si cada cajero decide cuánto cobrar por la bolsa, el mismo cliente paga distinto según quién lo atienda. Poner el precio una sola vez, en un lugar acordado por cada tienda, evita que cada quien lo invente.

## Glosario

- **Adenda de teletrabajo:** el documento que se agrega al contrato de una persona para acordar el trabajo desde casa y lo que la empresa le compensa.
- **Compensación por defecto:** los montos mensuales que la empresa propone de entrada por luz, internet y cuota por usar equipo propio; después se pueden ajustar persona por persona.
- **Revalidación:** cada cuántos meses se vuelve a revisar que el lugar de trabajo en casa sigue siendo adecuado.
- **Aviso antes del vencimiento:** cuántos días antes se avisa que se acerca la fecha de revalidar.

## 1. Preparar

Prerrequisito: esta rama del API y la del backoffice están levantadas, y la base ya trae el módulo **Ajustes de teletrabajo** en el menú.

Este manual se entrega para que una persona lo recorra en el navegador; el agente que lo escribió no lo camina.

Aviso: el archivo que siembra los datos es temporal y **no está versionado** en el repositorio, así que hay que tenerlo presente al armar el ambiente.

Ejecuta una vez el sembrador de QA compartido:

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Qué deja listo para esta prueba (todo con la marca `QA Teletrabajo` en el nombre, para reconocerlo entre los datos de otras historias):

- **QA Teletrabajo Empresa**: la empresa que se configura **durante** este recorrido. Arranca sin nada guardado, así que muestra los valores del sistema hasta que el primer escenario la configure.
- **QA Teletrabajo Empresa Dos**: otra empresa **del mismo grupo** (grupo `QA Teletrabajo Grupo`), también sin ajustes guardados. Sirve para comprobar que lo que se guarda en la primera no se cuela en la segunda.
- Tres cuentas de Recursos Humanos, todas con acceso a las **dos** empresas: una con permiso completo, una que solo consulta y una sin acceso a los ajustes (ver la tabla).

El sembrador es el mismo que usan otras historias y trae también sus datos. Volver a correr el comando **borra los ajustes de las dos empresas QA Teletrabajo** y deja todo otra vez como al inicio.

## 2. Usuarios

Todas las cuentas tienen la contraseña `password`.

| | Correo | Contraseña | Qué es |
|---|---|---|---|
| **A** | `qa-teletrabajo-full@gsti-tests.local` | `password` | Recursos Humanos **con permiso completo**; con esta cuenta se captura y se guarda |
| **B** | `qa-teletrabajo-lector@gsti-tests.local` | `password` | Recursos Humanos que **solo puede consultar** (no edita ni guarda) |
| **C** | `qa-teletrabajo-none@gsti-tests.local` | `password` | Recursos Humanos **sin acceso** a los ajustes de teletrabajo |

Estado inicial y orden del recorrido: las **dos** empresas arrancan **sin ajustes**. El Escenario 4.3 consume ese estado (deja la empresa **QA Teletrabajo Empresa** configurada), así que hay que recorrer los escenarios **en orden**: primero los de la empresa sin configurar (4.1 y 4.2) y después los que ya la dan por configurada.

## 3. Dónde probar

Menú lateral, grupo **Ajustes y configuración** → opción **Ajustes de teletrabajo**.

URL directa de la pantalla: `http://127.0.0.1:3000/telework-settings` (la dirección **no** lleva `/es`).

Para entrar: en `http://127.0.0.1:3000`, botón **Continuar con contraseña**, llena **Correo electrónico** y **Contraseña** con el usuario que toque, botón **Entrar**.

Para cambiar de empresa: arriba a la derecha abre **Mi cuenta** (el avatar) y en el campo **Empresa** elige la que quieras. La pantalla recarga sola los ajustes de la empresa elegida.

## 4. Usuario A (positivo)

Con `qa-teletrabajo-full@gsti-tests.local`: puede consultar y editar.

### 4.1 Una empresa que nunca ha guardado ajustes arranca con los valores del sistema

Objetivo: comprobar que una empresa sin nada guardado muestra el chip **Valores del sistema**, la periodicidad de 12 meses, el aviso de 30 días y los tres montos vacíos.

1. Entra con el Usuario A y elige la empresa **QA Teletrabajo Empresa** (Mi cuenta → Empresa).
2. Abre **Ajustes y configuración → Ajustes de teletrabajo**.
3. El encabezado de la tarjeta muestra el chip **Valores del sistema**.
4. En el grupo **Compensación por defecto (MXN al mes)**, los campos **Luz**, **Internet** y **Cuota por uso de equipo propio** están **vacíos**.
5. En el grupo **Lista de verificación**, **Revalidar cada** trae **12** con la palabra **meses**, y **Avisar antes del vencimiento** trae **30** con la palabra **días**.
6. No aparece ninguna línea que empiece con **Última modificación**.

### 4.2 Abrir la pantalla no guarda nada

Objetivo: comprobar que solo abrir y mirar la pantalla no deja a la empresa como configurada.

1. Con la misma empresa y el Usuario A, sin tocar ningún campo, recarga la pantalla con F5 un par de veces y abre otra sección del menú y vuelve.
2. El chip sigue en **Valores del sistema**.
3. No aparece la línea **Última modificación**.

### 4.3 Guardar los montos y plazos acordados

Objetivo: comprobar que al capturar y guardar los datos acordados se confirma el guardado, la empresa pasa a estar configurada y queda registrado quién la modificó y cuándo.

1. Con el Usuario A en **QA Teletrabajo Empresa**, captura en **Compensación por defecto (MXN al mes)**: **Luz** `350.00`, **Internet** `500.00`, **Cuota por uso de equipo propio** `250.00`.
2. En **Lista de verificación**: **Revalidar cada** `6` (**meses**) y **Avisar antes del vencimiento** `15` (**días**).
3. Pulsa **Guardar**.
4. Aparece un aviso de éxito con el resumen **Ajustes de teletrabajo** y el detalle **Ajustes guardados**.
5. El chip cambia a **Configurada**.
6. Aparece una línea que dice **Última modificación por Verónica Aguilar Ponce el …** con la fecha y hora del momento (Verónica Aguilar Ponce es la persona del Usuario A).

### 4.4 Al volver a entrar siguen los mismos valores

Objetivo: comprobar que los ajustes guardados se conservan al salir de la pantalla y volver a entrar.

1. Con **QA Teletrabajo Empresa**, cambia a otra sección del menú y regresa a **Ajustes de teletrabajo** (o recarga con F5).
2. El chip sigue en **Configurada**.
3. Los valores siguen en **350.00**, **500.00**, **250.00**, **6** meses y **15** días.
4. Sigue apareciendo la línea **Última modificación …**.

### 4.5 La otra empresa del mismo grupo no hereda lo guardado

Objetivo: comprobar que una segunda empresa del mismo grupo mantiene sus propios valores (o los del sistema) y nunca los de la primera.

1. Con el Usuario A, cambia a la empresa **QA Teletrabajo Empresa Dos** (Mi cuenta → Empresa).
2. Abre **Ajustes y configuración → Ajustes de teletrabajo**.
3. El chip dice **Valores del sistema**, **Revalidar cada** trae **12** meses, **Avisar antes del vencimiento** trae **30** días y los tres montos están **vacíos**.
4. **Negativo a comprobar a propósito:** en ningún campo de esta empresa aparecen los **350.00**, **500.00** ni **250.00** que se guardaron en la otra.
5. Vuelve a **QA Teletrabajo Empresa**: sigue **Configurada**, con sus valores intactos. Cambiar de una empresa a otra no altera a ninguna.

### 4.6 Un monto que no cumple se señala bajo el campo del monto

Objetivo: comprobar que un monto que se sale del máximo permitido se rechaza con el mensaje bajo el campo del monto, sin perder lo demás capturado.

1. Con el Usuario A en **QA Teletrabajo Empresa**, deja los montos y plazos como quedaron en el Escenario 4.3.
2. En **Cuota por uso de equipo propio** escribe un monto por arriba del máximo, por ejemplo `100000000` (cien millones). El campo **no deja escribir un monto negativo**, por eso se usa uno demasiado grande.
3. Pulsa **Guardar**.
4. Justo **debajo del campo Cuota por uso de equipo propio** aparece el mensaje **Los montos deben ser mayores o iguales a cero, con dos decimales como máximo, y no mayores a 99999999.99.**
5. Lo capturado no se pierde: sigue viéndose **350.00** en Luz, **500.00** en Internet, **6** meses y **15** días.
6. Deja de nuevo **250.00** en ese campo y guarda: el aviso vuelve a ser **Ajustes guardados**.

### 4.7 Una periodicidad que no es un número entero de meses se señala bajo su campo

Objetivo: comprobar que una periodicidad que no es un número entero de meses se rechaza con el mensaje bajo su campo, sin perder lo capturado.

1. Con el Usuario A en **QA Teletrabajo Empresa**, en **Revalidar cada** escribe `6.5`. (El campo ajusta solo los valores fuera de 1 a 12, así que no deja teclear ni 0 ni 13; por eso se usa un número con decimales.)
2. Pulsa **Guardar**.
3. Justo **debajo del campo Revalidar cada** aparece el mensaje **La periodicidad de revalidación debe ser un número entero de meses entre 1 y 12.**
4. Lo capturado no se pierde: los montos y el aviso siguen como estaban.
5. Regresa **Revalidar cada** a `6` y guarda: el aviso vuelve a ser **Ajustes guardados**.

### 4.8 Un aviso que no cabe en la periodicidad se señala bajo su campo

Objetivo: comprobar que un aviso más largo de lo que permite la periodicidad se rechaza con el mensaje bajo su campo, sin perder lo capturado.

1. Con el Usuario A en **QA Teletrabajo Empresa**, deja **Revalidar cada** en `6` meses.
2. En **Avisar antes del vencimiento** escribe `200`.
3. Pulsa **Guardar**.
4. Justo **debajo del campo Avisar antes del vencimiento** aparece el mensaje **La ventana de aviso debe ser un número entero de días, mayor o igual a 1 y menor que los meses de periodicidad multiplicados por 30.**
5. Lo capturado no se pierde: los montos y los 6 meses siguen como estaban.
6. Regresa **Avisar antes del vencimiento** a `15` y guarda: el aviso vuelve a ser **Ajustes guardados**.

### 4.9 En una pantalla de teléfono (375 px) el formulario se sigue leyendo

Objetivo: comprobar que en una pantalla angosta los campos y el botón de guardar se ven y se pueden usar sin desbordarse.

1. Estrecha la ventana del navegador hasta unos 375 px de ancho, o usa el modo móvil.
2. Los dos grupos (**Compensación por defecto** y **Lista de verificación**) se apilan en una sola columna, sin salirse de la pantalla.
3. La barra del título con el chip **Configurada** y el botón **Guardar** se siguen viendo completos.
4. Los campos se tocan y se escriben sin que nada quede cortado ni encimado.

## 5. Usuario B (negativo): solo consulta y sin acceso

Los dos escenarios siguientes son negativos: comprueban que quien no puede editar no edita y que quien no tiene acceso ni siquiera encuentra la pantalla.

### 5.1 Con permiso solo de consulta, los campos son de solo lectura y no hay botón de guardar

Objetivo: comprobar que quien solo puede consultar ve los ajustes de la empresa, pero no los puede editar ni guardar.

1. Cierra la sesión y entra con el **Usuario B** (`qa-teletrabajo-lector@gsti-tests.local`).
2. Elige la empresa **QA Teletrabajo Empresa** y abre **Ajustes y configuración → Ajustes de teletrabajo**.
3. Se ve la pantalla de ajustes de esa empresa, con los mismos valores que dejó el Escenario 4.3.
4. **Negativo a comprobar a propósito:** los campos están en gris y no se pueden escribir, y **no aparece el botón Guardar**.
5. **Negativo a comprobar a propósito:** no hay ningún botón, enlace ni menú dentro de la pantalla para guardar cambios.

### 5.2 Sin acceso, no aparece la entrada de menú y la dirección muestra "No tienes acceso"

Objetivo: comprobar que quien no tiene permiso no encuentra la entrada en el menú y, entrando a la dirección a mano, recibe el aviso de que no tiene acceso.

1. Cierra la sesión y entra con el **Usuario C** (`qa-teletrabajo-none@gsti-tests.local`).
2. Abre el grupo **Ajustes y configuración** del menú lateral.
3. **Negativo a comprobar a propósito:** dentro del grupo **no está** la opción **Ajustes de teletrabajo**.
4. En la barra de direcciones escribe `http://127.0.0.1:3000/telework-settings` y pulsa Enter.
5. La pantalla muestra el aviso **No tienes acceso** (y no los campos de ajustes).

## 6. Checklist

Cada casilla se marca contra el objetivo de su escenario, no contra "se hicieron los pasos":

- [ ] 4.1 Empresa sin ajustes: chip **Valores del sistema**, 12 meses, 30 días y montos vacíos
- [ ] 4.2 Abrir la pantalla no la deja configurada ni deja línea de última modificación
- [ ] 4.3 Guardar deja el aviso **Ajustes guardados**, el chip **Configurada** y la línea de última modificación
- [ ] 4.4 Al volver a entrar siguen los mismos valores y el chip **Configurada**
- [ ] 4.5 La otra empresa del mismo grupo no hereda lo guardado en la primera
- [ ] 4.6 Un monto fuera del máximo se señala bajo el campo del monto sin perder lo capturado
- [ ] 4.7 Una periodicidad que no es un entero de meses se señala bajo su campo sin perder lo capturado
- [ ] 4.8 Un aviso de 200 días con periodicidad de 6 meses se señala bajo su campo sin perder lo capturado
- [ ] 4.9 En 375 px los campos y el botón Guardar se ven y se usan sin desbordarse
- [ ] 5.1 Con solo consulta los campos son de solo lectura y no hay botón Guardar
- [ ] 5.2 Sin acceso no aparece la opción de menú y la dirección muestra **No tienes acceso**

## 7. Lo que no se revisa con esta base

- **Lo que solo se provoca por HTTP.** No se puede pulsar un botón para provocar una **petición sin sesión** (respuesta 401), una **petición sin el permiso** (respuesta 403 del servidor con su código de error: en pantalla eso se ve como **No tienes acceso**, pero el rechazo del servidor solo se ve por HTTP), una **petición sin el identificador de empresa**, el **aislamiento cuando en el cuerpo de la petición se manda el identificador de otra empresa** ni **dos guardados simultáneos** (carrera de alta). Todo eso lo cubren las pruebas del API, no esta pantalla.
- **Un monto negativo y una periodicidad de 0 o de 13.** Los campos numéricos no permiten teclearlos: no dejan escribir un signo menos y, al salir del campo, ajustan solos lo que quede fuera de 1 a 12. El mensaje bajo el campo sí se comprueba con un monto por encima del máximo (Escenario 4.6) y con una periodicidad con decimales (Escenario 4.7), que producen el mismo aviso.
- **El consumo de estos valores.** La adenda de teletrabajo, la lista de verificación y las alertas que usarían esta compensación y estos plazos todavía no existen como pantallas, así que no hay dónde comprobar que se apliquen aquí.
