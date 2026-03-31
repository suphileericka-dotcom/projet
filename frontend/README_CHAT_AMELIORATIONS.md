# Reperage des ameliorations du chat

Ce document indique a partir de quelles lignes commencent les principales ameliorations apportees au front des salons de groupe.

## 1. Base technique commune

- `src/config/api.ts:1`
  Unification de l'URL API/socket pour ne plus rester bloque sur `localhost`.

- `src/lib/socket.ts:4`
  Socket client raccorde a `SOCKET_URL` partage.

- `src/lib/groupChat.ts:3`
  Fenetre de modification de 20 minutes (`EDIT_WINDOW_MS`) et retention de 24h (`MESSAGE_RETENTION_MS`).

- `src/lib/groupChat.ts:117`
  Regle qui autorise edition/suppression seulement pour le proprietaire du message et dans la limite de 20 minutes.

- `src/lib/groupChat.ts:214`
  Normalisation des messages backend: auteur, avatar, dates fiables, texte, statut modifie.

- `src/lib/groupChat.ts:325`
  Normalisation des listes de messages pour les salons.

- `src/lib/groupChat.ts:374`
  Extraction des infos de typing pour afficher "X ecrit...".

## 2. Comportement du salon de groupe

- `src/components/GroupChatRoom.tsx:109`
  Nouveau composant commun pour tous les salons de groupe.

- `src/components/GroupChatRoom.tsx:196`
  Fusion des messages serveur avec l'etat local sans perdre les traductions deja faites.

- `src/components/GroupChatRoom.tsx:212`
  Rechargement periodique des messages pour voir les nouveaux messages sans quitter le chat.

- `src/components/GroupChatRoom.tsx:244`
  Mise a jour du compteur "en ligne".

- `src/components/GroupChatRoom.tsx:271`
  Reception et insertion des nouveaux messages en temps reel.

- `src/components/GroupChatRoom.tsx:314`
  Gestion de l'indicateur "quelqu'un ecrit...".

- `src/components/GroupChatRoom.tsx:477`
  Envoi de message, remise du message dans la zone de texte en mode modification, sauvegarde de l'edition.

- `src/components/GroupChatRoom.tsx:604`
  Suppression d'un message pour tout le monde.

- `src/components/GroupChatRoom.tsx:690`
  Construction du libelle de typing affiche a l'ecran.

- `src/components/GroupChatRoom.tsx:742`
  Message vide + rappel de l'expiration visuelle apres 24h.

- `src/components/GroupChatRoom.tsx:758`
  Nouveau rendu des messages: plus de centrage, avatar a cote, alignement gauche/droite, actions sur clic.

- `src/components/GroupChatRoom.tsx:847`
  Affichage visuel de l'indicateur de typing dans le flux.

## 3. Responsive et presentation

- `src/style/groupChat.css:147`
  Structure des lignes de message et de l'alignement gauche/droite.

- `src/style/groupChat.css:172`
  Largeur max des bulles pour ne plus casser la lecture.

- `src/style/groupChat.css:388`
  Adaptation tablette.

- `src/style/groupChat.css:410`
  Adaptation telephone: header, avatars, largeur des bulles, composer.

## 4. Themes par salon

- `src/components/Solitude.tsx:7`
- `src/components/Burnout.tsx:7`
- `src/components/Changement.tsx:7`
- `src/components/Expatriation.tsx:7`
- `src/components/Rupture.tsx:7`

Chaque fichier definit maintenant seulement la configuration visuelle et textuelle du salon, tandis que la logique de chat est centralisee dans `GroupChatRoom`.

## 5. Profil local pour les messages

- `src/pages/Login.tsx:93`
  Stockage du `username` a la connexion.

- `src/pages/Register.tsx:142`
  Stockage du `username` a l'inscription.

- `src/pages/MySpace.tsx:117`
- `src/pages/MySpace.tsx:118`
- `src/pages/MySpace.tsx:153`
- `src/pages/MySpace.tsx:154`
  Synchronisation du `username` et de l'avatar local pour l'affichage des messages.

## 6. Note importante

L'expiration 24h est appliquee cote interface dans le front. Si tu veux une suppression physique en base de donnees au bout de 24h, il faudra ajouter la purge cote backend aussi.
