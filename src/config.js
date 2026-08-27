'use strict';
const path = require('path');

const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));

module.exports = {
  /* Le programme n'ecoute QUE sur 127.0.0.1 : il n'est jamais accessible
     depuis le reseau, seulement depuis l'ordinateur ou il tourne. C'est ce
     qui le rend prive par construction, sans dependre d'un mot de passe. */
  hote: '127.0.0.1',
  port: num(process.env.PORT, 4600),

  /* 'auto' : lecteur reel si present, sinon demo. 'demo' force la
     demonstration. 'reel' force le materiel (erreur claire s'il manque). */
  mode: process.env.BADGE_MODE || 'auto',

  /* Code d'acces a l'interface. Sur 127.0.0.1 c'est un confort, pas une
     barriere reseau : personne d'autre ne peut atteindre le port. */
  code: process.env.BADGE_CODE || '0000',

  dossierDumps: path.join(__dirname, '..', 'data', 'cartes'),
  ouvrirNavigateur: process.env.BADGE_NO_OPEN ? false : true,
};
