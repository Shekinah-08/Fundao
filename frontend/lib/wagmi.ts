import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { defineChain } from 'viem';
import { sepolia } from 'wagmi/chains';

const localChain = defineChain({
  id: 31337,
  name: 'Hardhat',
  network: 'hardhat',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
    public: { http: ['http://127.0.0.1:8545'] }
  },
  blockExplorers: {
    default: { name: 'Local Explorer', url: 'http://127.0.0.1:8545' }
  }
});

const configuredChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? '31337');
export const appChain = configuredChainId === 31337 ? localChain : sepolia;

export const config = getDefaultConfig({
  appName: 'Fonds Étudiant DAO',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo-project-id',
  chains: [appChain],
  ssr: true
});
