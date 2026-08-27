/* ------------------------------------------------------------------ *
 * Backend de DEMONSTRATION                                             *
 * ------------------------------------------------------------------ *
 * Aucun materiel requis. Il simule un lecteur et une carte, pour que tout
 * le parcours (poser la carte, lire, poser une vierge, ecrire) soit
 * visible et testable AVANT de brancher le vrai lecteur. C'est aussi ce
 * qui tourne sur mon serveur, ou je n'ai pas le lecteur du client.
 *
 * Il imite fidelement le comportement reel : une carte Mifare Classic 1K
 * avec un secteur dont la cle n'est pas dans le dictionnaire (pour montrer
 * le cas « secteur illisible »), et une carte vierge « magique » sur
 * laquelle on ecrit.
 */
'use strict';
const EventEmitter = require('events');
const mifare = require('../mifare');
const cles = require('../cles');

/* ATR d'une Mifare Classic 1K tel que le fabrique un ACR122U. */
const ATR_1K = '3B8F8001804F0CA000000306030001000000006A';

function bloc(hex) {
  return hex.padEnd(32, '0').slice(0, 32).toUpperCase();
}

/* Construit une fausse carte source : un badge d'immeuble plausible. */
function carteSource() {
  const secteurs = [];
  for (let s = 0; s < 16; s++) {
    /* Le secteur 5 simule un badge « durci » : sa cle n'est pas connue. */
    const illisible = s === 5;
    const nb = 4;
    const blocs = [];
    for (let b = 0; b < nb; b++) {
      if (s === 0 && b === 0) blocs.push(bloc('A4B7C9D2') + '08040062' + '635F8869C1'.padEnd(20, '0'));
      else if (mifare.estTrailer(s, b)) blocs.push('FFFFFFFFFFFFFF078069' + 'FFFFFFFFFFFF');
      else blocs.push(bloc((s * 4 + b).toString(16).padStart(2, '0').repeat(8)));
    }
    secteurs.push({
      index: s,
      ok: !illisible,
      cleType: illisible ? null : 'A',
      cle: illisible ? null : cles.CLE_USINE,
      blocs: illisible ? null : blocs,
    });
  }
  return {
    type: 'classic1k', nom: 'Mifare Classic 1K', frequence: '13,56 MHz',
    uid: 'A4B7C9D2', atr: ATR_1K, secteurs,
  };
}

class Demo extends EventEmitter {
  constructor() {
    super();
    this.mode = 'demo';
    this.nomLecteur = 'Lecteur de demonstration (aucun materiel)';
    this._carte = null;
    this._demarre = false;
  }

  demarrer() {
    this._demarre = true;
    /* Le lecteur « apparait » aussitot, comme un branchement USB. */
    setImmediate(() => this.emit('lecteur', { connecte: true, nom: this.nomLecteur }));
  }

  arreter() { this._demarre = false; }

  present() { return this._carte ? this._carte.identite : null; }

  /* Pilotage de la demo depuis l'interface : poser une source, poser une
     vierge, ou retirer la carte. En vrai, ces evenements viennent du lecteur. */
  simulePose(quoi) {
    if (quoi === 'source') {
      const c = carteSource();
      this._carte = { dump: c, magique: false, identite: mifare.identifie(c.atr) };
      this._carte.identite.uid = c.uid;
    } else if (quoi === 'vierge') {
      this._carte = {
        dump: null, magique: true,
        identite: { ...mifare.identifie(ATR_1K), uid: '00000000', vierge: true },
      };
    } else {
      this._carte = null;
      this.emit('carte-retiree');
      return;
    }
    this.emit('carte', this._carte.identite);
  }

  async lire(/* opts */) {
    if (!this._carte) throw new Error('Aucune carte sur le lecteur.');
    if (!this._carte.dump) throw new Error("Cette carte est vierge : il n'y a rien a lire.");
    const d = this._carte.dump;
    const lisibles = d.secteurs.filter((s) => s.ok).length;
    /* Copie defensive : l'appelant ne doit pas modifier la carte simulee. */
    return JSON.parse(JSON.stringify({
      ...d, lisibles, total: d.secteurs.length,
      complet: lisibles === d.secteurs.length,
    }));
  }

  async ecrire(dump /* , opts */) {
    if (!this._carte) throw new Error('Aucune carte sur le lecteur.');
    if (!this._carte.magique) {
      throw new Error("Cette carte n'est pas une carte vierge magique : impossible d'ecrire l'identifiant dessus.");
    }
    const aEcrire = dump.secteurs.filter((s) => s.ok);
    /* La demo « ecrit » en copiant le dump dans la carte vierge. */
    this._carte.dump = JSON.parse(JSON.stringify(dump));
    this._carte.magique = false;
    this._carte.identite = { ...mifare.identifie(dump.atr), uid: dump.uid };
    return { ok: true, ecrits: aEcrire.length, ignores: dump.secteurs.length - aEcrire.length, uid: dump.uid };
  }
}

module.exports = { Demo, carteSource, ATR_1K };
