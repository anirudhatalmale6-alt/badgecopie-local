/* ------------------------------------------------------------------ *
 * Identification d'une carte 13,56 MHz a partir de son ATR PC/SC       *
 * ------------------------------------------------------------------ *
 * Un lecteur PC/SC (comme l'ACR122U / Ewent du client) ne donne pas le
 * SAK et l'ATQA bruts : il fabrique un « ATR » normalise qui encode le type
 * de la carte. Ces fonctions le decodent. Elles sont PURES et testables
 * sans materiel : c'est le seul moyen de verifier la detection sans avoir
 * le lecteur sous la main.
 *
 * Format ATR d'une carte de stockage sans contact (PC/SC Part 3) :
 *   3B 8F 80 01  80 4F 0C A0 00 00 03 06  SS  NN NN  00 00 00 00  XX
 *                            \___ RID PC/SC ___/  \_ nom de carte _/
 *   - A0 00 00 03 06 : identifiant PC/SC, present sur toute carte de stockage.
 *   - SS : norme (0x03 = ISO 14443 A).
 *   - NN NN : code du type de carte.
 *
 * Une carte a puce ISO 14443-4 (DESFire, Mifare Plus, carte bancaire...)
 * ne suit PAS ce format : son ATR commence autrement. On s'en sert pour
 * la classer « non copiable » sans se tromper.
 */
'use strict';

/* Codes de type renvoyes dans l'ATR de stockage. Source : registre PC/SC
   des « card names » (PROP_CARD_STANDARD). */
const TYPES = {
  0x0001: { cle: 'classic1k', nom: 'Mifare Classic 1K', secteurs: 16, copiable: true },
  0x0002: { cle: 'classic4k', nom: 'Mifare Classic 4K', secteurs: 40, copiable: true },
  0x0003: { cle: 'ultralight', nom: 'Mifare Ultralight', secteurs: 0, copiable: 'partiel' },
  0x0026: { cle: 'mini', nom: 'Mifare Mini', secteurs: 5, copiable: true },
  0x003a: { cle: 'ultralightc', nom: 'Mifare Ultralight C', secteurs: 0, copiable: 'partiel' },
  0x0036: { cle: 'plus_sl1', nom: 'Mifare Plus (niveau SL1)', secteurs: 40, copiable: true },
  0x0037: { cle: 'plus_sl2', nom: 'Mifare Plus (niveau SL2/SL3)', secteurs: 40, copiable: false },
  0xff88: { cle: 'infineon', nom: 'Infineon SLE', secteurs: 16, copiable: true },
};

const RID_PCSC = [0xa0, 0x00, 0x00, 0x03, 0x06];

/* Normalise une entree en tableau d'octets, qu'elle arrive en Buffer, en
   tableau, ou en chaine hexadecimale (« 3B8F8001... » ou « 3b 8f 80 01 »). */
function octets(atr) {
  if (atr == null) return [];
  if (Buffer.isBuffer(atr)) return Array.from(atr);
  if (Array.isArray(atr)) return atr.map((n) => n & 0xff);
  const hex = String(atr).replace(/[^0-9a-fA-F]/g, '');
  const out = [];
  for (let i = 0; i + 1 < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

function estStockage(a) {
  /* On cherche le RID PC/SC dans les premiers octets ; sa presence signe
     une carte de stockage sans contact. */
  for (let i = 0; i + RID_PCSC.length <= a.length && i < 8; i++) {
    if (RID_PCSC.every((v, k) => a[i + k] === v)) return i + RID_PCSC.length;
  }
  return -1;
}

/* Renvoie une description homogene de la carte, quel que soit son type. */
function identifie(atr) {
  const a = octets(atr);
  if (!a.length) {
    return { cle: 'inconnu', nom: 'Carte inconnue', copiable: false, frequence: '13,56 MHz',
      raison: "Aucune donnee lue. Reposez la carte bien a plat sur le lecteur." };
  }

  const apres = estStockage(a);
  if (apres < 0) {
    /* Pas le format de stockage : c'est une carte a puce ISO 14443-4. */
    return {
      cle: 'iso14443-4', nom: 'Carte a puce chiffree (DESFire, Plus, bancaire...)',
      copiable: false, frequence: '13,56 MHz',
      raison: "Cette carte utilise un chiffrement moderne. Elle ne se copie pas, ni avec ce lecteur ni avec aucun autre.",
    };
  }

  /* SS a `apres`, puis le code de type sur deux octets. */
  const code = (a[apres + 1] << 8) | a[apres + 2];
  const t = TYPES[code];
  if (!t) {
    return {
      cle: 'stockage-inconnu', nom: 'Carte de stockage non reconnue',
      code: '0x' + code.toString(16).padStart(4, '0'),
      copiable: 'partiel', frequence: '13,56 MHz',
      raison: "Type inhabituel. On peut tenter la copie, sans garantie.",
    };
  }

  return {
    cle: t.cle, nom: t.nom, secteurs: t.secteurs, copiable: t.copiable,
    frequence: '13,56 MHz',
    raison: messageCopiable(t.copiable, t.nom),
  };
}

function messageCopiable(copiable, nom) {
  if (copiable === true) return `${nom} : copie possible sur une carte vierge magique.`;
  if (copiable === 'partiel')
    return `${nom} : l'identifiant se copie, mais certaines pages peuvent etre verrouillees. A tester.`;
  return `${nom} : cette carte ne se copie pas.`;
}

/* --- Geometrie d'une carte Mifare Classic -------------------------- *
 * 1K : 16 secteurs de 4 blocs. 4K : 32 secteurs de 4 blocs, puis 8 de 16.
 * Le DERNIER bloc de chaque secteur est le « trailer » (cles + droits) :
 * on l'ecrit toujours en dernier, sinon on change les cles avant d'avoir
 * fini d'ecrire le reste du secteur, et l'ecriture se bloque a mi-chemin.
 */
function nbBlocs(secteurs) {
  if (secteurs <= 32) return secteurs * 4;
  return 32 * 4 + (secteurs - 32) * 16;
}

function blocsSecteur(secteur) {
  return secteur < 32 ? 4 : 16;
}

function premierBloc(secteur) {
  return secteur < 32 ? secteur * 4 : 128 + (secteur - 32) * 16;
}

function estTrailer(secteur, blocDansSecteur) {
  return blocDansSecteur === blocsSecteur(secteur) - 1;
}

/* Le bloc 0 (fabricant) contient l'UID. Sur une carte normale il est en
   lecture seule ; seules les cartes « magiques » acceptent de le reecrire. */
const BLOC_FABRICANT = 0;

module.exports = {
  TYPES, octets, identifie, messageCopiable,
  nbBlocs, blocsSecteur, premierBloc, estTrailer, BLOC_FABRICANT,
};
