import {
  Address,
  Extension,
  getLimitOrderContract,
  Interaction,
  LimitOrder,
  MakerTraits,
  randBigInt,
} from '@1inch/limit-order-sdk';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { maxUint256, parseUnits } from 'viem';
import {
  useAccount,
  useChainId,
  useReadContract,
  useSignTypedData,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { USDC, USDC_E, USDT, WETH } from '../tokens';

// Aave V3 Pool address on Arbitrum
const AAVE_V3_POOL_ADDRESS = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';

// Aave V3 Pool ABI for getReserveData function
const AAVE_V3_POOL_ABI = [
  {
    type: 'function',
    name: 'getReserveData',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'configuration', type: 'uint256' },
          { name: 'liquidityIndex', type: 'uint128' },
          { name: 'currentLiquidityRate', type: 'uint128' },
          { name: 'variableBorrowIndex', type: 'uint128' },
          { name: 'currentVariableBorrowRate', type: 'uint128' },
          { name: 'currentStableBorrowRate', type: 'uint128' },
          { name: 'lastUpdateTimestamp', type: 'uint40' },
          { name: 'id', type: 'uint16' },
          { name: 'aTokenAddress', type: 'address' },
          { name: 'stableDebtTokenAddress', type: 'address' },
          { name: 'variableDebtTokenAddress', type: 'address' },
          { name: 'interestRateStrategyAddress', type: 'address' },
          { name: 'accruedToTreasury', type: 'uint128' },
          { name: 'unbacked', type: 'uint128' },
          { name: 'isolationModeTotalDebt', type: 'uint128' },
        ],
      },
    ],
  },
] as const;

interface CreateOrderForm {
  makerAsset: string;
  takerAsset: string;
  makingAmount: string;
  takingAmount: string;
  expiresIn: number;
  useLendingProtocol: boolean;
  lendingProtocol: string;
  supplyToLendingProtocol: boolean;
  supplyLendingProtocol: string;
}

const ERC20_ABI = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

// Custom hook for token approval management
const useTokenApproval = (
  tokenAddress: string | undefined,
  spender: string,
  owner: string | undefined
) => {
  const allowanceQuery = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [owner as `0x${string}`, spender as `0x${string}`],
    query: {
      enabled: !!tokenAddress && !!owner && !!spender,
    },
  });

  const needsApproval = (requiredAmount: bigint): boolean => {
    if (!allowanceQuery.data) return true;
    return allowanceQuery.data < requiredAmount;
  };

  return {
    allowance: allowanceQuery.data,
    needsApproval,
    refetch: allowanceQuery.refetch,
  };
};

// Approval item interface
interface ApprovalItem {
  tokenAddress: string;
  tokenName: string;
  spender: string;
  requiredAmount: bigint;
  needsApproval: boolean;
  currentAllowance?: bigint;
}

