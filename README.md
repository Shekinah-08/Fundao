# FUNDDAO — DAO de gestion transparente d'un fonds associatif étudiant

Prototype académique de gouvernance décentralisée pour Ethereum Sepolia. Il met en œuvre un jeton de gouvernance ERC20Votes, OpenZeppelin Governor, TimelockController comme trésorerie, et une DApp Next.js connectée avec wagmi/viem et MetaMask.

> **Réseau de test uniquement.** Ce dépôt est un prototype pédagogique, pas un produit audité. Ne l'utilisez pas avec des fonds réels. La compilation, les tests, le déploiement et le parcours multi-portefeuilles doivent être validés dans votre environnement avant une démonstration.

## Fonctionnalités

- Connexion de portefeuille MetaMask sur Sepolia.
- Jeton FEG basé sur ERC20Votes et ERC20Permit.
- Faucet de test : une adresse peut réclamer 100 FEG une fois; les voix sont auto-déléguées pour rendre le vote immédiatement accessible.
- Distribution administrative de jetons via `mintMember`.
- Création de propositions de dépenses (cible, montant, calldata et description).
- Vote pondéré Pour / Contre / Abstention avec snapshots ERC20Votes.
- Quorum de 20 % de l'offre totale au snapshot.
- OpenZeppelin Governor avec délai de vote, période de vote et seuil de proposition configurés.
- TimelockController : détient les ETH de trésorerie, impose un délai d'exécution de 1 heure et autorise l'exécution publique après le délai.
- Interface web premium sombre (violet/vert/bleu), dashboard, propositions, votes, trésorerie, membres et activité.
- Déploiement des contrats sur Sepolia et de l'interface sur Vercel.

## Architecture technique

| Couche | Technologie | Rôle |
|---|---|---|
| Jeton | Solidity + OpenZeppelin ERC20Votes | Soldes et poids de vote |
| Gouvernance | OpenZeppelin Governor | Propositions, vote, quorum et résultats |
| Exécution | OpenZeppelin TimelockController | Délai de sécurité et exécution |
| Développement | Hardhat | Compilation, tests et déploiement |
| DApp | Next.js 15 + React | Interface utilisateur |
| Web3 | wagmi + viem + RainbowKit | Connexion et appels de contrats |
| Portefeuille | MetaMask | Signature des transactions |
| Réseau | Ethereum Sepolia | Réseau de démonstration |
| Hébergement | Vercel | Hébergement du frontend |

## Paramètres du prototype

- Symbole du jeton : `FEG`.
- Faucet : `100 FEG` par adresse, une seule fois.
- Seuil de proposition : `1 FEG`.
- Délai de vote : `1 bloc`.
- Période de vote : `7200 blocs`.
- Quorum : `20 %` de l'offre totale au snapshot.
- Délai Timelock : `3600 secondes`.

Le délai de vote est exprimé en blocs : sa durée réelle varie selon la production des blocs Sepolia. Le quorum est pondéré par les voix et dépend de l'offre totale au snapshot. Comme le faucet public augmente cette offre, le quorum augmente aussi au fur et à mesure des réclamations.

## Prérequis

- Node.js 20.9 ou plus récent et npm.
- MetaMask.
- Une URL RPC Sepolia (Alchemy, Infura ou fournisseur équivalent).
- Un portefeuille de déploiement dédié au test, approvisionné en Sepolia ETH.
- Des Sepolia ETH sur chaque portefeuille participant pour payer ses propres frais de transaction.

## Installation et déploiement des contrats

Depuis la racine `dao-etudiante/` :

```bash
npm install
cp .env.example .env
```

Renseignez `.env` :

```env
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/VOTRE_CLE
DEPLOYER_PRIVATE_KEY=VOTRE_CLE_PRIVEE_SANS_0x
ETHERSCAN_API_KEY=VOTRE_CLE_ETHERSCAN
```

Ne partagez jamais la clé privée, ne la placez jamais dans le frontend et ne commitez jamais `.env`. Utilisez un portefeuille dédié qui ne contient aucun actif réel.

Compilez et testez :

```bash
npm run compile
npm test
```

Déployez :

