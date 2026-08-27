#!/bin/bash
# Lanceur pour macOS : double-cliquez ce fichier pour demarrer BadgeCopie.
# La premiere fois, il installe ce qu'il faut ; ensuite il ouvre la page.

# Se placer dans le dossier de ce fichier, meme lance par double-clic.
cd "$(dirname "$0")" || exit 1

echo ""
echo "  ============================================"
echo "   BadgeCopie - outil local de copie de badges"
echo "  ============================================"
echo ""

# Node.js est-il installe ?
if ! command -v node >/dev/null 2>&1; then
  echo "  Node.js n'est pas encore installe."
  echo ""
  echo "  1. Allez sur le site officiel : nodejs.org"
  echo "  2. Telechargez la version LTS pour macOS (fichier .pkg)"
  echo "  3. Ouvrez-le et suivez Suivant / Continuer jusqu'au bout"
  echo "  4. Puis double-cliquez de nouveau ce fichier."
  echo ""
  echo "  (Cette fenetre peut rester ouverte, vous pouvez la fermer.)"
  echo ""
  read -n 1 -s -r -p "  Appuyez sur une touche pour fermer."
  exit 1
fi

echo "  Node.js detecte : $(node -v)"
echo ""

# Le pont vers le lecteur (nfc-pcsc) doit etre compile a l'installation.
# Sur Mac cela demande les "outils en ligne de commande" d'Apple. S'ils
# manquent, on ouvre l'installateur d'Apple et on s'arrete ici : sinon le
# programme se lancerait mais en mode demonstration, sans le vrai lecteur.
if ! xcode-select -p >/dev/null 2>&1; then
  echo "  Il manque un composant d'Apple (outils en ligne de commande)."
  echo "  Une fenetre Apple va s'ouvrir : cliquez sur \"Installer\"."
  echo "  Quand c'est fini, double-cliquez de nouveau ce fichier."
  echo ""
  xcode-select --install >/dev/null 2>&1
  read -n 1 -s -r -p "  Appuyez sur une touche pour fermer."
  exit 1
fi

# Installer les dependances la premiere fois.
if [ ! -d "node_modules" ]; then
  echo "  Premiere installation en cours... (une a deux minutes)"
  echo "  Laissez la fenetre ouverte, c'est normal que ca defile."
  echo ""
  npm install
  echo ""
fi

echo "  Demarrage... la page va s'ouvrir toute seule dans le navigateur."
echo "  Pour arreter le programme : fermez simplement cette fenetre."
echo ""

npm start
