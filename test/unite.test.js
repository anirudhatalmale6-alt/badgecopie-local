'use strict';
const test = require('node:test');
const assert = require('node:assert');

const mifare = require('../src/mifare');
const cles = require('../src/cles');
const biblio = require('../src/bibliotheque');

/* ===================== Detection de carte ========================= */

/* ATR reels tels que fabriques par un lecteur PC/SC (ACR122U). Ce sont les
   memes octets que renvoie le lecteur du client. */
const ATR = {
  classic1k: '3B8F8001804F0CA000000306030001000000006A',
  classic4k: '3B8F8001804F0CA000000306030002000000006B',
  ultralight: '3B8F8001804F0CA0000003060300030000000068',
  desfire: '3B8180018080',                 // ISO 14443-4, pas de format de stockage
};

test('une Mifare Classic 1K est reconnue et copiable', () => {
  const r = mifare.identifie(ATR.classic1k);
  assert.strictEqual(r.cle, 'classic1k');
  assert.strictEqual(r.copiable, true);
  assert.strictEqual(r.secteurs, 16);
});

test('une Mifare Classic 4K a 40 secteurs', () => {
  const r = mifare.identifie(ATR.classic4k);
  assert.strictEqual(r.cle, 'classic4k');
  assert.strictEqual(r.secteurs, 40);
});

test('une Ultralight est copiable partiellement', () => {
  const r = mifare.identifie(ATR.ultralight);
  assert.strictEqual(r.cle, 'ultralight');
  assert.strictEqual(r.copiable, 'partiel');
});

test('une carte ISO 14443-4 (DESFire) est declaree non copiable', () => {
  /* Point important : ces cartes ne suivent pas le format de stockage, on
     doit les classer « non » sans jamais promettre la copie. */
  const r = mifare.identifie(ATR.desfire);
  assert.strictEqual(r.copiable, false);
  assert.match(r.raison, /ne se copie pas/);
});

test('les octets se lisent en Buffer, tableau ou chaine hex indifferemment', () => {
  const buf = Buffer.from(ATR.classic1k, 'hex');
  const arr = Array.from(buf);
  assert.strictEqual(mifare.identifie(buf).cle, 'classic1k');
  assert.strictEqual(mifare.identifie(arr).cle, 'classic1k');
  assert.strictEqual(mifare.identifie('3b 8f 80 01 80 4f 0c a0 00 00 03 06 03 00 01 00 00 00 00 6a').cle, 'classic1k');
});

test('une entree vide ne fait pas planter la detection', () => {
  const r = mifare.identifie('');
  assert.strictEqual(r.copiable, false);
  assert.ok(r.raison);
});

/* ===================== Geometrie Mifare =========================== */

test('une 1K compte 64 blocs', () => {
  assert.strictEqual(mifare.nbBlocs(16), 64);
});

test('une 4K compte 256 blocs (32x4 + 8x16)', () => {
  assert.strictEqual(mifare.nbBlocs(40), 256);
});

test('le premier bloc des grands secteurs de la 4K est correct', () => {
  assert.strictEqual(mifare.premierBloc(0), 0);
  assert.strictEqual(mifare.premierBloc(1), 4);
  assert.strictEqual(mifare.premierBloc(31), 124);
  /* Les secteurs 32+ font 16 blocs : le 32e commence au bloc 128. */
  assert.strictEqual(mifare.premierBloc(32), 128);
  assert.strictEqual(mifare.premierBloc(33), 144);
});

test('le trailer est le dernier bloc du secteur, 4e ou 16e selon la taille', () => {
  assert.strictEqual(mifare.estTrailer(0, 3), true);
  assert.strictEqual(mifare.estTrailer(0, 2), false);
  assert.strictEqual(mifare.estTrailer(32, 15), true);
  assert.strictEqual(mifare.estTrailer(32, 3), false);
});

/* ===================== Dictionnaire de cles ======================= */

test('la cle usine est en tete du dictionnaire', () => {
  assert.strictEqual(cles.dictionnaire()[0], 'FFFFFFFFFFFF');
});

test('les cles fournies par l\'utilisateur s\'ajoutent sans doublon', () => {
  const d = cles.dictionnaire(['a0a1a2a3a4a5', 'FFFFFFFFFFFF', '112233445566']);
  assert.strictEqual(d.filter((k) => k === 'FFFFFFFFFFFF').length, 1, 'pas de doublon');
  assert.ok(d.includes('112233445566'), 'nouvelle cle presente');
  assert.ok(d.every((k) => k.length === 12), 'toutes normalisees en 12 hex');
});

test('une cle mal formee est ignoree', () => {
  assert.strictEqual(cles.normalise('xyz'), null);
  assert.strictEqual(cles.normalise('FFFFFFFFFF'), null, 'trop courte');
  assert.strictEqual(cles.normalise('ff ff ff ff ff ff'), 'FFFFFFFFFFFF');
});

/* ===================== Noms de fichiers ========================== */

test('un nom de fichier dangereux est neutralise', () => {
  /* Sans nettoyage, « ../../x » ecrirait hors du dossier prevu. */
  assert.strictEqual(biblio.nomFichier('../../etc/passwd'), 'etcpasswd.json');
  assert.strictEqual(biblio.nomFichier('Badge Immeuble'), 'Badge_Immeuble.json');
  assert.strictEqual(biblio.nomFichier(''), 'carte.json');
  assert.match(biblio.nomFichier('éàîç'), /^[A-Za-z]*\.json$/);
});
