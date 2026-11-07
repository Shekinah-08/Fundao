'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  useAccount,
  useBalance,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from 'wagmi';
import {
  formatEther,
  parseEther,
  isAddress,
  keccak256,
  stringToHex,
  parseAbiItem,
  type Address,
} from 'viem';
import { TOKEN_ABI, GOVERNOR_ABI } from '../lib/contracts';
import { appChain } from '../lib/wagmi';

type Proposal = {
  id: string;
  proposer: string;
  recipient: string;
  amount: string;
  description: string;
  voteStart: string;
  voteEnd: string;
  forVotes?: string;
  againstVotes?: string;
  abstainVotes?: string;
  state?: number;
};

const tokenAddress = process.env.NEXT_PUBLIC_TOKEN_ADDRESS as Address | undefined;
const governorAddress = process.env.NEXT_PUBLIC_GOVERNOR_ADDRESS as Address | undefined;
const treasuryAddress = (
  process.env.NEXT_PUBLIC_TREASURY_ADDRESS ||
  process.env.NEXT_PUBLIC_TIMELOCK_ADDRESS
) as Address | undefined;

const activeChain = appChain;

const statusNames = [
  'En attente',
  'En cours',
  'Annulée',
  'Rejetée',
  'Adoptée',
  'Programmée',
  'Expirée',
  'Exécutée',
];

const nav = [
  ['overview', '◫', 'Vue générale'],
  ['proposals', '▤', 'Propositions'],
  ['treasury', '◈', 'Trésorerie'],
  ['members', '♙', 'Membres'],
  ['activity', '↗', 'Activité'],
  ['settings', '⚙', 'Paramètres'],
];

