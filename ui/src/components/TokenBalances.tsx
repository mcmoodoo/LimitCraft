import { useTokenBalances } from '../hooks/useTokenBalances';

interface TokenBalancesProps {
  address: string | undefined;
  chainId: number | undefined;
  onTokenSelect?: (tokenAddress: string, symbol: string) => void;
}

export default function TokenBalances({ address, chainId, onTokenSelect }: TokenBalancesProps) {
  const { balances, loading, error } = useTokenBalances(address, chainId);

  if (!address || !chainId) {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Your Token Balances</h3>
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Your Token Balances</h3>
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (balances.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Your Token Balances</h3>
        <p className="text-gray-400 text-center py-4">No tokens found in your wallet</p>
      </div>
    );
  }

  const formatBalance = (balance: string) => {
    const num = parseFloat(balance);
    if (num === 0) return '0';
    if (num < 0.000001) return '<0.000001';
    if (num < 1) return num.toFixed(6);
    if (num < 1000) return num.toFixed(4);
    if (num < 1000000) return `${(num / 1000).toFixed(2)}K`;
    return `${(num / 1000000).toFixed(2)}M`;
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold mb-4">Your Token Balances ({balances.length})</h3>

      <div className="max-h-64 overflow-y-auto space-y-2">
        {balances.map((token) => (
          <div
            key={token.token_address}
            className={`flex items-center justify-between p-3 rounded-lg border ${
              onTokenSelect
                ? 'border-gray-600 hover:border-blue-500 cursor-pointer hover:bg-gray-700'
                : 'border-gray-700 bg-gray-700'
            } transition-colors`}
            onClick={() => onTokenSelect?.(token.token_address, token.symbol)}
          >
            <div className="flex items-center space-x-3">
              {token.logo && (
                <img
                  src={token.logo}
                  alt={token.symbol}
                  className="w-8 h-8 rounded-full"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              )}
              <div>
                <div className="font-medium text-white">{token.symbol}</div>
                <div className="text-xs text-gray-400 truncate max-w-32">{token.name}</div>
              </div>
            </div>

            <div className="text-right">
              <div className="font-medium text-white">{formatBalance(token.balance_formatted)}</div>
              <div className="text-xs text-gray-400">
                {token.security_score && (
                  <span className="text-green-400">Score: {token.security_score}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-700">
        <p className="text-xs text-gray-500">
          💡 Click on a token to use it in your order. Only verified tokens are shown.
        </p>
      </div>
    </div>
  );
}