export default function CreateOrder() {
  const ourContractAddress = '0x3195796c0999cee134ad7e957ad9767f89869b2c';

  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const chainId = useChainId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();
  const [approvalTxHash, setApprovalTxHash] = useState<string | null>(null);

  // Wait for approval transaction confirmation
  const approvalReceipt = useWaitForTransactionReceipt({
    hash: approvalTxHash as `0x${string}` | undefined,
  });

  // Get the limit order contract address for the current chain
  const limitOrderContractAddress = getLimitOrderContract(chainId);

  const [form, setForm] = useState<CreateOrderForm>({
    makerAsset: USDC,
    takerAsset: WETH,
    makingAmount: '',
    takingAmount: '',
    expiresIn: 3600, // 1 hour
    useLendingProtocol: false,
    lendingProtocol: 'aave',
    supplyToLendingProtocol: false,
    supplyLendingProtocol: 'aave',
  });

  // Get aToken address for the makerAsset
  const aaveReserveDataQuery = useReadContract({
    address: AAVE_V3_POOL_ADDRESS as `0x${string}`,
    abi: AAVE_V3_POOL_ABI,
    functionName: 'getReserveData',
    args: [form.makerAsset as `0x${string}`],
    query: {
      enabled: !!form.makerAsset,
    },
  });

  // Token approval hooks
  const makerApproval = useTokenApproval(form.makerAsset, limitOrderContractAddress, address);
  const aTokenApproval = useTokenApproval(
    aaveReserveDataQuery.data?.aTokenAddress,
    ourContractAddress,
    address
  );
  const takerApproval = useTokenApproval(form.takerAsset, ourContractAddress, address);

  // Calculate required amounts
  const requiredAmounts = useMemo(() => {
    if (!form.makingAmount || !form.takingAmount) return null;

    const makingAmountWei = parseUnits(form.makingAmount, 6); // USDC has 6 decimals
    const takingAmountWei = parseUnits(form.takingAmount, 18); // WETH has 18 decimals

    return { makingAmountWei, takingAmountWei };
  }, [form.makingAmount, form.takingAmount]);

  // Generate approval items
  const approvalItems = useMemo((): ApprovalItem[] => {
    if (!requiredAmounts) return [];

    const items: ApprovalItem[] = [
      {
        tokenAddress: form.makerAsset,
        tokenName: 'maker asset',
        spender: limitOrderContractAddress,
        requiredAmount: requiredAmounts.makingAmountWei,
        needsApproval: makerApproval.needsApproval(requiredAmounts.makingAmountWei),
        currentAllowance: makerApproval.allowance,
      },
    ];

    // Add taker asset approval only if "Supply to Lending Protocol" is toggled on
    if (form.supplyToLendingProtocol) {
      items.push({
        tokenAddress: form.takerAsset,
        tokenName: 'taker asset',
        spender: ourContractAddress,
        requiredAmount: requiredAmounts.takingAmountWei,
        needsApproval: takerApproval.needsApproval(requiredAmounts.takingAmountWei),
        currentAllowance: takerApproval.allowance,
      });
    }

    // Add aToken approval only if "Use Lending Position" is toggled on
    if (form.useLendingProtocol && aaveReserveDataQuery.data?.aTokenAddress) {
      const aTokenAddress = aaveReserveDataQuery.data.aTokenAddress;
      items.push({
        tokenAddress: aTokenAddress,
        tokenName: 'aToken',
        spender: ourContractAddress,
        requiredAmount: requiredAmounts.makingAmountWei,
        needsApproval: aTokenApproval.needsApproval(requiredAmounts.makingAmountWei),
        currentAllowance: aTokenApproval.allowance,
      });
    }

    return items;
  }, [
    requiredAmounts,
    aaveReserveDataQuery.data,
    form.makerAsset,
    form.takerAsset,
    form.useLendingProtocol,
    form.supplyToLendingProtocol,
    limitOrderContractAddress,
    makerApproval,
    takerApproval,
    aTokenApproval,
  ]);

  // Function to handle individual approval
  const handleApproval = async (item: ApprovalItem): Promise<boolean> => {
    try {
      setApprovalStatus(`Sending ${item.tokenName} approval transaction...`);

      const hash = await writeContractAsync({
        address: item.tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [item.spender as `0x${string}`, maxUint256],
      });

      setApprovalTxHash(hash);
      setApprovalStatus(`Waiting for ${item.tokenName} approval confirmation...`);

      return true;
    } catch (error) {
      console.error(`${item.tokenName} approval failed:`, error);
      setApprovalStatus(null);
      setError(error instanceof Error ? error.message : `${item.tokenName} approval failed`);
      return false;
    }
  };

  // Function to wait for approval confirmation
  const waitForApprovalConfirmation = async (tokenName: string): Promise<boolean> => {
    while (approvalTxHash && !approvalReceipt.isSuccess && !approvalReceipt.isError) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (approvalReceipt.isError) {
      setError(`${tokenName} approval transaction failed`);
      return false;
    }

    setApprovalStatus(`${tokenName} approval confirmed!`);
    return true;
  };

  // Function to process all approvals
  const processApprovals = async (): Promise<boolean> => {
    const itemsNeedingApproval = approvalItems.filter((item) => item.needsApproval);

    // Log all approval statuses
    approvalItems.forEach((item) => {
      console.log(`${item.tokenName}:`, item.tokenAddress);
      console.log(`${item.tokenName} needs approval:`, item.needsApproval);
      console.log(`${item.tokenName} current allowance:`, item.currentAllowance?.toString());
      console.log(`${item.tokenName} required amount:`, item.requiredAmount.toString());
    });

    if (itemsNeedingApproval.length === 0) {
      console.log('No approvals needed - all tokens have sufficient allowance');
      setApprovalStatus('Creating order...');
      return true;
    }

    // Process approvals sequentially
    for (const item of itemsNeedingApproval) {
      setApprovalTxHash(null); // Reset for new approval

      const approvalSuccess = await handleApproval(item);
      if (!approvalSuccess) return false;

      const confirmationSuccess = await waitForApprovalConfirmation(item.tokenName);
      if (!confirmationSuccess) return false;

      // Refetch the specific allowance
      if (item.tokenName === 'maker asset') {
        await makerApproval.refetch();
      } else if (item.tokenName === 'aToken') {
        await aTokenApproval.refetch();
      } else if (item.tokenName === 'taker asset') {
        await takerApproval.refetch();
      }
    }

    setApprovalStatus('All approvals confirmed! Creating order...');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isConnected || !address) {
      setError('Please connect your wallet first');
      return;
    }

    if (!requiredAmounts) {
      setError('Please enter valid amounts');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    setApprovalStatus(null);

    try {
      // Process all approvals
      const approvalsSuccess = await processApprovals();
      if (!approvalsSuccess) {
        setLoading(false);
        return;
      }

      // Create expiration timestamp
      const expiration = BigInt(Math.floor(Date.now() / 1000)) + BigInt(form.expiresIn);

      // Create proper MakerTraits using 1inch SDK
      const UINT_40_MAX = (1n << 40n) - 1n;
      const nonce = randBigInt(UINT_40_MAX);
      let makerTraits = MakerTraits.default()
        .withExpiration(expiration)
        .withNonce(nonce)
        .allowMultipleFills();

      const extensionData: Record<string, unknown> = {
        ...Extension.EMPTY,
      };

      // Only enable pre-interaction if "Use Lending Position" is toggled on
      if (form.useLendingProtocol) {
        makerTraits = makerTraits.enablePreInteraction().withExtension();
        const preInteraction = new Interaction(new Address(ourContractAddress), '0x00');
        extensionData.preInteraction = preInteraction.encode();
      }

      // Only enable post-interaction if "Supply to Lending Protocol" is toggled on
      if (form.supplyToLendingProtocol) {
        makerTraits = makerTraits.enablePostInteraction().withExtension();
        const postInteraction = new Interaction(new Address(ourContractAddress), '0x00');
        extensionData.postInteraction = postInteraction.encode();
      }

      const extensions = new Extension(extensionData);

      // Create a real LimitOrder using the 1inch SDK
      const limitOrder = new LimitOrder(
        {
          makerAsset: new Address(form.makerAsset),
          takerAsset: new Address(form.takerAsset),
          makingAmount: requiredAmounts.makingAmountWei,
          takingAmount: requiredAmounts.takingAmountWei,
          maker: new Address(address),
        },
        makerTraits,
        extensions
      );

      // Get the real EIP-712 order hash and typed data
      const orderHash = limitOrder.getOrderHash(chainId);
      const typedData = limitOrder.getTypedData(chainId);

      // Sign the typed data using wagmi
      const signature = await signTypedDataAsync(typedData);

      // Convert BigInt values to strings for JSON serialization
      const typedDataForJson = JSON.parse(
        JSON.stringify(typedData, (_key, value) =>
          typeof value === 'bigint' ? value.toString() : value
        )
      );

      // Submit to backend
      const response = await fetch('http://localhost:3000/submit-signed-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderHash: orderHash,
          signature: signature,
          makerTraits: makerTraits.asBigInt().toString(),
          chainId: chainId,
          typedData: typedDataForJson,
          extension: limitOrder.extension.encode(),
        }),
      });

      const result = await response.json();

      if (result.success) {
        setSuccess(`Order created successfully! Order hash: ${result.data.orderHash}`);
        setApprovalStatus(null);
        setTimeout(() => {
          navigate('/orders');
        }, 2000);
      } else {
        setError(result.error);
      }
    } catch (err) {
      console.error('Error creating order:', err);
      setError(err instanceof Error ? err.message : 'Failed to create order');
    } finally {
      setLoading(false);
      setApprovalStatus(null);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type, checked } = e.target as HTMLInputElement;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const tokenOptions = [
    { value: USDC, label: 'USDC' },
    { value: WETH, label: 'WETH' },
    { value: USDT, label: 'USDT' },
    { value: USDC_E, label: 'USDC.e' },
  ];

  const expirationOptions = [
    { value: 60, label: '1 minute' },
    { value: 300, label: '5 minutes' },
    { value: 600, label: '10 minutes' },
    { value: 1800, label: '30 minutes' },
    { value: 3600, label: '1 hour' },
    { value: 7200, label: '2 hours' },
    { value: 86400, label: '24 hours' },
  ];

  if (!isConnected) {
    return (
      <div className="text-center py-12">
        <h1 className="text-3xl font-bold mb-4">Create Order</h1>
        <p className="text-gray-400 text-lg mb-6">Please connect your wallet to create an order</p>
        <Link to="/" className="text-blue-400 hover:text-blue-300">
          ← Back to Home
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center mb-6">
        <Link to="/orders" className="text-blue-400 hover:text-blue-300 mr-4">
          ← Back to Orders
        </Link>
        <h1 className="text-3xl font-bold">Create Order</h1>
      </div>

      <div className="max-w-2xl mx-auto">
        <div className="bg-gray-800 rounded-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold mb-4 text-green-400">Making (Sell)</h3>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="makerAsset" className="block text-sm font-medium mb-2">
                      Asset
                    </label>
                    <select
                      id="makerAsset"
                      name="makerAsset"
                      value={form.makerAsset}
                      onChange={handleChange}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      {tokenOptions.map((token) => (
                        <option key={token.value} value={token.value}>
                          {token.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="makingAmount" className="block text-sm font-medium mb-2">
                      Amount
                    </label>
                    <input
                      id="makingAmount"
                      type="number"
                      name="makingAmount"
                      value={form.makingAmount}
                      onChange={handleChange}
                      step="0.000001"
                      min="0"
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.0"
                      required
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-300">Use Lending Position</span>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          useLendingProtocol: !prev.useLendingProtocol,
                        }))
                      }
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 ${
                        form.useLendingProtocol ? 'bg-blue-600' : 'bg-gray-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          form.useLendingProtocol ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {form.useLendingProtocol && (
                    <div className="mt-3">
                      <label htmlFor="lendingProtocol" className="block text-sm font-medium mb-2">
                        Protocol
                      </label>
                      <div className="relative">
                        <select
                          id="lendingProtocol"
                          name="lendingProtocol"
                          value={form.lendingProtocol}
                          onChange={handleChange}
                          className="w-full px-3 py-2 pr-12 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                        >
                          <option value="aave">Aave</option>
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                          <img
                            src="https://app.aave.com/icons/tokens/aave.svg"
                            alt="Aave"
                            className="w-5 h-5"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const fallback = document.createElement('div');
                              fallback.className =
                                'w-5 h-5 bg-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold';
                              fallback.textContent = 'A';
                              target.parentNode?.appendChild(fallback);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4 text-blue-400">Taking (Buy)</h3>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="takerAsset" className="block text-sm font-medium mb-2">
                      Asset
                    </label>
                    <select
                      id="takerAsset"
                      name="takerAsset"
                      value={form.takerAsset}
                      onChange={handleChange}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      {tokenOptions.map((token) => (
                        <option key={token.value} value={token.value}>
                          {token.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="takingAmount" className="block text-sm font-medium mb-2">
                      Amount
                    </label>
                    <input
                      id="takingAmount"
                      type="number"
                      name="takingAmount"
                      value={form.takingAmount}
                      onChange={handleChange}
                      step="0.000001"
                      min="0"
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.0"
                      required
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-300">
                      Supply to Lending Protocol
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          supplyToLendingProtocol: !prev.supplyToLendingProtocol,
                        }))
                      }
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 ${
                        form.supplyToLendingProtocol ? 'bg-blue-600' : 'bg-gray-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          form.supplyToLendingProtocol ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {form.supplyToLendingProtocol && (
                    <div className="mt-3">
                      <label
                        htmlFor="supplyLendingProtocol"
                        className="block text-sm font-medium mb-2"
                      >
                        Protocol
                      </label>
                      <div className="relative">
                        <select
                          id="supplyLendingProtocol"
                          name="supplyLendingProtocol"
                          value={form.supplyLendingProtocol}
                          onChange={handleChange}
                          className="w-full px-3 py-2 pr-12 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                        >
                          <option value="aave">Aave</option>
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                          <img
                            src="https://app.aave.com/icons/tokens/aave.svg"
                            alt="Aave"
                            className="w-5 h-5"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const fallback = document.createElement('div');
                              fallback.className =
                                'w-5 h-5 bg-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold';
                              fallback.textContent = 'A';
                              target.parentNode?.appendChild(fallback);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="expiresIn" className="block text-sm font-medium mb-2">
                Expiration
              </label>
              <select
                id="expiresIn"
                name="expiresIn"
                value={form.expiresIn}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                {expirationOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {approvalStatus && (
              <div className="bg-blue-900/20 border border-blue-500 rounded-lg p-4">
                <p className="text-blue-400">{approvalStatus}</p>
              </div>
            )}

            {error && (
              <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
                <p className="text-red-400">{error}</p>
              </div>
            )}

            {success && (
              <div className="bg-green-900/20 border border-green-500 rounded-lg p-4">
                <p className="text-green-400">{success}</p>
              </div>
            )}

            <div className="flex space-x-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-medium transition-colors"
              >
                {loading ? (approvalStatus ? approvalStatus : 'Creating Order...') : 'Create Order'}
              </button>

              <Link
                to="/orders"
                className="px-6 py-3 border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors text-center"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>

        <div className="mt-6 bg-gray-800 rounded-lg p-4">
          <h3 className="font-semibold mb-2">Order Summary</h3>
          <div className="text-sm text-gray-400 space-y-1">
            <p>
              You will sell{' '}
              <span className="text-white font-medium">{form.makingAmount || '0'}</span> tokens
            </p>
            <p>
              You will receive{' '}
              <span className="text-white font-medium">{form.takingAmount || '0'}</span> tokens
            </p>
            <p>
              Order expires in{' '}
              <span className="text-white font-medium">
                {expirationOptions.find((opt) => opt.value === form.expiresIn)?.label}
              </span>
            </p>
          </div>

          <div className="mt-3 pt-3 border-t border-gray-700">
            <p className="text-xs text-gray-500">
              📝 Note: You may need to approve token spending before creating the order.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
