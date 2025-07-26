import { ethers, formatEther, formatUnits } from 'ethers';

// Arbitrum mainnet configuration
const ARBITRUM_RPC = 'http://localhost:8545';

// Contract addresses on Arbitrum mainnet
const WETH_ADDRESS = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

// All accounts involved
const ACCOUNTS = {
  'Main Wallet': '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  'WETH Recipient': '0xa53568e4175835369d6F76b93501Dd6789Ab0B41',
  'USDC Recipient': '0xe71DB3894A79BeBe377fbD7B601766660Aaea5f9',
};

// ERC20 ABI (minimal)
const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

async function main() {
  console.log('🔍 Checking balances of all involved accounts...\n');

  // Setup provider
  const provider = new ethers.JsonRpcProvider(ARBITRUM_RPC);

  // Contract instances
  const wethContract = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, provider);
  const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);

  try {
    // Get token info
    const [wethSymbol, wethDecimals, usdcSymbol, usdcDecimals] = await Promise.all([
      wethContract.symbol(),
      wethContract.decimals(),
      usdcContract.symbol(),
      usdcContract.decimals(),
    ]);

    console.log(`Token Info:`);
    console.log(`- ${wethSymbol}: ${wethDecimals} decimals`);
    console.log(`- ${usdcSymbol}: ${usdcDecimals} decimals\n`);

    // Check balances for each account
    for (const [accountName, address] of Object.entries(ACCOUNTS)) {
      console.log(`📊 ${accountName}: ${address}`);
      console.log('─'.repeat(60));

      try {
        // Get ETH, WETH, and USDC balances
        const [ethBalance, wethBalance, usdcBalance] = await Promise.all([
          provider.getBalance(address),
          wethContract.balanceOf(address),
          usdcContract.balanceOf(address),
        ]);

        console.log(`  ETH:  ${formatEther(ethBalance)} ETH`);
        console.log(`  WETH: ${formatUnits(wethBalance, wethDecimals)} ${wethSymbol}`);
        console.log(`  USDC: ${formatUnits(usdcBalance, usdcDecimals)} ${usdcSymbol}`);
      } catch (error) {
        console.log(`  ❌ Error fetching balances: ${error.message}`);
      }

      console.log(''); // Empty line for separation
    }

    // Summary totals
    console.log('📈 TOTAL BALANCES ACROSS ALL ACCOUNTS:');
    console.log('═'.repeat(60));

    let totalEth = 0n;
    let totalWeth = 0n;
    let totalUsdc = 0n;

    for (const [accountName, address] of Object.entries(ACCOUNTS)) {
      try {
        const [ethBalance, wethBalance, usdcBalance] = await Promise.all([
          provider.getBalance(address),
          wethContract.balanceOf(address),
          usdcContract.balanceOf(address),
        ]);

        totalEth += ethBalance;
        totalWeth += wethBalance;
        totalUsdc += usdcBalance;
      } catch (error) {
        console.log(`  ⚠️  Could not include ${accountName} in totals: ${error.message}`);
      }
    }

    console.log(`  Total ETH:  ${formatEther(totalEth)} ETH`);
    console.log(`  Total WETH: ${formatUnits(totalWeth, wethDecimals)} ${wethSymbol}`);
    console.log(`  Total USDC: ${formatUnits(totalUsdc, usdcDecimals)} ${usdcSymbol}`);

    console.log('\n✅ Balance check completed!');
  } catch (error) {
    console.error('❌ Error during balance check:', error);
    throw error;
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { main };
