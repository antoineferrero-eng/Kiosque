# Kiosque

Un dashboard auto-hébergé, moderne et entièrement configurable depuis la page. Aucune dépendance : un seul `server.js` (Node 20.12+) et du HTML/CSS/JS.

## Ce qu'il sait faire

| Section | Rôle |
| --- | --- |
| **Applications** | Liens vers tes services ou sites, en liste ou en grille d'icônes, avec pastille en ligne / hors ligne (vérifiée côté serveur, certificats auto-signés et codes HTTP personnalisés acceptés) |
| **Page intégrée** | N'importe quelle page web ou app perso dans une carte (iframe) |
| **Actualités** | Flux RSS côte à côte |
| **YouTube** | Dernières vidéos de tes chaînes, lecture dans la page |
| **E-sport** | Matchs majeurs du jour avec logos, scores et badge « En direct » (clé PandaScore) |
| **Notes** | Notes avec tags colorés et recherche, gardées dans le navigateur |
| **Devine le pays** | Quiz sur les drapeaux |

Et aussi : sections repliables, déplaçables, de largeur réglable, responsive mobile, statut global des services en haut de page.

## Personnaliser

Clique sur le **crayon** en haut à droite et entre le mot de passe admin (`ADMIN_PASSWORD`). En mode édition :

- **+ Section** : ajoute une section (applications, page intégrée, flux, YouTube…)
- **crayon d'une carte** : modifie son titre, son icône, sa couleur, sa largeur et son contenu
- **clic sur une application** : ouvre directement son formulaire ; la tuile **Ajouter** en crée une nouvelle
- **poignée ⋮⋮** : glisse la carte pour la déplacer (ou flèches du clavier)
- **Réglages** : titre, ouverture des liens, vérification des statuts, et la configuration complète en JSON (exporter, importer)

Les modifications sont enregistrées sur le serveur, dans `data/config.json`. Au premier lancement, ce fichier est créé à partir de `config.default.json`.

**Icônes** : `i:nom` (icônes intégrées, proposées dans le champ), `di:nom` (catalogue [dashboardicons.com](https://dashboardicons.com), ex. `di:portainer`), un lien d'image, un emoji, ou `favicon` pour l'icône du site.

**Chaînes YouTube** : colle le lien de la chaîne ou son `@pseudo`, l'identifiant est retrouvé tout seul.

## Variables d'environnement

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `ADMIN_PASSWORD` | non | Mot de passe du mode édition. Vide : dashboard en lecture seule. |
| `PANDASCORE_TOKEN` | non | Clé API [PandaScore](https://app.pandascore.co) (gratuite) pour l'e-sport. Vide : les sections e-sport affichent un message. |
| `PORT` | non | Port d'écoute, `3010` par défaut. |
| `DATA_DIR` | non | Dossier de la config, `data` par défaut (`/app/data` dans Docker). |

En local ou avec Docker Compose, elles se mettent dans un fichier `.env` (copie de `.env.example`). Ce fichier n'est jamais envoyé sur GitHub.

## Lancer en local

```bash
node server.js
```

Puis http://localhost:3010.

## Déployer avec Portainer

1. Pousse le projet sur GitHub.
2. Portainer → **Stacks** → **Add stack**, nom `kiosque`, méthode **Repository**.
3. Repository URL : l'adresse du dépôt. Reference : `refs/heads/main`. Compose path : `docker-compose.yml`.
   Dépôt privé : active **Authentication** (nom d'utilisateur GitHub + *personal access token*).
4. Dans **Environment variables**, ajoute `ADMIN_PASSWORD` et `PANDASCORE_TOKEN` avec tes valeurs.
5. **Deploy the stack**, puis ouvre `http://<ip-du-serveur>:3010`.

La config est gardée dans le volume `kiosque-data` : elle survit aux mises à jour. Pour mettre à jour le code : pousse sur GitHub, puis **Pull and redeploy** dans la stack.

### Sans Portainer

```bash
cp .env.example .env   # puis remplis-le
docker compose up -d --build
```

## Configuration en JSON

Tout ce que fait l'éditeur est enregistré dans `data/config.json`, qu'on peut aussi modifier à la main :

```jsonc
{
  "title": "Kiosque",
  "openIn": "sametab",          // ou "newtab"
  "statusCheck": true,
  "statusInterval": 60,         // secondes
  "sections": [
    {
      "name": "Applications",
      "type": "links",          // links, iframe, rss, youtube, esport, notes, flags
      "icon": "i:server",
      "tint": "#8b9cff",
      "span": 6,                // largeur sur 12 colonnes
      "items": [
        { "title": "Portainer", "url": "https://192.168.1.10:9443", "icon": "di:portainer", "allowInsecure": true }
      ]
    },
    { "name": "Mon app", "type": "iframe", "url": "http://192.168.1.10:8080", "height": 400, "span": 6 }
  ]
}
```

Les options de chaque type sont visibles (et documentées) dans l'éditeur, ou dans `public/schema.js`.

## À savoir

- Certains sites (Google, YouTube, la plupart des banques…) refusent d'être affichés dans une page intégrée.
- Si Kiosque est servi en `https://`, les pages intégrées en `http://` seront bloquées par le navigateur.
- Les notes et le record du quiz sont propres à chaque navigateur.
