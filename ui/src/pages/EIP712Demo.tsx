import { useState } from 'react';
import { useAccount, useSignTypedData, useChainId } from 'wagmi';
import { parseUnits, keccak256, encodePacked } from 'viem';
import { MakerTraits, randBigInt } from '@1inch/limit-order-sdk';

interface OrderForm {
  makerAsset: string;
  takerAsset: string;
  makingAmount: string;
  takingAmount: string;
  expiresIn: number;
}

interface SignedOrderData {
  orderHash: string;
  signature: string;
  typedData: any;
  orderStruct: any;
  makerTraits: string;
  extension: string;
}

export default function EIP712Demo() {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const chainId = useChainId();
  
  // Set default token addresses based on chain
  const getDefaultTokens = (chainId: number) => {
    switch (chainId) {
      case 42161: // Arbitrum
        return {
          makerAsset: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // USDC
          takerAsset: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH
        };
      case 1: // Ethereum Mainnet
        return {
          makerAsset: '0xa0b86a33e6d1f1db6ad3a37d9b5fbf7db7e6b0b6', // USDC
          takerAsset: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
        };
      default: // Default/Demo addresses
        return {
          makerAsset: '0x0000000000000000000000000000000000000001',
          takerAsset: '0x0000000000000000000000000000000000000002',
        };
    }
  };

  const [formData, setFormData] = useState<OrderForm>({
    ...getDefaultTokens(chainId),
    makingAmount: '1000',
    takingAmount: '0.0005',
    expiresIn: 300, // 5 minutes
  });
  
  const [signedOrder, setSignedOrder] = useState<SignedOrderData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const submitToBackend = async () => {
    if (!signedOrder) {
      setSubmitMessage('❌ No signed order to submit. Please sign an order first.');
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage(null);

    try {
      // Convert BigInt values to strings for JSON serialization
      const typedDataForJson = JSON.parse(JSON.stringify(signedOrder.typedData, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      ));

      const requestData = {
        orderHash: signedOrder.orderHash,
        signature: signedOrder.signature,
        makerTraits: signedOrder.makerTraits,
        chainId: chainId,
        typedData: typedDataForJson,
        extension: signedOrder.extension,
      };

      console.log('🚀 Sending complete signed order to backend:', requestData);
      
      const response = await fetch('http://localhost:3000/submit-signed-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });
      
      console.log('📥 Response status:', response.status);

      const result = await response.json();

      if (result.success) {
        setSubmitMessage('✅ Signed order successfully sent to backend! Check the API terminal for complete details.');
      } else {
        setSubmitMessage(`❌ Backend error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error submitting to backend:', error);
      setSubmitMessage('❌ Failed to connect to backend. Make sure the API is running on port 3000.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const createAndSignOrder = async () => {
    if (!isConnected || !address) {
      setError('Please connect your wallet first');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Convert amounts to wei/smallest units
      const makingAmountWei = parseUnits(formData.makingAmount, 6); // USDC has 6 decimals
      const takingAmountWei = parseUnits(formData.takingAmount, 18); // WETH has 18 decimals
      
      // Create expiration timestamp
      const expiration = BigInt(Math.floor(Date.now() / 1000)) + BigInt(formData.expiresIn);
      
      // Create proper MakerTraits using 1inch SDK
      const UINT_40_MAX = (1n << 40n) - 1n;
      const nonce = randBigInt(UINT_40_MAX);
      const makerTraits = MakerTraits.default()
        .withExpiration(expiration)
        .withNonce(nonce)
        .allowMultipleFills();
      
      // Extract the salt (nonce) from makerTraits
      const salt = makerTraits.nonceOrEpoch();

      // Create the order data structure for EIP-712
      const orderData = {
        salt: salt,
        maker: address,
        receiver: '0x0000000000000000000000000000000000000000',
        makerAsset: formData.makerAsset,
        takerAsset: formData.takerAsset,
        makingAmount: makingAmountWei,
        takingAmount: takingAmountWei,
        makerTraits: makerTraits.asBigInt(),
      };

      // EIP-712 domain for 1inch Limit Order Protocol v4 on current chain
      const domain = {
        name: 'Limit Order Protocol',
        version: '4',
        chainId: chainId,
        verifyingContract: '0x111111125421ca6dc452d289314280a0f8842a65' as `0x${string}`,
      };

      // EIP-712 types
      const types = {
        Order: [
          { name: 'salt', type: 'uint256' },
          { name: 'maker', type: 'address' },
          { name: 'receiver', type: 'address' },
          { name: 'makerAsset', type: 'address' },
          { name: 'takerAsset', type: 'address' },
          { name: 'makingAmount', type: 'uint256' },
          { name: 'takingAmount', type: 'uint256' },
          { name: 'makerTraits', type: 'uint256' },
        ],
      };

      // Create the typed data structure
      const typedData = {
        domain,
        types,
        primaryType: 'Order' as const,
        message: orderData,
      };

      console.log('🔍 About to sign typed data:', typedData);

      // Sign the typed data using wagmi
      const signature = await signTypedDataAsync(typedData);

      // Create a simple order hash for demo purposes
      // In a real implementation, this would be calculated properly using EIP-712 encoding
      const orderHash = keccak256(
        encodePacked(
          ['address', 'uint256', 'uint256'],
          [address as `0x${string}`, salt, BigInt(Date.now())]
        )
      );

      const signedOrderData: SignedOrderData = {
        orderHash,
        signature,
        typedData,
        orderStruct: orderData,
        makerTraits: makerTraits.asBigInt().toString(),
        extension: '0x', // Empty extension for demo
      };

      setSignedOrder(signedOrderData);
      console.log('✅ Order signed successfully:', signedOrderData);

    } catch (err) {
      console.error('❌ Error signing order:', err);
      setError(err instanceof Error ? err.message : 'Failed to sign order');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h2 className="text-3xl font-bold mb-4">EIP-712 Signing Demo</h2>
        <p className="text-gray-400 mb-8">Please connect your wallet to try EIP-712 signing</p>
      </div>
    );
  }

  const getChainName = (chainId: number) => {
    switch (chainId) {
      case 1: return 'Ethereum Mainnet';
      case 42161: return 'Arbitrum One';
      case 137: return 'Polygon';
      case 10: return 'Optimism';
      case 8453: return 'Base';
      default: return `Chain ${chainId}`;
    }
  };

  return (
    <div className="py-8">
      <h2 className="text-3xl font-bold mb-4 text-center">EIP-712 Order Signing Demo</h2>
      <div className="text-center mb-8">
        <span className="bg-blue-900/30 text-blue-300 px-3 py-1 rounded-full text-sm">
          Connected to {getChainName(chainId)} (Chain ID: {chainId})
        </span>
      </div>
      
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Order Form */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-6">Create Limit Order</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Maker Asset (Selling)</label>
              <input
                type="text"
                name="makerAsset"
                value={formData.makerAsset}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Token address"
              />
              <p className="text-xs text-gray-400 mt-1">USDC on Arbitrum</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Making Amount</label>
              <input
                type="text"
                name="makingAmount"
                value={formData.makingAmount}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Amount to sell"
              />
              <p className="text-xs text-gray-400 mt-1">Amount in USDC</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Taker Asset (Buying)</label>
              <input
                type="text"
                name="takerAsset"
                value={formData.takerAsset}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Token address"
              />
              <p className="text-xs text-gray-400 mt-1">WETH on Arbitrum</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Taking Amount</label>
              <input
                type="text"
                name="takingAmount"
                value={formData.takingAmount}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Amount to receive"
              />
              <p className="text-xs text-gray-400 mt-1">Amount in WETH</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Expires In (seconds)</label>
              <input
                type="number"
                name="expiresIn"
                value={formData.expiresIn}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="300"
              />
              <p className="text-xs text-gray-400 mt-1">Order expiration time</p>
            </div>

            {error && (
              <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              onClick={createAndSignOrder}
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-3 rounded-lg font-medium transition-colors"
            >
              {isLoading ? 'Signing Order...' : 'Create & Sign Order (EIP-712)'}
            </button>
          </div>
        </div>

        {/* Signed Order Display */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-6">Signed Order Data</h3>
          
          {!signedOrder ? (
            <div className="text-gray-400 text-center py-8">
              <p>No signed order yet</p>
              <p className="text-sm mt-2">Fill out the form and sign to see the EIP-712 data</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-green-400 mb-2">✅ Order Signed Successfully!</h4>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Order Hash</label>
                <code className="block w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-sm font-mono break-all">
                  {signedOrder.orderHash}
                </code>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Signature</label>
                <code className="block w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-sm font-mono break-all">
                  {signedOrder.signature}
                </code>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">EIP-712 Domain</label>
                <pre className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-xs font-mono overflow-auto max-h-32">
{JSON.stringify(signedOrder.typedData.domain, null, 2)}
                </pre>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">EIP-712 Types</label>
                <pre className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-xs font-mono overflow-auto max-h-32">
{JSON.stringify(signedOrder.typedData.types, null, 2)}
                </pre>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Order Message</label>
                <pre className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-xs font-mono overflow-auto max-h-48">
{JSON.stringify(signedOrder.typedData.message, (key, value) => 
  typeof value === 'bigint' ? value.toString() : value, 2)}
                </pre>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Maker Traits (Encoded)</label>
                <code className="block w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-sm font-mono break-all">
                  {signedOrder.makerTraits}
                </code>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Decoded Maker Traits</label>
                <div className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-sm space-y-1">
                  <div>• Nonce: {signedOrder.typedData.message.salt.toString()}</div>
                  <div>• Expiration: {new Date(Number(BigInt(signedOrder.makerTraits) >> 160n) * 1000).toLocaleString()}</div>
                  <div>• Multiple Fills: Allowed</div>
                  <div>• Partial Fills: Allowed</div>
                </div>
              </div>

              {/* Submit to Backend Button */}
              <div className="pt-4 border-t border-gray-600">
                <button
                  onClick={submitToBackend}
                  disabled={isSubmitting || !signedOrder}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-3 rounded-lg font-medium transition-colors"
                >
                  {isSubmitting ? 'Sending to Backend...' : '📤 Send Signed Order to Backend'}
                </button>
                
                {submitMessage && (
                  <div className={`mt-3 p-3 rounded-lg text-sm ${
                    submitMessage.startsWith('✅') 
                      ? 'bg-green-900/50 border border-green-500 text-green-200' 
                      : 'bg-red-900/50 border border-red-500 text-red-200'
                  }`}>
                    {submitMessage}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Information Section */}
      <div className="mt-8 bg-blue-900/20 border border-blue-500/30 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4 text-blue-300">About EIP-712 Signing</h3>
        <div className="text-sm text-gray-300 space-y-2">
          <p>• <strong>EIP-712</strong> is a standard for signing typed structured data</p>
          <p>• It provides a secure way to sign off-chain messages that can be verified on-chain</p>
          <p>• The signature includes the domain, types, and message data</p>
          <p>• 1inch Limit Orders use EIP-712 to create verifiable order signatures</p>
          <p>• The signature proves the order was created by the maker's wallet</p>
        </div>
      </div>
    </div>
  );
}
