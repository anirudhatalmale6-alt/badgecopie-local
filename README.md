# BadgeCopie — outil local de copie de badges

Outil **prive**, qui tourne sur **votre ordinateur**, pour lire un badge NFC
13,56 MHz et le recopier sur une carte vierge. Rien n'est publie sur internet,
personne d'autre n'y a acces.

Concu pour le lecteur du client : un **Ewent / ACR122U** (lecteur PC/SC sans
contact, 13,56 MHz).

---

## Pourquoi un programme local, et pas un site web

Le lecteur est branche en USB sur l'ordinateur. Une page web dans un
navigateur n'a pas le droit d'acceder a un lecteur de cartes USB (securite des
navigateurs, non contournable). Le programme tourne donc **sur la machine ou
le lecteur est branche**. Il ouvre une page dans le navigateur, mais tout se
passe en local, sur `127.0.0.1` : injoignable depuis le reseau.

---

## Ce que ce lecteur peut copier

L'ACR122U / Ewent lit et ecrit le **13,56 MHz** uniquement.

| Type de carte | Copie |
|---|---|
| Mifare Classic 1K / 4K | oui, vers une carte vierge magique |
| Mifare Mini | oui |
| Mifare Ultralight / NTAG | partiel (l'UID se copie, des pages peuvent etre verrouillees) |
| DESFire, Mifare Plus SL3, cartes bancaires | **non** — chiffrement moderne |

**Hors de portee de CE lecteur :**
- Les badges **125 kHz** (certains Noralsy, HID Prox, vieux interphones). Il
  faut un second lecteur 125 kHz + des cartes T5577.
- Les badges Mifare Classic **durcis** dont les cles ne sont pas dans le
  dictionnaire (une ou plusieurs zones ressortent en rouge « illisible »).
  Recuperer ces cles demande un outil de calcul separe (mfoc / hardnested) ;
  le lecteur seul ne suffit plus. Le programme le signale clairement.

**Vigik :** le badge d'un simple resident est le plus souvent un Mifare
Classic ordinaire, donc copiable. Le vrai badge Vigik **de service** (facteur,
EDF) porte un certificat qui change tout le temps : il ne se copie pas.

---

## Cartes vierges a acheter

Il faut des cartes **« magiques »** : sur une carte normale, le bloc 0 (qui
porte le numero UID) est en lecture seule et refuse la copie.

- **Mifare Classic 1K magique, Gen2 / CUID** (UID reinscriptible, le bloc 0
  s'ecrit apres authentification). Ce sont celles que vise le programme.
- Compter quelques dizaines de centimes piece. En acheter plusieurs : les
  premiers essais servent d'entrainement.

---

## Installation

### Il faut d'abord

1. **Node.js 18 ou plus** — https://nodejs.org (version LTS).
2. Le lecteur branche en USB.

### macOS

```
cd badgecopie-local
npm install            # installe aussi nfc-pcsc (le pont vers le lecteur)
npm start
```

Le service PC/SC est integre a macOS : rien d'autre a installer. La page
s'ouvre toute seule dans le navigateur.

Note : pour la simple lecture/ecriture Mifare Classic par dictionnaire, on
passe par PC/SC — pas besoin de decharger de pilote. (Ce n'est necessaire que
pour l'outil de calcul mfoc, seulement utile sur les badges durcis.)

### Windows

```
cd badgecopie-local
npm install
npm start
```

Le service « Carte a puce » (PC/SC) est integre a Windows. Si le lecteur n'est
pas reconnu, installer le pilote ACR122U (PC/SC) fourni par le fabricant.

### Linux

Installer d'abord le service PC/SC :
```
sudo apt install pcscd libpcsclite-dev
sudo systemctl enable --now pcscd
npm install && npm start
```

---

## Mode demonstration (sans lecteur)

Sans lecteur branche, ou avec `npm run demo`, le programme tourne en
**demonstration** : il simule une carte pour montrer tout le parcours. C'est
ce mode qui permet de voir le fonctionnement avant de brancher le materiel,
et c'est lui qui a servi aux captures d'ecran.

```
npm run demo
```

---

## Utilisation

1. Posez le badge a copier sur le lecteur → le programme l'identifie.
2. « Lire ce badge » → il lit toutes les zones. Les zones illisibles
   ressortent en rouge.
3. « Copier sur une carte vierge » → **retirez le badge d'origine**, posez une
   carte vierge magique → « Ecrire la copie ».
4. C'est fait.

Vous pouvez aussi **enregistrer** un badge pour le refaire plus tard sans avoir
l'original sous la main (bouton « Enregistrer », puis « Refaire cette carte »
dans la liste du bas).

**Securite integree :** le programme refuse d'ecrire sur la carte d'origine.
Tant que la carte posee porte le meme numero que celle qu'on vient de lire, le
bouton d'ecriture reste bloque.

---

## Ce qui est verifie, et ce qui ne peut l'etre que chez vous

- **Verifie automatiquement** (14 + 23 controles) : l'identification des types
  de carte a partir de vrais codes ATR, la geometrie Mifare, le dictionnaire
  de cles, et TOUT le parcours de l'interface en mode demonstration.
- **A valider sur votre machine** : la lecture et l'ecriture reelles, avec
  votre lecteur, un vrai badge et une carte vierge. Je ne peux pas les prouver
  sur mon serveur, qui n'a pas de lecteur. Le code suit exactement le protocole
  de l'ACR122U ; le premier essai reel se fait ensemble, avec vous.

---

## Confidentialite

Tout reste sur votre ordinateur. Les badges enregistres sont des fichiers dans
`data/cartes/`. Rien n'est envoye sur internet. Le programme n'ecoute que sur
`127.0.0.1`, donc aucune autre machine ne peut s'y connecter.

---

## Reglages (facultatif)

Variables d'environnement :

| Variable | Role | Defaut |
|---|---|---|
| `PORT` | Port local | 4600 |
| `BADGE_MODE` | `auto`, `demo` ou `reel` | auto |
| `BADGE_NO_OPEN` | Ne pas ouvrir le navigateur au demarrage | (ouvre) |

Cles supplementaires : si vous connaissez la cle d'un badge particulier, on
peut l'ajouter au dictionnaire dans `src/cles.js`.
