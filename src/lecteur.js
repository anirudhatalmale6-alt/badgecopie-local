/* ------------------------------------------------------------------ *
 * Facade du lecteur                                                    *
 * ------------------------------------------------------------------ *
 * Le reste du programme ne connait que cette facade. Elle choisit le
 * backend — le vrai lecteur PC/SC s'il est la, sinon la demonstration —
 * et expose la meme interface dans les deux cas. Ainsi l'interface et le
 * parcours sont identiques, avec ou sans materiel.
 */
'use strict';
const EventEmitter = require('events');
const config = require('./config');
const cles = require('./cles');

function fabrique() {
  if (config.mode === 'demo') return { backend: new (require('./backends/demo').Demo)(), motif: 'force en demo' };

  /* On tente le vrai lecteur. nfc-pcsc echoue a se charger si la librairie
     systeme PC/SC n'est pas installee : dans ce cas on retombe en demo,
     sauf si l'utilisateur a explicitement exige le mode reel. */
  try {
    const { Pcsc } = require('./backends/pcsc');
    return { backend: new Pcsc(), motif: 'materiel' };
  } catch (e) {
    if (config.mode === 'reel') throw new Error("Mode reel demande mais nfc-pcsc est introuvable : " + e.message);
    return { backend: new (require('./backends/demo').Demo)(), motif: 'nfc-pcsc absent, ' + (e.code || e.message) };
  }
}

class Lecteur extends EventEmitter {
  constructor() {
    super();
    const { backend, motif } = fabrique();
    this._b = backend;
    this.mode = backend.mode;
    this.motif = motif;
    this._lecteurConnecte = false;
    this._nomLecteur = null;

    backend.on('lecteur', (info) => {
      this._lecteurConnecte = info.connecte;
      this._nomLecteur = info.nom;
      this.emit('etat', this.etat());
    });
    backend.on('carte', (identite) => { this._carte = identite; this.emit('etat', this.etat()); });
    backend.on('carte-retiree', () => { this._carte = null; this.emit('etat', this.etat()); });
    backend.on('erreur', (err) => this.emit('etat', { ...this.etat(), erreur: String(err && err.message || err) }));
  }

  demarrer() { this._b.demarrer(); }
  arreter() { this._b.arreter(); }

  etat() {
    return {
      mode: this.mode,
      motif: this.motif,
      lecteur: this._lecteurConnecte,
      nomLecteur: this._nomLecteur,
      carte: this._carte || null,
    };
  }

  async lire(supplementCles = []) {
    return this._b.lire({ dict: cles.dictionnaire(supplementCles) });
  }
  async ecrire(dump, supplementCles = []) {
    return this._b.ecrire(dump, { dict: cles.dictionnaire(supplementCles) });
  }

  /* Reserve a la demo : l'interface propose des boutons « poser une source /
     une vierge » quand aucun vrai lecteur n'est branche. */
  estDemo() { return this.mode === 'demo'; }
  simulePose(quoi) { if (this._b.simulePose) this._b.simulePose(quoi); }
}

module.exports = new Lecteur();
