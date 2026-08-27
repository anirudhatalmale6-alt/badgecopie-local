/* ------------------------------------------------------------------ *
 * Backend REEL — lecteur PC/SC (ACR122U / Ewent du client)             *
 * ------------------------------------------------------------------ *
 * Ce fichier parle au vrai lecteur, via la librairie nfc-pcsc. Il n'est
 * charge QUE lorsque le materiel est present : sur ma machine de dev il n'y
 * a pas de lecteur, donc c'est le backend « demo » qui tourne.
 *
 * IMPORTANT — la logique de lecture/ecriture ci-dessous suit exactement le
 * protocole Mifare Classic de l'ACR122U, mais elle ne peut etre PROUVEE que
 * sur la machine du client, avec son lecteur, sa carte et une carte vierge.
 * Je ne peux pas la valider sur mon serveur. Le parcours complet, lui, est
 * verifie de bout en bout en mode demo.
 *
 * Cartes vierges : le chemin d'ecriture vise les cartes « magiques » de type
 * Gen2 / CUID (le bloc 0, qui porte l'UID, s'ecrit apres une authentification
 * normale). Ce sont celles que je recommande d'acheter. Les Gen1a (backdoor)
 * seront ajoutees si besoin.
 */
'use strict';
const EventEmitter = require('events');
const mifare = require('../mifare');

const CLE_A = 0x60;
const CLE_B = 0x61;

/* Chargement paresseux : si nfc-pcsc n'est pas installe, on echoue ici et le
   programme bascule proprement en demo. */
function chargeNfc() {
  // eslint-disable-next-line global-require
  return require('nfc-pcsc');
}

class Pcsc extends EventEmitter {
  constructor() {
    super();
    this.mode = 'reel';
    this.nomLecteur = null;
    this._reader = null;
    this._carte = null;
    this._nfc = null;
  }

  demarrer() {
    const { NFC } = chargeNfc();
    this._nfc = new NFC();

    this._nfc.on('reader', (reader) => {
      /* On garde le premier lecteur venu. L'ACR122U s'annonce avec « ACR122 »
         dans son nom ; l'Ewent, avec son propre libelle : on ne filtre pas. */
      this._reader = reader;
      this.nomLecteur = reader.name;
      this.emit('lecteur', { connecte: true, nom: reader.name });

      reader.on('card', (card) => {
        const identite = mifare.identifie(card.atr);
        identite.uid = card.uid ? String(card.uid).toUpperCase() : null;
        this._carte = { card, identite };
        this.emit('carte', identite);
      });
      reader.on('card.off', () => { this._carte = null; this.emit('carte-retiree'); });
      reader.on('error', (err) => this.emit('erreur', err));
      reader.on('end', () => {
        this._reader = null;
        this.emit('lecteur', { connecte: false, nom: reader.name });
      });
    });

    this._nfc.on('error', (err) => this.emit('erreur', err));
  }

  arreter() { try { if (this._nfc) this._nfc.close(); } catch (e) { /* rien */ } }

  present() { return this._carte ? this._carte.identite : null; }

  _exigeCarte() {
    if (!this._reader) throw new Error('Lecteur non connecte.');
    if (!this._carte) throw new Error('Aucune carte sur le lecteur.');
    return this._reader;
  }

  /* Tente d'authentifier un secteur avec une liste de cles, A puis B.
     Renvoie { type, cle } a la premiere reussite, ou null. */
  async _authentifie(reader, bloc, dict) {
    for (const cle of dict) {
      for (const [type, code] of [['A', CLE_A], ['B', CLE_B]]) {
        try {
          await reader.authenticate(bloc, code, cle);
          return { type, cle };
        } catch (e) { /* cle suivante */ }
      }
    }
    return null;
  }

  async lire({ dict }) {
    const reader = this._exigeCarte();
    const identite = this._carte.identite;
    if (identite.copiable === false) {
      throw new Error(identite.raison || "Cette carte ne se copie pas.");
    }

    /* Nombre de secteurs selon le type detecte ; 16 (une 1K) par defaut. */
    const nbSect = identite.secteurs || 16;

    const secteurs = [];
    for (let s = 0; s < nbSect; s++) {
      const premier = mifare.premierBloc(s);
      const trouve = await this._authentifie(reader, premier, dict);
      if (!trouve) { secteurs.push({ index: s, ok: false, cle: null, cleType: null, blocs: null }); continue; }

      const blocs = [];
      let echec = false;
      for (let b = 0; b < mifare.blocsSecteur(s); b++) {
        try {
          const data = await reader.read(premier + b, 16, 16);
          blocs.push(Buffer.from(data).toString('hex').toUpperCase());
        } catch (e) { echec = true; break; }
      }
      if (echec) secteurs.push({ index: s, ok: false, cle: trouve.cle, cleType: trouve.type, blocs: null });
      else secteurs.push({ index: s, ok: true, cle: trouve.cle, cleType: trouve.type, blocs });
    }

    const lisibles = secteurs.filter((x) => x.ok).length;
    return {
      type: identite.cle, nom: identite.nom, frequence: identite.frequence,
      uid: identite.uid, atr: this._carte.card.atr ? Buffer.from(this._carte.card.atr).toString('hex').toUpperCase() : null,
      secteurs, lisibles, total: nbSect, complet: lisibles === nbSect,
    };
  }

  async ecrire(dump, { dict }) {
    const reader = this._exigeCarte();
    const resultats = [];

    for (const sect of dump.secteurs) {
      if (!sect.ok || !sect.blocs) { resultats.push({ index: sect.index, ecrit: false, raison: 'secteur non lu a la source' }); continue; }
      const premier = mifare.premierBloc(sect.index);

      /* On authentifie la carte VIERGE : cle usine d'abord, puis la cle de la
         source (au cas ou la vierge ait deja recu ce secteur). */
      const auth = await this._authentifie(reader, premier, ['FFFFFFFFFFFF', sect.cle, ...dict]);
      if (!auth) { resultats.push({ index: sect.index, ecrit: false, raison: 'authentification impossible sur la carte vierge' }); continue; }

      let ok = true;
      const nb = mifare.blocsSecteur(sect.index);
      /* Les blocs de donnees d'abord, le trailer en DERNIER : ecrire le
         trailer change les cles du secteur et bloquerait le reste. */
      for (let b = 0; b < nb - 1; b++) {
        const bloc = premier + b;
        if (bloc === mifare.BLOC_FABRICANT) {
          /* Bloc 0 : porte l'UID. Ne s'ecrit que sur carte magique. */
          try { await reader.write(0, Buffer.from(sect.blocs[b], 'hex'), 16); }
          catch (e) { ok = false; resultats.push({ index: sect.index, ecrit: false, raison: "bloc 0 refuse : la carte n'est pas magique" }); break; }
          continue;
        }
        try { await reader.write(bloc, Buffer.from(sect.blocs[b], 'hex'), 16); }
        catch (e) { ok = false; resultats.push({ index: sect.index, ecrit: false, raison: 'ecriture bloc ' + bloc }); break; }
      }
      if (!ok) continue;
      try {
        await reader.write(premier + nb - 1, Buffer.from(sect.blocs[nb - 1], 'hex'), 16);
        resultats.push({ index: sect.index, ecrit: true });
      } catch (e) { resultats.push({ index: sect.index, ecrit: false, raison: 'ecriture du trailer' }); }
    }

    const ecrits = resultats.filter((r) => r.ecrit).length;
    return { ok: ecrits > 0, ecrits, ignores: dump.secteurs.length - ecrits, uid: dump.uid, resultats };
  }
}

module.exports = { Pcsc };
