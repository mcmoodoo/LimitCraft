import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Orderly',
  projectId: 'YOUR_PROJECT_ID', // Get this from WalletConnect Cloud
  chains: [mainnet, sepolia],
  ssr: false,
});