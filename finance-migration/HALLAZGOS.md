# Validación del motor de comisiones vs Sheet "MKA - Finanzas y Costos"

Fecha: 2026-06-14 · Fase 1 (el corazón).

## Qué se hizo
1. Web app read-only (`finanzas-export.gs`) para leer fórmulas + datos del Sheet por HTTP.
2. Se extrajeron las **fórmulas exactas** de Ingresos (V, W, X, Y, Z, AA, AC, F) y el mapeo
   de Acuerdos (P..AA = los %).
3. Motor determinístico en JS (`engine.mjs`) que replica esa lógica.
4. Golden test (`golden.mjs`) y reporte de impacto (`report.mjs`) sobre **600 ingresos reales**.

## Lógica confirmada del motor
- **Base de todo reparto = E** (neto post-fees), nunca C/D.
- **Tipo efectivo V**: SETUP/PUBLICIDAD pasan directo; el resto compara el **acumulado**
  del cliente (Σ E no-publicidad, inclusivo) contra el **umbral base** (Acuerdos Z):
  umbral < acumulado → CRM, si no SETUP. Es acumulativo / orden-dependiente.
- **% por (cliente × tipo × rol)** salen de Acuerdos: P SETUP-Conector, Q CRM-Conector,
  R CRM-Cliente, S CRM-Afiliado, U CRM-Consultor, V CRM-Marketing, AA Publi-Conector,
  X Publi-Consultor, Y Publi-Marketing.
- **Consultor/Marketing** solo cobran si fecha de venta ≥ fecha de inicio (bloque izquierdo
  de Acuerdos por nombre+cliente+categoría).
- **F (ingreso real Korex)**: Publicidad → (E − comisiones publi) × 15% ; resto → E − Σ comisiones.

## Resultado
Columnas "limpias" motor vs Sheet: **W (Cliente), Z (Consultor), AA (Marketing) = 100%**;
X (Conector) 598/600.

**62 filas difieren**, impacto neto **+US$807.68** a favor de Korex:

| Motivo | Filas | Δ Korex |
|---|---|---|
| Sheet contó el **afiliado DOBLE** (Y y AC a la vez) | 14 | **+US$1.304,63** |
| Filas de Publicidad (Mónica) con redondeo sub-dólar | ~45 | ≈ −US$14 |
| Fila 399 (Marta Torrico): Sheet **no pagó al conector** | 1 | −US$346,86 |
| Sheet **no reservó** el afiliado (AC) | 2 | −US$135,97 |
| Jose Piquer 556/564: reparto borrado → recalculado | 2 | (normal) |

## Regla CORRECTA acordada con Mati (la que usa el motor)
- **Afiliado sin asignar**: ese % **no es de Korex**; se **reserva** en el fondo de comisiones
  de Mercury del cliente (para un futuro conector o para el cliente). Se descuenta **una vez**.
- **Con afiliado**: se le paga a esa persona (una vez).
- **Nunca doble**: `Y` (pagado) y `AC` (reservado) son mutuamente excluyentes.
- Jose Piquer 556/564: recalcular como ingreso normal.

## Pendiente de confirmar (no bloqueante)
- Fila 399 Marta Torrico: el conector tiene 20% de SETUP en el acuerdo; el Sheet no lo pagó.
  El motor sí. Confirmar que el conector debía cobrar esa venta.
- Redondeo: definir si las comisiones se redondean a 2 decimales (cierra los ~US$14 de publicidad).