const short = (s: string) =>
  s ? `${s.slice(0, 6)}…${s.slice(-4)}` : '—';

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function retryRpc<T>(
  operation: () => Promise<T>,
  attempts = 4
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;

      const message =
        err instanceof Error ? err.message.toLowerCase() : '';

      const isRateLimit =
        message.includes('429') ||
        message.includes('rate limit') ||
        message.includes('too many requests') ||
        message.includes('request exceeds defined limit');

      if (!isRateLimit || attempt === attempts - 1) {
        throw err;
      }

      const delay = 1500 * Math.pow(2, attempt);
      console.warn(
        `RPC limité. Nouvelle tentative dans ${delay} ms...`
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

export default function Home() {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient({ chainId: activeChain.id });

  const [tab, setTab] = useState('overview');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);

  const loadingRef = useRef(false);

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('0.05');
  const [description, setDescription] = useState(
    'Financement du matériel informatique de l’association'
  );

  const [voteId, setVoteId] = useState('');
  const [delegatee, setDelegatee] = useState('');
  const [mintMember, setMintMember] = useState('');
  const [mintAmount, setMintAmount] = useState('100');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<Proposal | null>(null);

  const {
    data: balance,
    refetch: refreshBalance,
  } = useReadContract({
    address: tokenAddress,
    abi: TOKEN_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!tokenAddress && !!address },
  });

  const {
    data: votes,
    refetch: refreshVotes,
  } = useReadContract({
    address: tokenAddress,
    abi: TOKEN_ABI,
    functionName: 'getVotes',
    args: address ? [address] : undefined,
    query: { enabled: !!tokenAddress && !!address },
  });

  const { data: supply } = useReadContract({
    address: tokenAddress,
    abi: TOKEN_ABI,
    functionName: 'totalSupply',
    query: { enabled: !!tokenAddress },
  });

  const { data: owner } = useReadContract({
    address: tokenAddress,
    abi: TOKEN_ABI,
    functionName: 'owner',
    query: { enabled: !!tokenAddress },
  });

  const {
    data: claimed,
    refetch: refreshClaim,
  } = useReadContract({
    address: tokenAddress,
    abi: TOKEN_ABI,
    functionName: 'hasClaimedTestTokens',
    args: address ? [address] : undefined,
    query: { enabled: !!tokenAddress && !!address },
  });

  const {
    data: treasury,
    refetch: refreshTreasury,
  } = useBalance({
    address: treasuryAddress,
    chainId: activeChain.id,
    query: { enabled: !!treasuryAddress },
  });

  const {
    writeContract,
    data: hash,
    isPending,
    error,
  } = useWriteContract();

  const {
    isLoading: confirming,
    isSuccess,
  } = useWaitForTransactionReceipt({ hash });

  const ready = !!tokenAddress && !!governorAddress && !!treasuryAddress;

  const admin =
    !!address &&
    !!owner &&
    address.toLowerCase() === owner.toLowerCase();

  const wrongNetwork = !!chain && chain.id !== activeChain.id;

  const txMessage = error
    ? error.message.slice(0, 150)
    : isPending
      ? 'En attente de signature dans MetaMask…'
      : confirming
        ? `Transaction envoyée, confirmation sur ${activeChain.name}…`
        : isSuccess
          ? 'Transaction confirmée sur la blockchain.'
          : notice;

  // Chargement progressif des propositions avec limitation des appels RPC.
  const loadProposals = useCallback(async () => {
    if (!publicClient || !governorAddress) return;

    // Empêche plusieurs chargements simultanés.
    if (loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    setNotice('');

    try {
      const latest = await retryRpc(() =>
        publicClient.getBlockNumber()
      );

      const totalBlocks = 9000n;

      // Réduction de la taille des lots pour éviter les erreurs 429.
      const blockRange = 500n;

      const fromBlock =
        latest > totalBlocks ? latest - totalBlocks : 0n;

      const event = parseAbiItem(
        'event ProposalCreated(uint256 proposalId,address proposer,address[] targets,uint256[] values,string[] signatures,bytes[] calldatas,uint256 voteStart,uint256 voteEnd,string description)'
      );

      const allLogs: any[] = [];

      for (
        let start = fromBlock;
        start <= latest;
        start += blockRange
      ) {
        const end =
          start + blockRange - 1n > latest
            ? latest
            : start + blockRange - 1n;

        const logs = await retryRpc(() =>
          publicClient.getLogs({
            address: governorAddress,
            event,
            fromBlock: start,
            toBlock: end,
          })
        );

        allLogs.push(...logs);

        // Pause entre les requêtes RPC.
        await sleep(350);
      }

      const rows: Proposal[] = [];

      // Lecture séquentielle pour éviter Promise.all et les rafales RPC.
      for (const log of allLogs) {
        const id = String(log.args.proposalId);

        let state: number | undefined;
        let pv: readonly [bigint, bigint, bigint] | undefined;

        try {
          state = Number(
            await retryRpc(() =>
              publicClient.readContract({
                address: governorAddress,
                abi: GOVERNOR_ABI,
                functionName: 'state',
                args: [BigInt(id)],
              })
            )
          );

          await sleep(200);

          pv = await retryRpc(() =>
            publicClient.readContract({
              address: governorAddress,
              abi: GOVERNOR_ABI,
              functionName: 'proposalVotes',
              args: [BigInt(id)],
            })
          ) as readonly [bigint, bigint, bigint];

        } catch (err) {
          console.error(
            `Erreur lecture proposition ${id}:`,
            err
          );
        }

        rows.push({
          id,
          proposer: String(log.args.proposer || ''),
          recipient: String(log.args.targets?.[0] || ''),
          amount: formatEther(log.args.values?.[0] || 0n),
          description: String(log.args.description || ''),
          voteStart: String(log.args.voteStart || ''),
          voteEnd: String(log.args.voteEnd || ''),
          state,
          againstVotes: pv ? formatEther(pv[0]) : '0',
          forVotes: pv ? formatEther(pv[1]) : '0',
          abstainVotes: pv ? formatEther(pv[2]) : '0',
        });

        // Petite pause entre les propositions.
        await sleep(200);
      }

      setProposals(rows.reverse());

    } catch (err) {
      console.error('Erreur complète loadProposals:', err);

      setNotice(
        err instanceof Error
          ? `Erreur de chargement : ${err.message}`
          : 'Impossible de charger les propositions.'
      );

    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [publicClient]);

  useEffect(() => {
    void loadProposals();
  }, [loadProposals]);

  useEffect(() => {
    if (!isSuccess) return;

    void refreshBalance();
    void refreshVotes();
    void refreshTreasury();
    void refreshClaim();

    // Petit délai après la confirmation de la transaction.
    const timer = setTimeout(() => {
      void loadProposals();
    }, 1500);

    return () => clearTimeout(timer);
  }, [
    isSuccess,
    refreshBalance,
    refreshVotes,
    refreshTreasury,
    refreshClaim,
    loadProposals,
  ]);

  const totalTreasury = treasury
    ? Number(formatEther(treasury.value))
    : 0;

  const active = proposals.filter((p) => p.state === 1).length;

  const passed = proposals.filter(
    (p) => p.state === 4 || p.state === 5 || p.state === 7
  ).length;

  const sendProposal = () => {
    try {
      if (!ready) throw Error('Configurez les adresses des contrats.');
      if (!address) throw Error('Connectez votre portefeuille.');
      if (wrongNetwork) throw Error('Passez sur Ethereum Sepolia.');

      if (
        !isAddress(recipient) ||
        !Number.isFinite(Number(amount)) ||
        Number(amount) <= 0 ||
        !description.trim()
      ) {
        throw Error('Vérifiez le bénéficiaire, le montant et la description.');
      }

      writeContract({
        address: governorAddress!,
        abi: GOVERNOR_ABI,
        functionName: 'propose',
        args: [
          [recipient as Address],
          [parseEther(amount)],
          ['0x'],
          description.trim(),
        ],
      });
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  const cast = (support: number, id?: string) => {
    try {
      if (!ready) throw Error('Contrats non configurés.');
      if (!address) throw Error('Connectez votre portefeuille.');
      if (wrongNetwork) throw Error('Passez sur Ethereum Sepolia.');

      const target = id || voteId;

      if (!target || !/^\d+$/.test(target) || BigInt(target) <= 0n) {
        throw Error('Identifiant de proposition invalide.');
      }

      writeContract({
        address: governorAddress!,
        abi: GOVERNOR_ABI,
        functionName: 'castVote',
        args: [BigInt(target), support],
      });
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  const queueOrExecute = (action: 'queue' | 'execute') => {
    try {
      if (!selected) throw Error('Sélectionnez une proposition.');
      if (!address) throw Error('Connectez votre portefeuille.');
      if (wrongNetwork) throw Error('Passez sur Ethereum Sepolia.');

      const descHash = keccak256(stringToHex(selected.description));

      writeContract({
        address: governorAddress!,
        abi: GOVERNOR_ABI,
        functionName: action,
        args: [
          [selected.recipient as Address],
          [parseEther(selected.amount)],
          ['0x'],
          descHash,
        ],
      });
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  const delegate = () => {
    try {
      if (!address) throw Error('Connectez votre portefeuille.');
      if (wrongNetwork) throw Error('Passez sur Ethereum Sepolia.');

      const to = delegatee || address;

      if (!to || !isAddress(to)) {
        throw Error('Adresse de délégation invalide.');
      }

      writeContract({
        address: tokenAddress!,
        abi: TOKEN_ABI,
        functionName: 'delegate',
        args: [to],
      });
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  const claimTestTokens = () => {
    try {
      if (!address) throw Error('Connectez MetaMask.');
      if (!ready) throw Error('Les contrats Sepolia ne sont pas configurés.');
      if (wrongNetwork) throw Error('Passez sur Ethereum Sepolia.');
      if (claimed) throw Error('Ce portefeuille a déjà réclamé ses jetons.');

      writeContract({
        address: tokenAddress!,
        abi: TOKEN_ABI,
        functionName: 'claimTestTokens',
      });
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  const mint = () => {
    try {
      if (!admin) {
        throw Error('Seul le propriétaire du contrat peut distribuer les FEG.');
      }

      if (wrongNetwork) throw Error('Passez sur Ethereum Sepolia.');

      if (
        !isAddress(mintMember) ||
        !Number.isFinite(Number(mintAmount)) ||
        Number(mintAmount) <= 0
      ) {
        throw Error('Adresse ou quantité invalide.');
      }

      writeContract({
        address: tokenAddress!,
        abi: TOKEN_ABI,
        functionName: 'mintMember',
        args: [mintMember, parseEther(mintAmount)],
      });
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  const pageTitle = nav.find((n) => n[0] === tab)?.[2] || 'Vue générale';

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">F<span>✦</span></div>
          <div>
            <b>FUND<span>DAO</span></b>
            <small>STUDENT GOVERNANCE</small>
          </div>
        </div>

        <div className="workspace">
          <span className="workspace-icon">✦</span>
          <div>
            <b>Association étudiante</b>
            <small>Organisation · Sepolia</small>
          </div>
          <span className="chevron">⌄</span>
        </div>

        <div className="nav-label">ESPACE DE TRAVAIL</div>

        <nav>
          {nav.map(([id, ico, label]) => (
            <button
              key={id}
              className={tab === id ? 'nav-item active' : 'nav-item'}
              onClick={() => {
                setTab(id);
                setSelected(null);
              }}
            >
              <span className="nav-icon">{ico}</span>
              {label}
              {id === 'proposals' && active > 0 && <em>{active}</em>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="network-card">
            <span className="pulse" /> Réseau Sepolia <small>TESTNET</small>
          </div>

          <div className="help-card">
            <div className="help-orb">?</div>
            <b>Besoin d'aide ?</b>
            <p>Consultez le guide de gouvernance et les règles de la DAO.</p>
            <a
              href="https://docs.openzeppelin.com/contracts/5.x/governance"
              target="_blank"
              rel="noreferrer"
            >
              Centre d'aide ↗
            </a>
          </div>

          <div className="user-mini">
            <div className="avatar">{address ? 'M' : '?'}</div>
            <div>
              <b>{address ? short(address) : 'Visiteur'}</b>
              <small>{admin ? 'Administrateur' : 'Membre / invité'}</small>
            </div>
            <span>•••</span>
          </div>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            FUNDDAO <span>/</span> <b>{pageTitle}</b>
          </div>

          <div className="top-actions">
            <div className="secure-pill">
              <span className="pulse" /> Système opérationnel
            </div>

            <button
              className="icon-btn"
              title="Actualiser"
              onClick={() => void loadProposals()}
              disabled={loading}
            >
              ⟳
            </button>

            <button className="icon-btn" title="Notifications">
              ♧<i />
            </button>

            <ConnectButton />
          </div>
        </header>

        <div className="content">
          <div className="welcome-row">
            <div>
              <div className="eyebrow">
                <span className="spark">✦</span>{' '}
                ORGANISATION AUTONOME DÉCENTRALISÉE
              </div>

              <h1>
                {tab === 'overview'
                  ? 'Votre gouvernance,'
                  : 'Espace ' + pageTitle.toLowerCase()}{' '}
                <span>
                  {tab === 'overview' ? 'en toute transparence.' : ''}
                </span>
              </h1>

              <p className="subtitle">
                Pilotez les décisions collectives et suivez chaque mouvement
                du fonds associatif.
              </p>
            </div>

            <div className="date-chip">◷ &nbsp; Données blockchain · Sepolia</div>
          </div>

          {(!ready || wrongNetwork) && (
            <div className="alert">
              <b>
                ⚠ {wrongNetwork ? 'Réseau incorrect' : 'Configuration requise'}
              </b>
              <span>
                {wrongNetwork
                  ? 'Connectez MetaMask au réseau Ethereum Sepolia.'
                  : 'Ajoutez les adresses du Token, du Governor et du Timelock dans frontend/.env.local.'}
              </span>
            </div>
          )}

          {txMessage && (
            <div className="tx-alert">
              <span>◈</span>
              <div>
                {txMessage}
                {hash && (
                  <a
                    href={`https://sepolia.etherscan.io/tx/${hash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {' '}Voir sur Etherscan ↗
                  </a>
                )}
              </div>
              <button onClick={() => setNotice('')}>×</button>
            </div>
          )}

          {tab === 'overview' && (
            <>
              <div className="metric-grid">
                <article className="metric-card treasury-card">
                  <div className="metric-top">
                    <span>TRÉSORERIE TOTALE</span>
                    <span className="metric-icon purple">◈</span>
                  </div>
                  <div className="metric-value">
                    {treasury ? totalTreasury.toFixed(4) : '—'} <small>ETH</small>
                  </div>
                  <div className="metric-foot">
                    <span className="green-dot" /> Solde réel du contrat Timelock
                  </div>
                  <div className="sparkline">
                    <svg viewBox="0 0 300 48" preserveAspectRatio="none">
                      <path d="M0 39 C20 35 23 20 42 27 S65 42 82 24 S110 16 126 22 S147 35 165 18 S188 25 207 12 S231 22 250 9 S278 15 300 3" />
                      <path
                        className="spark-fill"
                        d="M0 39 C20 35 23 20 42 27 S65 42 82 24 S110 16 126 22 S147 35 165 18 S188 25 207 12 S231 22 250 9 S278 15 300 3 V48 H0Z"
                      />
                    </svg>
                  </div>
                </article>

                <article className="metric-card">
                  <div className="metric-top">
                    <span>MEMBRES / JETONS ÉMIS</span>
                    <span className="metric-icon blue">♙</span>
                  </div>
                  <div className="metric-value">
                    {supply !== undefined
                      ? Number(formatEther(supply)).toLocaleString('fr-FR')
                      : '—'} <small>FEG</small>
                  </div>
                  <div className="metric-foot">Offre totale du jeton de gouvernance</div>
                  <div className="metric-bottom">
                    <span>Votre solde</span>
                    <b>
                      {balance !== undefined
                        ? Number(formatEther(balance)).toLocaleString('fr-FR')
                        : '—'} FEG
                    </b>
                  </div>
                </article>

                <article className="metric-card">
                  <div className="metric-top">
                    <span>PROPOSITIONS ACTIVES</span>
                    <span className="metric-icon orange">▤</span>
                  </div>
                  <div className="metric-value">
                    {active.toString().padStart(2, '0')}
                  </div>
                  <div className="metric-foot">En attente de décision des membres</div>
                  <div className="metric-bottom">
                    <span>Total enregistrées</span>
                    <b>{proposals.length}</b>
                  </div>
                </article>

                <article className="metric-card">
                  <div className="metric-top">
                    <span>DÉCISIONS ADOPTÉES</span>
                    <span className="metric-icon green">✓</span>
                  </div>
                  <div className="metric-value">
                    {passed.toString().padStart(2, '0')}
                  </div>
                  <div className="metric-foot">Adoptées, programmées ou exécutées</div>
                  <div className="metric-bottom">
                    <span>Participation</span>
                    <b>{proposals.length ? 'On-chain' : '—'}</b>
                  </div>
                </article>
              </div>

              <div className="dashboard-grid">
                <section className="surface chart-panel">
                  <div className="surface-head">
                    <div>
                      <h2>Vue financière</h2>
                      <p>État du fonds et indicateurs de gouvernance</p>
                    </div>
                    <span className="tag-live"><i /> LIVE · SEPOLIA</span>
                  </div>

                  <div className="chart-summary">
                    <div>
                      <small>Solde actuel</small>
                      <b>{treasury ? totalTreasury.toFixed(4) + ' ETH' : '— ETH'}</b>
                    </div>
                    <div>
                      <small>Pouvoir de vote</small>
                      <b>
                        {votes !== undefined
                          ? Number(formatEther(votes)).toLocaleString('fr-FR')
                          : '—'} <small>FEG</small>
                      </b>
                    </div>
                  </div>

                  <div className="chart-area">
                    <div className="y-labels">
                      <span>100%</span><span>75%</span><span>50%</span>
                      <span>25%</span><span>0%</span>
                    </div>
                    <div className="chart-plot">
                      <div className="grid-lines">
                        {[1, 2, 3, 4, 5].map((n) => <i key={n} />)}
                      </div>
                      <div className="bars">
                        {[34, 48, 42, 65, 53, 75, 62, 86, 72, 92, 77, 100].map(
                          (h, i) => (
                            <div key={i} className="bar-wrap">
                              <div
                                className={i === 11 ? 'bar latest' : 'bar'}
                                style={{ height: `${h}%` }}
                              />
                            </div>
                          )
                        )}
                      </div>
                      <div className="x-labels">
                        <span>Sem. 1</span><span>Sem. 2</span>
                        <span>Sem. 3</span><span>Sem. 4</span>
                      </div>
                    </div>
                  </div>

                  <div className="chart-legend">
                    <span><i className="legend-purple" /> Activité de gouvernance (illustration)</span>
                    <span className="chart-note">Graphique indicatif · historique financier à indexer</span>
                  </div>
                </section>

                <section className="surface vote-panel">
                  <div className="surface-head">
                    <div>
                      <h2>Votre pouvoir de décision</h2>
                      <p>Vos droits de gouvernance</p>
                    </div>
                    <span className="metric-icon purple">◉</span>
                  </div>

                  <div className="vote-ring">
                    <div>
                      <b>
                        {votes !== undefined
                          ? Number(formatEther(votes)).toLocaleString('fr-FR')
                          : '—'}
                      </b>
                      <small>FEG actifs</small>
                    </div>
                  </div>

                  <div className="vote-info">
                    <span>Jetons détenus</span>
                    <b>
                      {balance !== undefined
                        ? Number(formatEther(balance)).toLocaleString('fr-FR')
                        : '—'} FEG
                    </b>
                  </div>
                  <div className="vote-info">
                    <span>Voix déléguées</span>
                    <b>
                      {votes !== undefined
                        ? Number(formatEther(votes)).toLocaleString('fr-FR')
                        : '—'} FEG
                    </b>
                  </div>
                  <button className="btn-secondary full" onClick={() => setTab('members')}>
                    Gérer ma délégation ↗
                  </button>
                </section>
              </div>

              <section className="surface proposals-surface">
                <div className="surface-head">
                  <div>
                    <h2>Propositions récentes</h2>
                    <p>Les dernières décisions soumises à la communauté</p>
                  </div>
                  <button className="text-link" onClick={() => setTab('proposals')}>
                    Voir toutes les propositions ↗
                  </button>
                </div>
                <ProposalTable
                  proposals={proposals.slice(0, 4)}
                  onSelect={(p) => {
                    setSelected(p);
                    setTab('proposals');
                  }}
                  loading={loading}
                />
              </section>
            </>
          )}

          {tab === 'proposals' && (
            <div className="page-grid">
              <section className="surface form-surface">
                <div className="surface-head">
                  <div>
                    <h2>Créer une proposition</h2>
                    <p>Soumettez une dépense à la décision collective.</p>
                  </div>
                  <span className="metric-icon purple">＋</span>
                </div>

                <label>Adresse du bénéficiaire</label>
                <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x…" />

                <label>Montant à transférer (ETH)</label>
                <input type="number" min="0" step="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} />

                <label>Objet et justification</label>
                <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />

                <button
                  className="btn-primary full"
                  disabled={!ready || !address || isPending || wrongNetwork}
                  onClick={sendProposal}
                >
                  Soumettre au vote <span>↗</span>
                </button>

                <p className="form-hint">
                  La création nécessite au moins 1 FEG de pouvoir de vote et une délégation active.
                  La proposition sera enregistrée sur Sepolia.
                </p>
              </section>

              <section className="surface list-surface">
                <div className="surface-head">
                  <div>
                    <h2>Registre des propositions</h2>
                    <p>{proposals.length} proposition(s) trouvée(s) sur la blockchain</p>
                  </div>
                  <button className="icon-btn" onClick={() => void loadProposals()} disabled={loading}>⟳</button>
                </div>
                <ProposalTable proposals={proposals} onSelect={setSelected} loading={loading} />
              </section>

              {selected && (
                <section className="surface detail-surface">
                  <div className="surface-head">
                    <div>
                      <h2>Détail de la proposition</h2>
                      <p>ID #{selected.id}</p>
                    </div>
                    <button className="icon-btn" onClick={() => setSelected(null)}>×</button>
                  </div>

                  <p>{selected.description}</p>

                  <div className="detail-grid">
                    <div><small>Bénéficiaire</small><b>{short(selected.recipient)}</b></div>
                    <div><small>Montant demandé</small><b>{selected.amount} ETH</b></div>
                    <div><small>Proposant</small><b>{short(selected.proposer)}</b></div>
                    <div><small>État</small><b>{statusNames[selected.state ?? 0] || 'Inconnu'}</b></div>
                  </div>

                  <label>Identifiant pour voter</label>
                  <input value={voteId} onChange={(e) => setVoteId(e.target.value)} placeholder={selected.id} />

                  <div className="vote-actions">
                    <button
                      className="btn-primary"
                      disabled={!ready || isPending || wrongNetwork || selected.state !== 1}
                      onClick={() => cast(1, selected.id)}
                    >✓ Pour</button>
                    <button
                      className="btn-danger"
                      disabled={!ready || isPending || wrongNetwork || selected.state !== 1}
                      onClick={() => cast(0, selected.id)}
                    >✕ Contre</button>
                    <button
                      className="btn-secondary"
                      disabled={!ready || isPending || wrongNetwork || selected.state !== 1}
                      onClick={() => cast(2, selected.id)}
                    >Abstention</button>
                  </div>

                  <div className="vote-results">
                    <span>Pour <b>{selected.forVotes || '0'} FEG</b></span>
                    <span>Contre <b>{selected.againstVotes || '0'} FEG</b></span>
                    <span>Abstention <b>{selected.abstainVotes || '0'} FEG</b></span>
                  </div>

                  {(selected.state === 4 || selected.state === 5) && (
                    <div className="vote-actions">
                      <button
                        className="btn-secondary"
                        disabled={!ready || isPending || wrongNetwork || selected.state !== 4}
                        onClick={() => queueOrExecute('queue')}
                      >Mettre en file</button>
                      <button
                        className="btn-primary"
                        disabled={!ready || isPending || wrongNetwork || selected.state !== 5}
                        onClick={() => queueOrExecute('execute')}
                      >Exécuter après délai ↗</button>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {tab === 'treasury' && (
            <div className="page-grid treasury-page">
              <section className="surface treasury-hero">
                <div className="eyebrow">ACTIFS DÉTENUS PAR LE TIMELOCK</div>
                <h2>Trésorerie de l'association</h2>
                <div className="big-balance">
                  {treasury ? totalTreasury.toFixed(5) : '—'} <small>ETH</small>
                </div>
                <p>
                  Le contrat Timelock détient les fonds. Les transferts sont exécutés
                  uniquement via une proposition adoptée et arrivée à échéance.
                </p>
                <div className="address-line">
                  <span>Adresse du coffre</span>
                  <code>{treasuryAddress || 'Non configurée'}</code>
                  {treasuryAddress && (
                    <a href={`https://sepolia.etherscan.io/address/${treasuryAddress}`} target="_blank" rel="noreferrer">
                      Explorer ↗
                    </a>
                  )}
                </div>
              </section>

              <section className="surface">
                <div className="surface-head">
                  <div><h2>Règles de sécurité</h2><p>Contrôle des mouvements financiers</p></div>
                </div>
                <Rule number="01" title="Approbation collective" description="Une proposition doit réussir le vote et atteindre le quorum de 20 %." />
                <Rule number="02" title="Délai de sécurité" description="Le Timelock impose un délai minimal d'une heure." />
                <Rule number="03" title="Exécution publique" description="Après le délai, toute personne peut déclencher l'exécution programmée." />
              </section>

              <section className="surface">
                <div className="surface-head">
                  <div><h2>Activité des propositions</h2><p>Demandes de transfert enregistrées on-chain</p></div>
                </div>
                <ProposalTable
                  proposals={proposals}
                  onSelect={(p) => {
                    setSelected(p);
                    setTab('proposals');
                  }}
                  loading={loading}
                />
              </section>
            </div>
          )}

          {tab === 'members' && (
            <div className="page-grid">
              <section className="surface">
                <div className="surface-head">
                  <div><h2>Mon espace membre</h2><p>Solde, pouvoir de vote et délégation</p></div>
                  <span className="metric-icon blue">♙</span>
                </div>

                <div className="member-address">
                  {address || 'Connectez votre portefeuille MetaMask'}
                </div>

                <div className="faucet-card">
                  <div>
                    <b>🎁 Obtenir des jetons pour tester</b>
                    <p>
                      Chaque nouveau portefeuille peut réclamer 100 FEG de test une seule fois.
                      Les voix sont automatiquement déléguées à votre adresse.
                    </p>
                    <small>Sepolia uniquement · Aucun jeton de valeur réelle</small>
                  </div>
                  <button
                    className="btn-primary"
                    disabled={!address || !ready || !!claimed || isPending || wrongNetwork}
                    onClick={claimTestTokens}
                  >
                    {claimed ? 'Jetons déjà réclamés' : 'Réclamer 100 FEG'}
                  </button>
                </div>

                <div className="detail-grid">
                  <div><small>Jetons FEG</small><b>{balance !== undefined ? formatEther(balance) : '—'}</b></div>
                  <div><small>Pouvoir de vote</small><b>{votes !== undefined ? formatEther(votes) : '—'}</b></div>
                  <div><small>Réseau</small><b>{chain?.name || 'Non connecté'}</b></div>
                  <div><small>Statut</small><b>{address ? 'Portefeuille connecté' : 'Invité'}</b></div>
                </div>

                <label>Adresse de délégation (laisser vide pour vous-même)</label>
                <input value={delegatee} onChange={(e) => setDelegatee(e.target.value)} placeholder={address || '0x…'} />

                <button
                  className="btn-primary full"
                  disabled={!ready || !address || isPending || wrongNetwork}
                  onClick={delegate}
                >
                  Déléguer mon pouvoir de vote ↗
                </button>
              </section>

              {admin && (
                <section className="surface">
                  <div className="surface-head">
                    <div><h2>Distribution des jetons</h2><p>Réservé au propriétaire du contrat FEG</p></div>
                    <span className="admin-tag">ADMIN</span>
                  </div>

                  <label>Adresse du membre</label>
                  <input value={mintMember} onChange={(e) => setMintMember(e.target.value)} placeholder="0x…" />

                  <label>Quantité à distribuer (FEG)</label>
                  <input value={mintAmount} onChange={(e) => setMintAmount(e.target.value)} type="number" min="1" />

                  <button className="btn-primary full" disabled={!ready || isPending || wrongNetwork} onClick={mint}>
                    Distribuer les FEG ↗
                  </button>

                  <p className="form-hint">
                    Le faucet public sert uniquement aux essais sur Sepolia.
                    Pour une association réelle, retirez le faucet et distribuez les jetons après validation des membres.
                  </p>
                </section>
              )}

              <section className="surface">
                <div className="surface-head">
                  <div><h2>Règles d'adhésion</h2><p>Paramètres du prototype</p></div>
                </div>
                <Rule number="01" title="Jeton de gouvernance" description="FEG · ERC20Votes" />
                <Rule number="02" title="Seuil de proposition" description="1 FEG de pouvoir de vote" />
                <Rule number="03" title="Quorum" description="20 % de l'offre totale au snapshot" />
              </section>
            </div>
          )}

          {tab === 'activity' && (
            <section className="surface">
              <div className="surface-head">
                <div><h2>Journal d'activité</h2><p>Événements de propositions détectés sur Sepolia</p></div>
                <button className="icon-btn" onClick={() => void loadProposals()} disabled={loading}>⟳</button>
              </div>
              <ProposalTable
                proposals={proposals}
                onSelect={(p) => {
                  setSelected(p);
                  setTab('proposals');
                }}
                loading={loading}
              />
              <p className="form-hint">
                Cette vue indexe les événements ProposalCreated des 9 000 derniers blocs.
                Un indexeur dédié est nécessaire pour un historique intégral et les mouvements ETH détaillés.
              </p>
            </section>
          )}

          {tab === 'settings' && (
            <div className="page-grid">
              <section className="surface">
                <div className="surface-head">
                  <div><h2>Configuration de la DAO</h2><p>Adresses des contrats sur le réseau Sepolia</p></div>
                </div>

                {[
                  ['Jeton FEG', tokenAddress],
                  ['Governor', governorAddress],
                  ['Timelock / Trésorerie', treasuryAddress],
                ].map(([label, value]) => (
                  <div className="config-row" key={label as string}>
                    <span>{label}</span>
                    <code>{value || 'Adresse non configurée'}</code>
                    <em className={value ? 'ok' : 'missing'}>
                      {value ? 'CONFIGURÉ' : 'MANQUANT'}
                    </em>
                  </div>
                ))}

                <a className="external-link" href="https://sepolia.etherscan.io" target="_blank" rel="noreferrer">
                  Ouvrir Sepolia Etherscan ↗
                </a>
              </section>

              <section className="surface">
                <div className="surface-head">
                  <div><h2>Paramètres de gouvernance</h2><p>Règles définies dans StudentGovernor.sol</p></div>
                </div>
                <Rule number="01" title="Quorum" description="20 % de l'offre totale" />
                <Rule number="02" title="Période de vote" description="7 200 blocs" />
                <Rule number="03" title="Délai du Timelock" description="3 600 secondes · 1 heure" />
                <Rule number="04" title="Seuil de proposition" description="1 FEG" />
              </section>
            </div>
          )}

          <footer>
            FUNDDAO <span>·</span> Gouvernance transparente <span>·</span>{' '}
            Prototype académique sur Sepolia · Aucun fonds réel
          </footer>
        </div>
      </section>
    </main>
  );
}

function Rule({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rule-row">
      <span>{number}</span>
      <div>
        <b>{title}</b>
        <small>{description}</small>
      </div>
      <em>ACTIF</em>
    </div>
  );
}

function ProposalTable({
  proposals,
  onSelect,
  loading,
}: {
  proposals: Proposal[];
  onSelect: (p: Proposal) => void;
  loading: boolean;
}) {
  if (loading) {
    return <div className="empty-state">Synchronisation avec la blockchain…</div>;
  }

  if (!proposals.length) {
    return (
      <div className="empty-state">
        <div>▤</div>
        <b>Aucune proposition détectée</b>
        <span>Les propositions créées sur Sepolia apparaîtront ici.</span>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>PROPOSITION</th>
            <th>BÉNÉFICIAIRE</th>
            <th>MONTANT</th>
            <th>STATUT</th>
            <th />
          </tr>
        </thead>

        <tbody>
          {proposals.map((p) => (
            <tr key={p.id} onClick={() => onSelect(p)}>
              <td>
                <b>
                  {p.description.slice(0, 55)}
                  {p.description.length > 55 ? '…' : ''}
                </b>
                <small>ID #{p.id.slice(0, 12)}… · {short(p.proposer)}</small>
              </td>
              <td><code>{short(p.recipient)}</code></td>
              <td><b>{Number(p.amount).toFixed(4)} ETH</b></td>
              <td>
                <span className={`status status-${p.state ?? 0}`}>
                  {statusNames[p.state ?? 0] || 'Inconnu'}
                </span>
              </td>
              <td>
                <button
                  className="row-arrow"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(p);
                  }}
                >
                  ↗
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}