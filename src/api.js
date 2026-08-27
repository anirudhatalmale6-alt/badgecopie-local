'use strict';
const express = require('express');
const config = require('./config');
const lecteur = require('./lecteur');
const biblio = require('./bibliotheque');

const router = express.Router();
router.use(express.json({ limit: '2mb' }));

/* Dernier dump lu, garde en memoire pour l'ecriture qui suit tout de suite.
   Volatile par nature : on ne persiste que si l'utilisateur enregistre. */
let dernierDump = null;

function horodatage() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* --- Etat, flux temps reel ----------------------------------------- */

router.get('/etat', (req, res) => {
  res.json({ ...lecteur.etat(), demo: lecteur.estDemo(), aEnMemoire: !!dernierDump });
});

/* Flux d'evenements (SSE) : l'interface reagit des qu'une carte est posee
   ou retiree, sans avoir a interroger en boucle. */
router.get('/flux', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  const envoie = (etat) => res.write(`data: ${JSON.stringify({ ...etat, demo: lecteur.estDemo() })}\n\n`);
  envoie(lecteur.etat());
  const sur = (etat) => envoie(etat);
  lecteur.on('etat', sur);
  /* Battement pour garder la connexion ouverte a travers les proxys. */
  const bat = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => { clearInterval(bat); lecteur.off('etat', sur); });
});

/* --- Demo : simuler la pose d'une carte ---------------------------- */

router.post('/demo/pose', (req, res) => {
  if (!lecteur.estDemo()) return res.status(400).json({ ok: false, erreur: 'Un vrai lecteur est branche.' });
  lecteur.simulePose(req.body && req.body.quoi);
  res.json({ ok: true });
});

/* --- Lecture -------------------------------------------------------- */

router.post('/lire', async (req, res) => {
  try {
    const dump = await lecteur.lire((req.body && req.body.cles) || []);
    dernierDump = dump;
    res.json({ ok: true, dump });
  } catch (e) {
    res.status(400).json({ ok: false, erreur: String(e.message || e) });
  }
});

/* --- Ecriture ------------------------------------------------------- */

router.post('/ecrire', async (req, res) => {
  /* On ecrit le dump fourni, sinon le dernier lu. Fournir explicitement
     permet de reecrire une carte chargee depuis la bibliotheque. */
  let dump = (req.body && req.body.dump) || dernierDump;
  if (req.body && req.body.fichier) {
    const c = biblio.charge(req.body.fichier);
    if (c) dump = c.dump;
  }
  if (!dump) return res.status(400).json({ ok: false, erreur: "Aucune carte lue a copier. Lisez d'abord une carte." });

  /* Garde-fou serveur : on n'ecrit jamais sur la carte d'origine. Si la carte
     presente porte le meme numero que le dump a ecrire, c'est l'original —
     l'ecraser corromprait le badge que le client veut garder. */
  const presente = lecteur.etat().carte;
  if (presente && presente.uid && dump.uid && presente.uid === dump.uid) {
    return res.status(400).json({
      ok: false,
      erreur: "C'est le badge d'origine qui est sur le lecteur. Retirez-le et posez une carte vierge avant d'ecrire.",
    });
  }

  try {
    const r = await lecteur.ecrire(dump, (req.body && req.body.cles) || []);
    res.json({ ok: r.ok, resultat: r });
  } catch (e) {
    res.status(400).json({ ok: false, erreur: String(e.message || e) });
  }
});

/* --- Bibliotheque --------------------------------------------------- */

router.post('/enregistrer', (req, res) => {
  const dump = (req.body && req.body.dump) || dernierDump;
  if (!dump) return res.status(400).json({ ok: false, erreur: 'Rien a enregistrer.' });
  const fichier = biblio.enregistre((req.body && req.body.nom) || 'carte', dump, { date: horodatage() });
  res.json({ ok: true, fichier });
});

router.get('/bibliotheque', (req, res) => res.json({ ok: true, cartes: biblio.liste() }));

router.get('/bibliotheque/:fichier', (req, res) => {
  const c = biblio.charge(req.params.fichier);
  if (!c) return res.status(404).json({ ok: false });
  dernierDump = c.dump;                       /* prete a etre reecrite */
  res.json({ ok: true, carte: c });
});

router.delete('/bibliotheque/:fichier', (req, res) => {
  res.json({ ok: biblio.supprime(req.params.fichier) });
});

module.exports = router;
