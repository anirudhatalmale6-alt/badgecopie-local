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
   l'ordre compte, on s'arrete a la premiere qui marche. La liste reprend les
   cles publiques bien connues (celles des outils courants type mfoc /
   Proxmark) : ce sont elles qui ouvrent la grande majorite des badges reels
   dont l'installateur n'a pas change les cles d'usine. */
const DICTIONNAIRE = [
  'FFFFFFFFFFFF', // usine, de tres loin la plus frequente
  'A0A1A2A3A4A5', // cle par defaut MAD (secteur 0)
  'D3F7D3F7D3F7', // NDEF public
  '000000000000',
  'B0B1B2B3B4B5',
  'C0C1C2C3C4C5',
  'D0D1D2D3D4D5',
  'AABBCCDDEEFF',
  '4D3A99C351DD',
  '1A982C7E459A',
  '714C5C886E97',
  '587EE5F9350F',
  'A0478CC39091',
  '533CB6C723F6',
  '8FD0A4F256E9',
  '0000014B5C31',
  'B578F38A5C61',
  '96A301BCE267',
  '5C8FF9990DA2',
  '7F33625BC129',
  'F1D83F964314',
  '463F2DED84BD',
  '3F7548E85DAB',
  '8829DA9DAF76',
  '509693C36BD3',
  '9DDC43F4A1B3',
  /* Cles rencontrees sur des controles d'acces francais courants. */
  '484558414354', // "HEXACT" en ASCII
  '4A6F686E6E79',
  '000000000001',
  'A64598A77478',
  '26940B21FF5D',
  '5C598C9C58B5',
  '112233445566',
  '2A2C13CC242A',
  'AA0720018738',
  'A0A1A2A3A4A6',
  '000000000002',
  '44AB09010845',
  '85FED980EA5A',
  /* Transports, parkings, hotels : jeux de cles publies. */
  'D3F7D3F7D3F8',
  '714C5C886E98',
  'BD493A3962B6',
  '010203040506',
  '123456789ABC',
  'CB779C50DF6D',
  '4B0B20107CCB',
  '00000FFE2488',
  '5EF8E9C31611',
  '3E65E4FB65B3',
  '167AC0C9163F',
  'B27CCAB30DBD',
  '0DB5E6523F7C',
  '5C3B79B7A4B0',
  '31BEC3D9E510',
  '6EA0FCE17BD0',
  '2A82D3C61C0F',
  '00434745B0FD',
  '00000000000A',
  '00000000000B',
  'FC00018778F7',
  '0297927C0F77',
  'EE0042F88840',
  '722BFCC5375F',
  'F1A97341A9FC',
  '54726176656C',
  '776974687573',
  'A9F953DEF0A3',
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
