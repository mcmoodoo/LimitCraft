import { ethers, parseEther, formatEther } from 'ethers';

// Arbitrum mainnet configuration
const ARBITRUM_RPC = 'http://localhost:8545';
const PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

// Contract addresses on Arbitrum mainnet
const WETH_ADDRESS = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564';

// Target addresses
const WETH_RECIPIENT = '0xa53568e4175835369d6F76b93501Dd6789Ab0B41';
const USDC_RECIPIENT = '0xe71DB3894A79BeBe377fbD7B601766660Aaea5f9';

// WETH ABI (minimal)
const WETH_ABI = [
  'function deposit() payable',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
];

// ERC20 ABI (minimal)
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
];

// Uniswap V3 Router ABI (minimal)
const UNISWAP_V3_ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)'
];

async function main() {
  console.log('Starting Arbitrum operations...');
  
  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(ARBITRUM_RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  
  console.log(`Using wallet: ${wallet.address}`);
  
  // Check initial ETH balance
  const initialBalance = await provider.getBalance(wallet.address);
  console.log(`Initial ETH balance: ${formatEther(initialBalance)} ETH`);
  
  // Contract instances
  const wethContract = new ethers.Contract(WETH_ADDRESS, WETH_ABI, wallet);
  const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet);
  const routerContract = new ethers.Contract(UNISWAP_V3_ROUTER, UNISWAP_V3_ROUTER_ABI, wallet);
  
  try {
    // Get starting nonce
    let nonce = await provider.getTransactionCount(wallet.address);
    
    // Step 1: Wrap 10 ETH to WETH
    console.log('\n1. Wrapping 10 ETH to WETH...');
    const wrapAmount = parseEther('10');
    const wrapTx = await wethContract.deposit({ 
      value: wrapAmount, 
      gasLimit: 100000,
      nonce: nonce++
    });
    await wrapTx.wait();
    console.log(`✓ Wrapped 10 ETH to WETH. Tx: ${wrapTx.hash}`);
    
    // Check WETH balance
    const wethBalance = await wethContract.balanceOf(wallet.address);
    console.log(`WETH balance: ${formatEther(wethBalance)} WETH`);
    
    // Step 2: Send 5 WETH to specified address
    console.log('\n2. Sending 5 WETH to recipient...');
    const wethSendAmount = parseEther('5');
    const wethTransferTx = await wethContract.transfer(WETH_RECIPIENT, wethSendAmount, { 
      gasLimit: 100000,
      nonce: nonce++
    });
    await wethTransferTx.wait();
    console.log(`✓ Sent 5 WETH to ${WETH_RECIPIENT}. Tx: ${wethTransferTx.hash}`);
    
    // Step 3: Swap 10 ETH for USDC using Uniswap V3
    console.log('\n3. Swapping 10 ETH for USDC...');
    const swapAmount = parseEther('10');
    const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes from now
    
    const swapParams = {
      tokenIn: '0x0000000000000000000000000000000000000000', // ETH (use zero address for native ETH)
      tokenOut: USDC_ADDRESS,
      fee: 3000, // 0.3% fee tier
      recipient: wallet.address,
      deadline: deadline,
      amountIn: swapAmount,
      amountOutMinimum: 0, // Accept any amount of USDC
      sqrtPriceLimitX96: 0
    };
    
    // For native ETH swaps, we need to use WETH address as tokenIn and send ETH as value
    swapParams.tokenIn = WETH_ADDRESS;
    
    // First approve WETH for the router (we need to wrap more ETH first)
    const additionalWrapTx = await wethContract.deposit({ 
      value: swapAmount, 
      gasLimit: 100000,
      nonce: nonce++
    });
    await additionalWrapTx.wait();
    console.log('✓ Wrapped additional 10 ETH for swap');
    
    const approveTx = await wethContract.approve(UNISWAP_V3_ROUTER, swapAmount, { 
      gasLimit: 100000,
      nonce: nonce++
    });
    await approveTx.wait();
    console.log('✓ Approved WETH for Uniswap router');
    
    const swapTx = await routerContract.exactInputSingle(swapParams, { 
      gasLimit: 300000,
      nonce: nonce++
    });
    await swapTx.wait();
    console.log(`✓ Swapped 10 ETH for USDC. Tx: ${swapTx.hash}`);
    
    // Check USDC balance
    const usdcBalance = await usdcContract.balanceOf(wallet.address);
    console.log(`USDC balance: ${usdcBalance.toString()} USDC (6 decimals)`);
    
    // Step 4: Send 5000 USDC to specified address
    console.log('\n4. Sending 5000 USDC to recipient...');
    const usdcSendAmount = ethers.parseUnits('5000', 6); // USDC has 6 decimals
    const usdcTransferTx = await usdcContract.transfer(USDC_RECIPIENT, usdcSendAmount, { 
      gasLimit: 100000,
      nonce: nonce++
    });
    await usdcTransferTx.wait();
    console.log(`✓ Sent 5000 USDC to ${USDC_RECIPIENT}. Tx: ${usdcTransferTx.hash}`);
    
    console.log('\n✅ All operations completed successfully!');
    
    // Final balances
    const finalEthBalance = await provider.getBalance(wallet.address);
    const finalWethBalance = await wethContract.balanceOf(wallet.address);
    const finalUsdcBalance = await usdcContract.balanceOf(wallet.address);
    
    console.log('\nFinal balances:');
    console.log(`ETH: ${formatEther(finalEthBalance)} ETH`);
    console.log(`WETH: ${formatEther(finalWethBalance)} WETH`);
    console.log(`USDC: ${finalUsdcBalance.toString()} USDC`);
    
  } catch (error) {
    console.error('Error during operations:', error);
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
