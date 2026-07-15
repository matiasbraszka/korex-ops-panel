/**
 * korex-clientes.mjs — nombre del cliente (como figura en los .docx del corpus) -> client_id.
 *
 * Los .docx traen el nombre escrito a mano; la DB indexa por client_id. Este mapa es el puente.
 * Los 23 ids estan verificados contra la tabla clients.
 *
 * vsl-corpus-load.mjs tiene su propia copia inline: no se toco para no mover lo que ya funciona.
 * Si se vuelve a cargar el corpus de VSL, conviene que pase a importar de aca.
 */
export const CLIENTES = {
  "Alex Quintero": "c_1775304975528_zdaci5",
  "Antonio De la Cruz": "c_1777477572874_hdkcr7",
  "Belen Griner": "c_1776436674635_goq5cn",
  Castor: "c_1781537622066_9et1pr",
  "Corina Grosu": "c_1775304975528_ql5c26",
  "Daniela Mermeria": "c_1775304975528_fpi5bq",
  "Fabiana Carrasco": "c_1781546055319_vuvnw2",
  "Gabi Espino": "c_1775304975528_1gst8e",
  "Jacquie Marquez": "c_1775304975528_ci40ns",
  Janeyling: "c_1775304975528_c8vt0z",
  "Jose Luis Rivas": "c_1775304975528_mi1b8c",
  "Jose Luis Rodriguez": "c_1775304975528_n5jun4",
  "Jose Piquer": "c_1777295204760_okc43e",
  "Kate Baltodano": "c_1775304975528_8f1wt0",
  "Marta Torrico": "c_1775304975528_pe11ka",
  "Melany Mille": "c_1775304975528_01fr6y",
  "Monica Vozmediano": "c_1775304975528_vljqub",
  "Oscar Palayo": "c_1775304975528_zja4si",
  "Oscar Rubio": "c_1777146957573_wjlx3y",
  Priscila: "c_1775304975528_i7wpl7",
  "Sergio Aldazabal": "c_1780874493120_19fbxk",
  "Sergio Canovas": "c_1775304975528_pzu8sk",
  "Summit Network": "c_1775304975528_z5uiq7",
};
