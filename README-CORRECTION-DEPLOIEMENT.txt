# Carburio - version corrigée pour ton déploiement actuel

Cette version est faite pour le mode que Cloudflare utilise chez toi :

npx wrangler deploy

Elle contient tout à la racine, avec :
- index.html
- style.css
- compare.js
- _worker.js
- wrangler.jsonc
- .assetsignore
- package.json

Correction de l'erreur :
Cloudflare bloquait car _worker.js était traité comme un fichier public.
Le fichier .assetsignore empêche _worker.js d'être envoyé comme asset public.
Le fichier wrangler.jsonc indique que _worker.js est le script serveur.

Test après déploiement :
https://ton-site.pages.dev/api/carburants?q=02700&fuel=e10

Ou si c'est un Worker :
https://ton-worker.ton-compte.workers.dev/api/carburants?q=02700&fuel=e10
