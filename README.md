## Bot Discord de tâches quotidiennes (famille)

**Fonction**: le bot permet à chaque personne de la famille d’ajouter sa tâche du jour, de la marquer comme faite, et de sortir un rapport en fin de journée pour voir qui a fait sa tâche et qui ne l’a pas faite.

### 1. Pré-requis

- **Node.js** installé (version 18+ recommandée).
- Un **bot Discord** créé dans le [Portal Developer de Discord](https://discord.com/developers/applications) avec un **token**.
- Le bot doit avoir les permissions de:
  - Lire/écrire dans les salons texte.
  - Lire le contenu des messages (Message Content Intent).

### 2. Installation

Dans ton dossier `C:\FAMILLES BOT` :

```bash
npm install
```

Ensuite crée un fichier `.env` dans le même dossier que `index.js` avec:

```bash
DISCORD_TOKEN=TON_TOKEN_DISCORD_ICI
```

Remplace `TON_TOKEN_DISCORD_ICI` par le token de ton bot depuis le portail Discord.

### 3. Lancer le bot

Toujours dans le dossier du projet :

```bash
npm start
```

Si tout est bon, tu verras dans la console quelque chose comme:

```text
Logged in as NOM_DU_BOT#1234
```

### 4. Commandes disponibles (préfixe `!`)

Dans ton serveur Discord (salon texte où le bot a accès) :

- **Ajouter/mettre à jour ta tâche du jour**

  ```text
  !addtask laver la vaisselle
  ```

- **Marquer ta tâche comme faite**

  ```text
  !done
  ```

- **Voir ta tâche du jour**

  ```text
  !mytask
  ```

- **Voir le rapport de fin de journée (qui a fait / pas fait)**  
  (Tu peux déclencher ça manuellement à la fin de la journée.)

  ```text
  !report
  ```

Le rapport va afficher:

- **✅ Ont fait leur tâche**: liste des personnes + leurs tâches.
- **❌ N'ont pas fait leur tâche**: liste des personnes qui n’ont pas marqué `!done`.

### 5. Remarques

- Les tâches sont **stockées en mémoire**: si tu redémarres le bot, les tâches de la journée en cours sont perdues.
- Actuellement le rapport est lancé manuellement avec `!report`. Si tu veux **un envoi automatique à une heure précise** (par ex. 22h), dis-le-moi et je peux te l’ajouter (avec un système de planification).

