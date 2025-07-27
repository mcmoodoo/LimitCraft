import { Address, Extension, getLimitOrderContract, LimitOrder, MakerTraits, randBigInt } from '@1inch/limit-order-sdk';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { maxUint256, parseUnits } from 'viem';
import { useAccount, useChainId, useSignTypedData, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { USDC, USDC_E, USDT, WETH } from '../tokens';

interface CreateOrderForm {
  makerAsset: string;
  takerAsset: string;
  makingAmount: string;
  takingAmount: string;
  expiresIn: number;
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

export default function CreateOrder() {
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
  });

  // Check current allowance for makerAsset
  const allowanceQuery = useReadContract({
    address: form.makerAsset as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address as `0x${string}`, limitOrderContractAddress as `0x${string}`],
    query: {
      enabled: !!address && !!form.makerAsset,
    },
  });

  // Helper function to check if approval is needed
  const needsApproval = (makingAmountWei: bigint): boolean => {
    if (!allowanceQuery.data) return true;
    return allowanceQuery.data < makingAmountWei;
  };

  // Function to handle approval transaction
  const handleApproval = async (makingAmountWei: bigint): Promise<boolean> => {
    try {
      setApprovalStatus('Sending approval transaction...');
      
      const hash = await writeContractAsync({
        address: form.makerAsset as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [limitOrderContractAddress as `0x${string}`, maxUint256],
      });

      setApprovalTxHash(hash);
      setApprovalStatus('Waiting for approval confirmation...');
      
      return true;
    } catch (error) {
      console.error('Approval failed:', error);
      setApprovalStatus(null);
      setError(error instanceof Error ? error.message : 'Approval failed');
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isConnected || !address) {
      setError('Please connect your wallet first');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    setApprovalStatus(null);

    try {
      // Convert amounts to wei/smallest units
      const makingAmountWei = parseUnits(form.makingAmount, 6); // USDC has 6 decimals
      const takingAmountWei = parseUnits(form.takingAmount, 18); // WETH has 18 decimals

      // Check if approval is needed
      if (needsApproval(makingAmountWei)) {
        const approvalSuccess = await handleApproval(makingAmountWei);
        if (!approvalSuccess) {
          setLoading(false);
          return;
        }

        // Wait for approval confirmation
        while (approvalTxHash && !approvalReceipt.isSuccess && !approvalReceipt.isError) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (approvalReceipt.isError) {
          setError('Approval transaction failed');
          setLoading(false);
          return;
        }

        setApprovalStatus('Approval confirmed! Creating order...');
        // Refetch allowance after approval
        await allowanceQuery.refetch();
      }

      // Create expiration timestamp
      const expiration = BigInt(Math.floor(Date.now() / 1000)) + BigInt(form.expiresIn);

      // Create proper MakerTraits using 1inch SDK
      const UINT_40_MAX = (1n << 40n) - 1n;
      const nonce = randBigInt(UINT_40_MAX);
      const makerTraits = MakerTraits.default()
        .withExpiration(expiration)
        .withNonce(nonce)
        .allowMultipleFills();

      // Create a real LimitOrder using the 1inch SDK
      const limitOrder = new LimitOrder(
        {
          makerAsset: new Address(form.makerAsset),
          takerAsset: new Address(form.takerAsset),
          makingAmount: makingAmountWei,
          takingAmount: takingAmountWei,
          maker: new Address(address),
        },
        makerTraits,
        Extension.default()
      );

      // Get the real EIP-712 order hash and typed data
      const orderHash = limitOrder.getOrderHash(chainId);
      const typedData = limitOrder.getTypedData(chainId);

      // Sign the typed data using wagmi
      const signature = await signTypedDataAsync(typedData);

      // Convert BigInt values to strings for JSON serialization
      const typedDataForJson = JSON.parse(
        JSON.stringify(typedData, (key, value) =>
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
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
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
                    <label className="block text-sm font-medium mb-2">Asset</label>
                    <select
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
                    <label className="block text-sm font-medium mb-2">Amount</label>
                    <input
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
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4 text-blue-400">Taking (Buy)</h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Asset</label>
                    <select
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
                    <label className="block text-sm font-medium mb-2">Amount</label>
                    <input
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
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Expiration</label>
              <select
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
                {loading 
                  ? (approvalStatus ? approvalStatus : 'Creating Order...') 
                  : 'Create Order'
                }
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
