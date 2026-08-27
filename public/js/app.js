/* ------------------------------------------------------------------ *
 * Interface de l'outil local de copie                                  *
 * ------------------------------------------------------------------ *
 * Un seul ecran visible a la fois. L'etat vient du serveur en temps reel
 * (flux SSE) : des qu'une carte est posee ou retiree, l'interface reagit.
 * L'utilisateur n'a jamais qu'une seule action a faire.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var ecrans = ['e-pas-lecteur', 'e-attente', 'e-source', 'e-lecture', 'e-lu',
    'e-vierge', 'e-ecriture', 'e-fini', 'e-refus'];

  /* Etape courante du parcours, pilotee par l'utilisateur ET par le lecteur.
     'auto' : on affiche selon la carte presente. Les autres valeurs figent
     un ecran (lecture, ecriture, resultat) jusqu'a une action. */
  var etape = 'auto';
  var dernierEtat = null;
  var dernierDump = null;

  function montre(id) {
    ecrans.forEach(function (e) { $(e).hidden = e !== id; });
  }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 3200);
  }

  function json(url, opts) {
    return fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts))
      .then(function (r) { return r.json(); });
  }

  /* --- Flux temps reel ---------------------------------------------- */

  function ecoute() {
    var src = new EventSource('/api/flux');
    src.onmessage = function (ev) {
      try { appliqueEtat(JSON.parse(ev.data)); } catch (e) { /* ping */ }
    };
    src.onerror = function () { /* EventSource se reconnecte tout seul */ };
  }

  function appliqueEtat(etat) {
    dernierEtat = etat;
    majVoyant(etat);
    $('bandeau-demo').hidden = !etat.demo;

    /* Les ecrans « en cours » et « resultat » ne sont pas ecrases par l'etat
       du lecteur : on ne veut pas qu'un retrait de carte efface le resultat. */
    if (etape === 'lecture' || etape === 'ecriture' || etape === 'fini' || etape === 'nom') return;

    if (etape === 'vierge') { majAttenteVierge(etat); return; }

    /* Mode auto : l'ecran suit la carte posee. */
    if (!etat.lecteur && !etat.demo) { montre('e-pas-lecteur'); return; }
    var c = etat.carte;
    if (!c) { montre('e-attente'); return; }
    if (c.vierge) { montre('e-attente'); return; }   /* une vierge posee hors contexte */
    afficheSource(c);
  }

  function majVoyant(etat) {
    var v = $('voyant'), t = $('etat-texte');
    v.className = 'voyant';
    if (etat.demo) { v.classList.add('demo'); t.textContent = 'Mode demonstration'; }
    else if (etat.lecteur) { v.classList.add('on'); t.textContent = etat.nomLecteur || 'Lecteur pret'; }
    else { v.classList.add('off'); t.textContent = 'Lecteur non branche'; }
  }

  /* --- Ecran : carte source ----------------------------------------- */

  function afficheSource(c) {
    $('src-nom').textContent = c.nom || 'Badge detecte';
    $('src-uid').textContent = c.uid || '—';
    var v = $('src-verdict');
    var btn = $('btn-lire');
    if (c.copiable === false) {
      montre('e-refus');
      $('refus-titre').textContent = c.nom || 'Badge non copiable';
      $('refus-detail').textContent = c.raison || '';
      return;
    }
    v.className = 'verdict ' + (c.copiable === true ? 'oui' : 'partiel');
    v.textContent = c.raison || '';
    btn.disabled = false;
    montre('e-source');
  }

  /* --- Lecture ------------------------------------------------------- */

  $('btn-lire').addEventListener('click', function () {
    etape = 'lecture'; montre('e-lecture');
    json('/api/lire', { method: 'POST', body: '{}' }).then(function (r) {
      if (!r.ok) { etape = 'auto'; toast(r.erreur || 'Lecture impossible.'); appliqueEtat(dernierEtat); return; }
      dernierDump = r.dump;
      afficheLu(r.dump);
    }).catch(function () { etape = 'auto'; toast('Erreur de communication.'); });
  });

  function afficheLu(d) {
    etape = 'fini-lecture';
    $('lu-titre').textContent = d.complet ? 'Badge lu en entier' : 'Badge lu';
    $('lu-detail').innerHTML = 'Numero : <b>' + esc(d.uid) + '</b> — ' +
      d.lisibles + ' / ' + d.total + ' zones lues';
    var s = $('lu-secteurs'); s.innerHTML = '';
    (d.secteurs || []).forEach(function (sec) {
      var el = document.createElement('span');
      el.className = 'sect ' + (sec.ok ? 'ok' : 'ko');
      el.textContent = sec.index;
      el.title = sec.ok ? 'Zone ' + sec.index + ' lue' : 'Zone ' + sec.index + ' illisible (cle inconnue)';
      s.appendChild(el);
    });
    montre('e-lu');
    if (!d.complet) {
      toast(d.total - d.lisibles + ' zone(s) illisible(s) : la copie peut ne pas ouvrir. Voir les questions.');
    }
  }

  /* --- Vers la copie ------------------------------------------------- */

  $('btn-copier').addEventListener('click', function () {
    etape = 'vierge';
    $('btn-ecrire').hidden = true;
    $('vierge-attente').textContent = 'En attente d\'une carte vierge…';
    montre('e-vierge');
    majAttenteVierge(dernierEtat);
  });

  function majAttenteVierge(etat) {
    var c = etat && etat.carte;
    var uidSource = dernierDump && dernierDump.uid;
    /* Securite : on n'ecrit JAMAIS sur la carte d'origine. Tant que la carte
       posee porte le meme numero que celle qu'on vient de lire, c'est encore
       l'original — on refuse d'ecrire dessus et on demande de la retirer. */
    var memeCarte = c && uidSource && c.uid === uidSource;
    var pretAEcrire = c && !memeCarte;

    $('btn-ecrire').hidden = !pretAEcrire;
    if (!c) $('vierge-attente').textContent = 'En attente d\'une carte vierge…';
    else if (memeCarte) $('vierge-attente').textContent =
      "C'est encore le badge d'origine. Retirez-le et posez une carte vierge.";
    else $('vierge-attente').textContent =
      'Carte vierge detectee (' + (c.uid || '') + '). Prete a ecrire.';
  }

  $('btn-annuler-ecriture').addEventListener('click', function () {
    etape = 'auto'; appliqueEtat(dernierEtat);
  });

  $('btn-ecrire').addEventListener('click', function () {
    etape = 'ecriture'; montre('e-ecriture');
    json('/api/ecrire', { method: 'POST', body: JSON.stringify({ dump: dernierDump }) })
      .then(function (r) {
        etape = 'fini';
        if (!r.ok) { afficheFini(false, r.erreur || 'Ecriture impossible.'); return; }
        var res = r.resultat || {};
        afficheFini(true, 'Copie ecrite sur la carte vierge. ' + res.ecrits + ' zone(s) copiee(s).');
      })
      .catch(function () { etape = 'fini'; afficheFini(false, 'Erreur de communication.'); });
  });

  function afficheFini(ok, msg) {
    $('fini-illus').textContent = ok ? '✓' : '✕';
    $('fini-illus').className = 'illus ' + (ok ? 'ok' : 'ko');
    $('fini-titre').textContent = ok ? 'Copie terminee' : 'La copie a echoue';
    $('fini-detail').textContent = msg;
    montre('e-fini');
  }

  $('btn-recommencer').addEventListener('click', function () {
    etape = 'auto'; dernierDump = null; appliqueEtat(dernierEtat);
  });

  /* --- Enregistrer dans la bibliotheque ----------------------------- */

  $('btn-enregistrer').addEventListener('click', function () {
    etape = 'nom'; $('champ-nom').value = ''; $('modale-nom').hidden = false; $('champ-nom').focus();
  });
  $('nom-annuler').addEventListener('click', fermeNom);
  function fermeNom() { $('modale-nom').hidden = true; etape = 'fini-lecture'; }
  $('nom-ok').addEventListener('click', function () {
    var nom = $('champ-nom').value.trim() || 'carte';
    json('/api/enregistrer', { method: 'POST', body: JSON.stringify({ nom: nom, dump: dernierDump }) })
      .then(function (r) {
        fermeNom();
        if (r.ok) { toast('Badge enregistre.'); chargeBiblio(); }
        else toast('Enregistrement impossible.');
      });
  });
  $('champ-nom').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('nom-ok').click(); });

  /* --- Bibliotheque -------------------------------------------------- */

  function chargeBiblio() {
    json('/api/bibliotheque').then(function (r) {
      var l = $('biblio-liste');
      if (!r.ok || !r.cartes.length) { l.innerHTML = '<p class="vide">Aucun badge enregistre pour l\'instant.</p>'; return; }
      l.innerHTML = '';
      r.cartes.forEach(function (c) {
        var d = document.createElement('div');
        d.className = 'ligne-carte';
        d.innerHTML =
          '<div><div class="nom">' + esc(c.nom) + '</div>' +
          '<div class="meta">' + esc(c.type || '') + ' — ' + esc(c.uid || '') +
          (c.enregistre_le ? ' — ' + esc(c.enregistre_le) : '') + '</div></div>' +
          '<div class="pousse">' +
          '<button type="button" class="mini" data-copier="' + esc(c.fichier) + '">Refaire cette carte</button>' +
          '<button type="button" class="mini fantome" data-suppr="' + esc(c.fichier) + '">Supprimer</button>' +
          '</div>';
        l.appendChild(d);
      });
    });
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-copier],[data-suppr],[data-pose]') : null;
    if (!b) return;
    if (b.hasAttribute('data-pose')) {
      json('/api/demo/pose', { method: 'POST', body: JSON.stringify({ quoi: b.getAttribute('data-pose') }) });
      return;
    }
    if (b.hasAttribute('data-suppr')) {
      var f = b.getAttribute('data-suppr');
      fetch('/api/bibliotheque/' + encodeURIComponent(f), { method: 'DELETE' })
        .then(function () { toast('Supprime.'); chargeBiblio(); });
      return;
    }
    if (b.hasAttribute('data-copier')) {
      var fic = b.getAttribute('data-copier');
      json('/api/bibliotheque/' + encodeURIComponent(fic)).then(function (r) {
        if (!r.ok) { toast('Chargement impossible.'); return; }
        dernierDump = r.carte.dump;
        etape = 'vierge';
        $('btn-ecrire').hidden = true;
        montre('e-vierge');
        majAttenteVierge(dernierEtat);
        toast('Badge « ' + r.carte.nom + ' » charge. Posez une carte vierge.');
      });
    }
  });

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* --- Demarrage ----------------------------------------------------- */
  json('/api/etat').then(appliqueEtat);
  ecoute();
  chargeBiblio();
})();
