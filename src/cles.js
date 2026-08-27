/* ------------------------------------------------------------------ *
 * Dictionnaire de cles Mifare Classic                                  *
 * ------------------------------------------------------------------ *
 * Pour lire un secteur, il faut sa cle (A ou B). En pratique, la tres
 * grande majorite des badges d'immeuble utilisent des cles CONNUES : soit
 * la cle par defaut du fabricant, soit une cle publiee dans les outils
 * courants. Les installateurs les changent rarement.
 *
 * On essaie donc d'abord ce dictionnaire, secteur par secteur. C'est
 * l'attaque qui reussit sur le plus grand nombre de badges reels, et elle
 * ne demande aucun calcul lourd — juste des essais d'authentification que
 * le lecteur ACR122U sait faire directement.
 *
 * Quand aucune cle du dictionnaire ne marche (badge « durci »), il faut un
 * outil de calcul separe (mfoc / hardnested) et le lecteur ne suffit plus
 * seul. Le programme le signale clairement plutot que d'echouer sans mot.
 */
'use strict';

/* Cles ecrites en hexadecimal (6 octets). Les plus probables en tete :
   l'ordre compte, on s'arrete a la premiere qui marche. */
const DICTIONNAIRE = [
  'FFFFFFFFFFFF', // usine, de tres loin la plus frequente
  'A0A1A2A3A4A5', // cle par defaut MAD (secteur 0)
  'D3F7D3F7D3F7', // NDEF public
  '000000000000',
  'B0B1B2B3B4B5',
  '4D3A99C351DD',
  '1A982C7E459A',
  'AABBCCDDEEFF',
  '714C5C886E97',
  '587EE5F9350F',
  'A0478CC39091',
  '533CB6C723F6',
  '8FD0A4F256E9',
  /* Cles rencontrees sur des controles d'acces francais courants. */
  '484558414354', // "HEXACT" en ASCII
  '4A6F686E6E79',
  '000000000001',
  'A64598A77478',
  '26940B21FF5D',
  '5C598C9C58B5',
];

/* Deux valeurs remarquables reutilisees ailleurs dans le code. */
const CLE_USINE = 'FFFFFFFFFFFF';

function normalise(cle) {
  const h = String(cle || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  return h.length === 12 ? h : null;
}

/* Le dictionnaire de travail = celui d'origine, plus d'eventuelles cles
   fournies par l'utilisateur, sans doublon et en gardant l'ordre. */
function dictionnaire(supplement = []) {
  const vues = new Set();
  const out = [];
  for (const c of [...DICTIONNAIRE, ...supplement]) {
    const n = normalise(c);
    if (n && !vues.has(n)) { vues.add(n); out.push(n); }
  }
  return out;
}

module.exports = { DICTIONNAIRE, CLE_USINE, normalise, dictionnaire };
