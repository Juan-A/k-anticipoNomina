# Anticipos de paga extra

Calculadora para saber cuánto puedes pedir de anticipo de la paga extra y llevar un registro de lo que ya has pedido.

**Web:** https://juan-a.github.io/k-anticipoNomina/

## Cómo calcula

- La paga extra equivale al sueldo de referencia mensual y se devenga a razón de 1/6 por mes.
- Se puede anticipar hasta el 80% de lo devengado. El 20% restante se cobra con la paga.
- Hay dos semestres: enero–junio (paga de julio) y julio–diciembre (paga de diciembre).
- Lo que se pide de lunes a jueves se cobra el viernes de esa semana; lo que se pide de viernes a domingo, el viernes siguiente.
- En julio y diciembre no tiene sentido pedir anticipo, porque ese mes ya se cobra la paga.

## Datos

El sueldo de referencia se puede escribir a mano o sacar de la nómina en PDF: la app busca la línea «Sueldo Mensual» o «Reference Salary». El PDF se lee en el navegador con [pdf.js](https://mozilla.github.io/pdf.js/) (que se descarga de cdnjs solo al elegir un archivo) y no se envía a ningún sitio ni se guarda.

Todo se guarda en el `localStorage` del navegador. Desde la sección _Copia de seguridad_ se puede descargar un `.json`, volver a importarlo o enviarlo por correo.

## Desarrollo

Son tres archivos estáticos (`index.html`, `styles.css` y `app.js`) sin dependencias ni paso de compilación. Para probarlo en local:

```bash
python3 -m http.server
```

y abrir http://localhost:8000.

> Si cambias el formato de los datos o la clave `anticipos-paga-extra-v1`, los usuarios perderán lo que tengan guardado.
