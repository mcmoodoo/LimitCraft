import { ethers, formatUnits, parseUnits } from 'ethers';
import { config } from './config';

// ERC20 ABI (minimal for approval operations)
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function name() view returns (string)',
];

interface ApprovalParams {
  tokenAddress: string;
  spenderAddress: string;
  amount: string; // Can be a number string or 'max' for maximum approval
  ownerPrivateKey?: string; // Optional, uses config.privateKey if not provided
}

async function approveToken(params: ApprovalParams) {
  const { tokenAddress, spenderAddress, amount, ownerPrivateKey } = params;

  console.log('🔓 Starting ERC20 token approval...\n');

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(ownerPrivateKey || config.privateKey, provider);

  // Create token contract instance
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

  try {
    // Get token info
    const [tokenName, tokenSymbol, tokenDecimals, balance, currentAllowance] = await Promise.all([
      tokenContract.name(),
      tokenContract.symbol(),
      tokenContract.decimals(),
      tokenContract.balanceOf(wallet.address),
      tokenContract.allowance(wallet.address, spenderAddress),
    ]);

    console.log(`Token Information:`);
    console.log(`- Name: ${tokenName}`);
    console.log(`- Symbol: ${tokenSymbol}`);
    console.log(`- Decimals: ${tokenDecimals}`);
    console.log(`- Contract: ${tokenAddress}`);
    console.log(`- Owner: ${wallet.address}`);
    console.log(`- Spender: ${spenderAddress}`);
    console.log(`- Current Balance: ${formatUnits(balance, tokenDecimals)} ${tokenSymbol}`);
    console.log(
      `- Current Allowance: ${formatUnits(currentAllowance, tokenDecimals)} ${tokenSymbol}\n`
    );

    // Determine approval amount
    let approvalAmount: bigint;

    if (amount.toLowerCase() === 'max') {
      // Maximum possible approval (2^256 - 1)
      approvalAmount = ethers.MaxUint256;
      console.log(
        `💰 Approving maximum amount (${ethers.MaxUint256.toString()}) for ${tokenSymbol}`
      );
    } else {
      // Parse the specific amount
      approvalAmount = parseUnits(amount, tokenDecimals);
      console.log(`💰 Approving ${formatUnits(approvalAmount, tokenDecimals)} ${tokenSymbol}`);
    }

    // Check if approval is needed
    if (currentAllowance >= approvalAmount) {
      console.log(`✅ Sufficient allowance already exists. No approval needed.`);
      return {
        success: true,
        message: 'Sufficient allowance already exists',
        currentAllowance: formatUnits(currentAllowance, tokenDecimals),
        tokenSymbol,
      };
    }

    // Estimate gas for the approval
    console.log(`⛽ Estimating gas for approval...`);
    const gasEstimate = await tokenContract.approve.estimateGas(spenderAddress, approvalAmount);
    const gasPrice = await provider.getFeeData();

    console.log(`- Estimated gas: ${gasEstimate.toString()}`);
    console.log(`- Gas price: ${formatUnits(gasPrice.gasPrice || 0n, 'gwei')} gwei`);

    // Execute the approval
    console.log(`\n🚀 Executing approval transaction...`);
    const tx = await tokenContract.approve(spenderAddress, approvalAmount);

    console.log(`📋 Transaction hash: ${tx.hash}`);
    console.log(`⏳ Waiting for confirmation...`);

    // Wait for transaction confirmation
    const receipt = await tx.wait();

    if (receipt && receipt.status === 1) {
      console.log(`✅ Approval successful!`);
      console.log(`- Block number: ${receipt.blockNumber}`);
      console.log(`- Gas used: ${receipt.gasUsed.toString()}`);

      // Verify the new allowance
      const newAllowance = await tokenContract.allowance(wallet.address, spenderAddress);
      console.log(`- New allowance: ${formatUnits(newAllowance, tokenDecimals)} ${tokenSymbol}`);

      return {
        success: true,
        transactionHash: tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        newAllowance: formatUnits(newAllowance, tokenDecimals),
        tokenSymbol,
      };
    } else {
      throw new Error('Transaction failed');
    }
  } catch (error) {
    console.error('❌ Error during token approval:', error);
    throw error;
  }
}

// Convenience function for approving tokens to the 1inch Limit Order Protocol
async function approveTo1inch(tokenAddress: string, amount: string = 'max') {
  return approveToken({
    tokenAddress,
    spenderAddress: config.contracts.LIMIT_ORDER_CONTRACT_ARBITRUM,
    amount,
  });
}

// CLI usage
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
Usage: 
  tsx scripts/approve-token.ts <tokenAddress> <spenderAddress> [amount] [privateKey]
  tsx scripts/approve-token.ts --1inch <tokenAddress> [amount]

Arguments:
  tokenAddress  - The ERC20 token contract address
  spenderAddress - The address that will be approved to spend tokens
  amount        - Amount to approve (use 'max' for maximum approval, default: 'max')
  privateKey    - Private key of token owner (optional, uses config default)

Examples:
  # Approve USDC to 1inch Limit Order Protocol
  tsx scripts/approve-token.ts --1inch ${config.tokens.USDC}
  
  # Approve specific amount of WETH to custom spender
  tsx scripts/approve-token.ts ${config.tokens.WETH} 0x1234...abcd 100.5
  
  # Approve maximum USDC to custom spender
  tsx scripts/approve-token.ts ${config.tokens.USDC} 0x1234...abcd max

Available tokens in config:
  - USDC: ${config.tokens.USDC}
  - WETH: ${config.tokens.WETH}
  - ARB: ${config.tokens.ARB}
  - ONE_INCH: ${config.tokens.ONE_INCH}
`);
    process.exit(1);
  }

  try {
    if (args[0] === '--1inch') {
      // Shortcut for approving to 1inch Limit Order Protocol
      const tokenAddress = args[1];
      const amount = args[2] || 'max';

      console.log(`🔗 Approving ${tokenAddress} to 1inch Limit Order Protocol...\n`);
      const result = await approveTo1inch(tokenAddress, amount);
      console.log('\n✅ 1inch approval completed!', result);
    } else {
      // Standard approval
      const tokenAddress = args[0];
      const spenderAddress = args[1];
      const amount = args[2] || 'max';
      const privateKey = args[3];

      const result = await approveToken({
        tokenAddress,
        spenderAddress,
        amount,
        ownerPrivateKey: privateKey,
      });

      console.log('\n✅ Token approval completed!', result);
    }
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
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

export { approveToken, approveTo1inch };
