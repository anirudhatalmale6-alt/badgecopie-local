/* ------------------------------------------------------------------ *
 * Bibliotheque des cartes enregistrees                                 *
 * ------------------------------------------------------------------ *
 * Chaque lecture peut etre sauvegardee sur le disque, sous un nom choisi
 * (« badge immeuble », « boite aux lettres »...). On peut ainsi refaire une
 * copie plus tard sans avoir la carte d'origine sous la main.
 *
 * Les fichiers restent sur l'ordinateur du client, dans data/cartes/.
 * Rien ne part sur internet.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const config = require('./config');

function assureDossier() { fs.mkdirSync(config.dossierDumps, { recursive: true }); }

/* Un nom de fichier sur : on n'accepte que lettres, chiffres, tiret et
   espace, puis on colle une extension fixe. Sans ce filtre, un nom comme
   « ../autre » ecrirait hors du dossier prevu. */
function nomFichier(nom) {
  /* U+0300 a U+036F = diacritiques combinants ; ecrits en \u pour rester
     lisibles a l'ecran et dans grep (un accent combinant tape tel quel est
     invisible dans l'editeur). */
  const propre = String(nom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 60) || 'carte';
  return propre.replace(/\s+/g, '_') + '.json';
}

function enregistre(nom, dump, meta = {}) {
  assureDossier();
  const fichier = path.join(config.dossierDumps, nomFichier(nom));
  const contenu = { nom, enregistre_le: meta.date || null, dump };
  fs.writeFileSync(fichier, JSON.stringify(contenu, null, 2), 'utf8');
  return path.basename(fichier);
}

function liste() {
  assureDossier();
  return fs.readdirSync(config.dossierDumps)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const c = JSON.parse(fs.readFileSync(path.join(config.dossierDumps, f), 'utf8'));
        return {
          fichier: f, nom: c.nom || f.replace(/\.json$/, ''),
          enregistre_le: c.enregistre_le || null,
          type: c.dump && c.dump.nom, uid: c.dump && c.dump.uid,
          lisibles: c.dump && c.dump.lisibles, total: c.dump && c.dump.total,
        };
      } catch (e) { return { fichier: f, nom: f, invalide: true }; }
    })
    .sort((a, b) => String(b.enregistre_le).localeCompare(String(a.enregistre_le)));
}

function charge(fichier) {
  const f = path.join(config.dossierDumps, path.basename(String(fichier)));
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

function supprime(fichier) {
  const f = path.join(config.dossierDumps, path.basename(String(fichier)));
  if (fs.existsSync(f)) { fs.unlinkSync(f); return true; }
  return false;
}

module.exports = { enregistre, liste, charge, supprime, nomFichier };