```bash
npm run deploy:sepolia
```

Les adresses sont écrites dans `deployments/sepolia.json`. Le script configure les rôles du Timelock : Governor proposer/canceller, exécution ouverte à tous après le délai, puis renonce au rôle administrateur temporaire du Timelock. Le propriétaire du token reste le compte de déploiement afin de pouvoir distribuer les jetons membres via `mintMember`.

**Trésorerie :** l'adresse du Timelock est également l'adresse de la trésorerie. Envoyez uniquement des ETH Sepolia à cette adresse. Les propositions de dépenses sont des opérations exécutées par le Governor via le Timelock.

## Configuration du frontend

```bash
cd frontend
npm install
cp .env.example .env.local
```

Renseignez les adresses obtenues dans `deployments/sepolia.json` :

```env
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_GOVERNOR_ADDRESS=0x...
NEXT_PUBLIC_TIMELOCK_ADDRESS=0x...
NEXT_PUBLIC_TREASURY_ADDRESS=0x...
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=VOTRE_PROJECT_ID
```

Lancez en local :

```bash
npm run dev
```

Ouvrez `http://localhost:3000`, connectez MetaMask et sélectionnez Ethereum Sepolia.

Avant hébergement, validez :

```bash
npm run lint
npm run build
```

## Parcours de test multi-participants

1. Chaque participant installe MetaMask et choisit Sepolia.
2. Chaque portefeuille obtient du Sepolia ETH depuis un faucet de test afin de payer le gas.
3. Chaque participant connecte son portefeuille à FUNDDAO.
4. Dans l'espace Membres, il réclame 100 FEG. Le contrat autorise une réclamation par adresse et auto-délègue les voix.
5. Un membre éligible crée une proposition de dépense.
6. Les participants votent Pour, Contre ou Abstention pendant la période de vote.
7. Après le vote, le Governor détermine le résultat et le quorum.
8. Si elle est adoptée, la proposition est mise en file dans le Timelock.
9. Après le délai de 3600 secondes, n'importe quel compte peut déclencher l'exécution.
10. Le bénéficiaire reçoit les ETH Sepolia et les événements sont consultables sur Sepolia Etherscan.

## Déploiement sur Vercel

Importer le dossier `frontend/` comme projet Next.js dans Vercel. Ajouter les variables `NEXT_PUBLIC_*` dans les paramètres du projet, puis déployer. Les contrats restent sur Sepolia. Les variables publiques ne doivent contenir que des adresses de contrats et identifiants publics, jamais de clé privée.

## Limites connues et précautions

- Le faucet public facilite une démonstration ouverte, mais une personne peut créer plusieurs portefeuilles. Il ne prouve donc pas l'identité ni l'appartenance à l'association (attaque Sybil).
- Les FEG et ETH Sepolia sont des actifs de test sans valeur monétaire réelle. Les frais réseau sont néanmoins payés en Sepolia ETH.
- Le quorum de 20 % s'applique à l'offre totale au snapshot; l'utilisation du faucet modifie donc le nombre de voix nécessaires.
- L'indexation de l'interface est limitée à une fenêtre récente d'événements. Pour un historique complet et paginé à grande échelle, intégrer un indexeur dédié (The Graph ou service équivalent).
- L'émission administrative `mintMember` est centralisée dans ce prototype. Avant une utilisation réelle, encadrer l'émission par multisignature ou gouvernance.
- Ce prototype n'inclut pas d'audit indépendant. Ajouter des tests d'intégration, fuzzing, tests d'invariants, revue des rôles et audit avant tout usage réel.

## Vérification de la démonstration

Consultez `DEPLOYMENT_CHECKLIST.md` pour la liste de contrôle de compilation, tests, déploiement et scénario de démonstration.

## Documentation officielle

- OpenZeppelin Governor : https://docs.openzeppelin.com/contracts/5.x/governance
- OpenZeppelin Contracts : https://docs.openzeppelin.com/contracts/5.x/
- Hardhat : https://hardhat.org/docs
- Next.js : https://nextjs.org/docs
- wagmi : https://wagmi.sh
- Vercel : https://vercel.com/docs
