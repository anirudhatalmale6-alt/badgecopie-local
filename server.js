'use strict';
const express = require('express');
const path = require('path');
const config = require('./src/config');
const lecteur = require('./src/lecteur');

const app = express();
app.disable('x-powered-by');

app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', require('./src/api'));

app.use((req, res) => res.status(404).json({ ok: false, erreur: 'inconnu' }));
app.use((err, req, res, next) => {
  console.error('[erreur]', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ ok: false, erreur: 'erreur interne' });
});

lecteur.demarrer();

/* On n'ecoute QUE sur 127.0.0.1 : le programme est injoignable depuis le
   reseau, seulement depuis cet ordinateur. C'est la garantie « prive ». */
const serveur = app.listen(config.port, config.hote, () => {
  const url = `http://${config.hote}:${config.port}`;
  console.log('');
  console.log('  BadgeCopie — outil local de copie de badges');
  console.log('  ' + url);
  console.log('  Mode : ' + (lecteur.mode === 'reel' ? 'lecteur reel' : 'DEMONSTRATION (' + lecteur.motif + ')'));
  console.log('');
  console.log('  Laissez cette fenetre ouverte. Fermez-la pour arreter.');
  if (config.ouvrirNavigateur) ouvre(url);
});

/* Ouvre le navigateur par defaut sur l'interface, selon le systeme. Un echec
   n'est pas grave : l'adresse est affichee juste au-dessus. */
function ouvre(url) {
  const plat = process.platform;
  const cmd = plat === 'darwin' ? 'open' : plat === 'win32' ? 'start ""' : 'xdg-open';
  try { require('child_process').exec(`${cmd} ${url}`); } catch (e) { /* tant pis */ }
}

function arret() {
  try { lecteur.arreter(); } catch (e) { /* rien */ }
  serveur.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}
process.on('SIGINT', arret);
process.on('SIGTERM', arret);
