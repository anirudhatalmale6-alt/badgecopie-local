#!/usr/bin/env python3
"""Parcours complet dans un navigateur, en mode demonstration.

Le vrai lecteur ne peut pas etre teste ici (il est chez le client). Mais tout
le parcours et l'interface le sont : poser une carte, la lire, poser une
vierge, ecrire, enregistrer, refaire depuis la bibliotheque.
"""
import os
import re
import sys
import subprocess

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:4600")
RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.path.join(RACINE, "captures")
os.makedirs(SORTIE, exist_ok=True)

ok = 0
ko = []


def v(nom, cond, detail=""):
    global ok
    if cond:
        ok += 1
        print("  ok   " + nom)
    else:
        ko.append(nom)
        print("  FAIL " + nom + " " + str(detail))


def visible(page, id_):
    return page.eval_on_selector("#" + id_, "e => !e.hidden")


def shot(page, nom):
    page.wait_for_timeout(250)
    page.screenshot(path=os.path.join(SORTIE, nom + ".png"))


def main():
    with sync_playwright() as p:
        nav = p.chromium.launch()
        page = nav.new_page()
        page.set_viewport_size({"width": 900, "height": 820})

        print("\n1. Demarrage en mode demo")
        page.goto(BASE)
        page.wait_for_selector("#bandeau-demo:not([hidden])")
        v("le bandeau demonstration s'affiche", visible(page, "bandeau-demo"))
        v("le voyant indique le mode demo", "demo" in page.get_attribute("#voyant", "class"))
        v("l'ecran d'attente est visible au depart", visible(page, "e-attente"))
        shot(page, "01-attente")

        print("\n2. Poser un badge a copier")
        page.click("[data-pose=source]")
        page.wait_for_selector("#e-source:not([hidden])")
        v("le badge est detecte", visible(page, "e-source"))
        v("son type est affiche", "Mifare Classic 1K" in page.inner_text("#src-nom"))
        v("son numero est affiche", page.inner_text("#src-uid").strip() == "A4B7C9D2")
        v("le verdict est favorable", "oui" in page.get_attribute("#src-verdict", "class"))
        shot(page, "02-badge-detecte")

        print("\n3. Lire le badge")
        page.click("#btn-lire")
        page.wait_for_selector("#e-lu:not([hidden])")
        v("le resultat de lecture s'affiche", visible(page, "e-lu"))
        detail = page.inner_text("#lu-detail")
        v("le nombre de zones lues est montre", "15 / 16" in detail, detail)
        cases = page.query_selector_all("#lu-secteurs .sect")
        v("une case par zone est dessinee", len(cases) == 16, len(cases))
        rouges = page.query_selector_all("#lu-secteurs .sect.ko")
        v("la zone illisible est signalee en rouge", len(rouges) == 1, len(rouges))
        shot(page, "03-badge-lu")

        print("\n4. Copier sur une carte vierge")
        page.click("#btn-copier")
        page.wait_for_selector("#e-vierge:not([hidden])")
        v("l'ecran demande une carte vierge", visible(page, "e-vierge"))
        # Securite : le badge d'origine est encore sur le lecteur. Le bouton
        # ecrire doit rester cache — on ne doit jamais ecrire sur l'original.
        v("le bouton ecrire reste cache tant que l'original est present",
          not visible(page, "btn-ecrire"))
        v("le message dit de retirer l'original",
          "origine" in page.inner_text("#vierge-attente").lower())
        shot(page, "04-attente-vierge")

        # On retire l'original, puis on pose la vierge.
        page.click("[data-pose=rien]")
        page.wait_for_timeout(150)
        page.click("[data-pose=vierge]")
        page.wait_for_selector("#btn-ecrire:not([hidden])")
        v("poser la vierge fait apparaitre le bouton ecrire", visible(page, "btn-ecrire"))

        print("\n5. Ecrire la copie")
        page.click("#btn-ecrire")
        page.wait_for_selector("#e-fini:not([hidden])")
        v("la copie se termine avec succes", "terminee" in page.inner_text("#fini-titre").lower())
        v("le nombre de zones copiees est indique", "15" in page.inner_text("#fini-detail"))
        shot(page, "05-copie-terminee")

        print("\n6. Refuser un badge non copiable")
        page.click("#btn-recommencer")
        # On simule directement une DESFire via l'API en injectant un ATR non-stockage :
        # le backend demo ne fournit que Classic 1K, donc on verifie plutot le
        # chemin refus au niveau de la detection (teste en unite). Ici on verifie
        # que « recommencer » revient bien a l'etat d'attente.
        page.wait_for_selector("#e-source:not([hidden]), #e-attente:not([hidden])")
        v("recommencer relance le parcours", visible(page, "e-source") or visible(page, "e-attente"))

        print("\n7. Enregistrer puis refaire depuis la bibliotheque")
        # Relire pour avoir un dump en memoire, puis enregistrer.
        if visible(page, "e-attente"):
            page.click("[data-pose=source]")
            page.wait_for_selector("#e-source:not([hidden])")
        page.click("#btn-lire")
        page.wait_for_selector("#e-lu:not([hidden])")
        page.click("#btn-enregistrer")
        page.wait_for_selector("#modale-nom:not([hidden])")
        page.fill("#champ-nom", "badge immeuble")
        page.click("#nom-ok")
        page.wait_for_selector(".ligne-carte")
        v("le badge apparait dans la bibliotheque", "badge immeuble" in page.inner_text("#biblio-liste"))
        shot(page, "06-bibliotheque")

        page.click("[data-pose=rien]")
        page.wait_for_timeout(200)
        page.click("[data-copier]")
        page.wait_for_selector("#e-vierge:not([hidden])")
        v("« refaire cette carte » demande une carte vierge", visible(page, "e-vierge"))
        page.click("[data-pose=vierge]")
        page.wait_for_selector("#btn-ecrire:not([hidden])")
        page.click("#btn-ecrire")
        page.wait_for_selector("#e-fini:not([hidden])")
        v("refaire depuis la bibliotheque ecrit bien la copie",
          "terminee" in page.inner_text("#fini-titre").lower())

        print("\n8. Supprimer de la bibliotheque")
        page.on("dialog", lambda d: d.accept())
        page.click("[data-suppr]")
        page.wait_for_timeout(400)
        v("la suppression vide la bibliotheque",
          "Aucun badge" in page.inner_text("#biblio-liste"))

        print("\n9. Telephone")
        page.set_viewport_size({"width": 390, "height": 820})
        page.goto(BASE)
        page.wait_for_selector("#e-attente:not([hidden]), #e-source:not([hidden])")
        largeur = page.evaluate("document.documentElement.scrollWidth")
        v("la page ne deborde pas sur telephone", largeur <= 391, largeur)
        shot(page, "07-mobile")

        nav.close()

    print("\n" + "=" * 56)
    print("%d verifications, %d echec(s)" % (ok, len(ko)))
    for n in ko:
        print("  - " + n)
    return 1 if ko else 0


if __name__ == "__main__":
    sys.exit(main())
