# Checklist de validation FUNDDAO

## Avant tout déploiement Sepolia

- [ ] Node.js 20.9+ installé.
- [ ] Créer un portefeuille dédié au test; ne jamais utiliser un portefeuille contenant des fonds réels.
- [ ] Obtenir une URL RPC Sepolia et des ETH Sepolia pour le gas.
- [ ] Copier `.env.example` vers `.env` et remplir les variables.
- [ ] Exécuter `npm ci` (ou `npm install` si aucun lockfile n'est fourni).
- [ ] Exécuter `npm run compile` sans erreur.
- [ ] Exécuter `npm test` et vérifier que tous les tests passent.
- [ ] Déployer avec `npm run deploy:sepolia`.
- [ ] Vérifier les adresses dans `deployments/sepolia.json`.
- [ ] Envoyer uniquement des ETH Sepolia à l'adresse Timelock (trésorerie).
- [ ] Copier les adresses de déploiement dans `frontend/.env.local`.
- [ ] Exécuter `npm run build` dans `frontend`.
- [ ] Tester le parcours complet avec plusieurs portefeuilles MetaMask distincts.

## Scénario fonctionnel à tester

1. Un portefeuille réclame 100 FEG via le faucet de test.
2. Un second portefeuille réclame également 100 FEG.
3. Un membre crée une proposition de transfert d'ETH Sepolia vers un bénéficiaire.
4. Attendre le délai de vote configuré (7200 blocs dans cette configuration).
5. Les membres votent Pour / Contre / Abstention pendant la période ouverte.
6. Vérifier l'état, les résultats et le quorum au snapshot.
7. Si la proposition est adoptée, la mettre en file dans le Timelock.
8. Attendre au moins 3600 secondes après la mise en file.
9. Exécuter la proposition et vérifier le transfert et les événements sur Sepolia Etherscan.

## Paramètres et limites importantes

- Le quorum est de 20 % de l'offre totale de FEG au snapshot. Le faucet public augmente l'offre totale à chaque nouvelle adresse.
- Le faucet est uniquement destiné à un réseau de test. Il n'est pas une preuve d'identité : une personne peut contrôler plusieurs portefeuilles.
- Chaque action on-chain nécessite du Sepolia ETH pour payer le gas.
- Le délai de vote est exprimé en blocs, pas en heures exactes.
- Le Timelock détient la trésorerie. Le Governor est le proposer/canceller et l'exécution est ouverte après le délai.
- L'administrateur du token peut émettre des FEG via `mintMember`. Cette permission doit être encadrée (multisig ou gouvernance) avant une utilisation réelle.
- Ne jamais utiliser de fonds réels avant audit indépendant, revue des permissions, tests de sécurité et procédure de récupération.
