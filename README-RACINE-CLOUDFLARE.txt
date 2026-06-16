# Carburio - Tout à la racine

Ce ZIP ne contient AUCUN dossier.

Fichiers à la racine :
- index.html
- style.css
- compare.js
- _worker.js
- confidentialite.html
- mentions-legales.html
- robots.txt
- sitemap.xml

Important :
- _worker.js remplace functions/api/carburants.js
- l'API est disponible sur /api/carburants
- ce projet doit être déployé dans Cloudflare Pages, pas Workers

Réglages Cloudflare Pages :
- Framework preset : None
- Build command : vide
- Build output directory : .
- Root directory : vide

Test :
https://ton-site.pages.dev/api/carburants?q=02700&fuel=e10
