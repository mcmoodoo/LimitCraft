import {
  Address,
  Extension,
  getLimitOrderContract,
  Interaction,
  LimitOrder,
  MakerTraits,
  randBigInt,
} from '@1inch/limit-order-sdk';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { navigationHelpers } from '../../router/navigation';
import { maxUint256, parseUnits } from 'viem';
import {
  useAccount,
  useChainId,
  useReadContract,
  useSignTypedData,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { ethers } from 'ethers';

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
  useTwapOrder: boolean;
  twapRunningTimeHours: number;
}

interface Token {
  token_address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balance_formatted: string;
  possible_spam: boolean;
  verified_contract: boolean;
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
  const lendingInteractionManagerAddress = '0x3195796c0999cee134ad7e957ad9767f89869b2c';
  const twapCalculatorAddress = '0x1DE87041738c30bc133a54DC1f8322Cf9A80a6B8';

  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const chainId = useChainId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [tokenPrices, setTokenPrices] = useState<Record<string, number>>({});
  const [rateFlipped, setRateFlipped] = useState(false);
  const [customRate, setCustomRate] = useState<string>('');

  const { writeContractAsync } = useWriteContract();
  const [approvalTxHash, setApprovalTxHash] = useState<string | null>(null);

  // Wait for approval transaction confirmation
  const approvalReceipt = useWaitForTransactionReceipt({
    hash: approvalTxHash as `0x${string}` | undefined,
  });

  // Get the limit order contract address for the current chain
  const limitOrderContractAddress = getLimitOrderContract(chainId);

  const [form, setForm] = useState<CreateOrderForm>({
    makerAsset: '',
    takerAsset: '',
    makingAmount: '',
    takingAmount: '',
    expiresIn: 3600, // 1 hour
    useLendingProtocol: false,
    lendingProtocol: 'aave',
    supplyToLendingProtocol: false,
    supplyLendingProtocol: 'aave',
    useTwapOrder: false,
    twapRunningTimeHours: 5,
  });

  // Fetch tokens from API
  useEffect(() => {
    const fetchTokens = async () => {
      if (!address) return;

      try {
        setTokensLoading(true);
        const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/v1/tokens/${address}?chainId=${chainId}`;
        console.log('Fetching tokens from:', url);

        const response = await fetch(url);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('API Response Error:', response.status, errorText);
          throw new Error(`Failed to fetch tokens: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        console.log('API Response:', data);
        setTokens(data.data?.tokens || []);

        // Set default tokens if available
        const tokens = data.data?.tokens || [];
        if (tokens.length > 0) {
          const usdcToken = tokens.find((token: Token) => token.symbol === 'USDC');
          const wethToken = tokens.find((token: Token) => token.symbol === 'WETH');

          setForm((prev) => ({
            ...prev,
            makerAsset: usdcToken?.token_address || tokens[0].token_address,
            takerAsset:
              wethToken?.token_address || tokens[1]?.token_address || tokens[0].token_address,
          }));
        }
      } catch (err) {
        console.error('Error fetching tokens:', err);
        setError('Failed to load tokens');
      } finally {
        setTokensLoading(false);
      }
    };

    fetchTokens();
  }, [address]);

  // Fetch token prices
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/v1/prices`
        );
        
        if (response.ok) {
          const data = await response.json();
          setTokenPrices(data.prices || {});
        }
      } catch (err) {
        console.error('Error fetching prices:', err);
      }
    };

    fetchPrices();
  }, []);

  // Get selected token decimals for step calculation
  const getSelectedTokenDecimals = (tokenAddress: string): number => {
    const token = tokens.find(t => t.token_address === tokenAddress);
    return token?.decimals || 18; // default to 18 if not found
  };

  // Generate step value based on token decimals
  const getStepForDecimals = (decimals: number): string => {
    return `0.${'0'.repeat(decimals - 1)}1`;
  };

  // Calculate USD value for a token amount
  const calculateUsdValue = (amount: string, tokenAddress: string): string => {
    if (!amount || !tokenAddress) return '0.00';
    
    const price = tokenPrices[tokenAddress.toLowerCase()];
    if (!price) return '0.00';
    
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) return '0.00';
    
    const usdValue = numAmount * price;
    
    if (usdValue < 0.01) return '<0.01';
    if (usdValue < 1000) return usdValue.toFixed(2);
    if (usdValue < 1000000) return `${(usdValue / 1000).toFixed(2)}K`;
    return `${(usdValue / 1000000).toFixed(2)}M`;
  };

  // Calculate exchange rate between two tokens
  const calculateExchangeRate = (): string => {
    // If user has set a custom rate, use that
    if (customRate !== '') return customRate;
    
    if (!form.makingAmount || !form.takingAmount || parseFloat(form.makingAmount) === 0) return '0';
    
    const makingNum = parseFloat(form.makingAmount);
    const takingNum = parseFloat(form.takingAmount);
    
    if (rateFlipped) {
      // Show taker/maker rate
      return (makingNum / takingNum).toFixed(6);
    } else {
      // Show maker/taker rate  
      return (takingNum / makingNum).toFixed(6);
    }
  };

  // Calculate market rate percentage difference
  const calculateMarketRatePercentage = (): string => {
    if (!form.makerAsset || !form.takerAsset || !form.makingAmount || !form.takingAmount) return '0.00';
    
    const makerPrice = tokenPrices[form.makerAsset.toLowerCase()];
    const takerPrice = tokenPrices[form.takerAsset.toLowerCase()];
    
    if (!makerPrice || !takerPrice) return '0.00';
    
    const makingNum = parseFloat(form.makingAmount);
    const takingNum = parseFloat(form.takingAmount);
    
    if (makingNum === 0 || takingNum === 0) return '0.00';
    
    // Market rate: how much taker token should be received for 1 maker token
    const marketRate = makerPrice / takerPrice;
    // User's rate: how much taker token user gets for 1 maker token
    const userRate = takingNum / makingNum;
    
    const percentageDiff = ((userRate - marketRate) / marketRate) * 100;
    
    return percentageDiff >= 0 ? `+${percentageDiff.toFixed(2)}` : percentageDiff.toFixed(2);
  };

  // Handle rate input change
  const handleRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCustomRate(value);
    
    // Recalculate taking amount based on the new rate
    if (value && form.makingAmount) {
      const rate = parseFloat(value);
      const makingNum = parseFloat(form.makingAmount);
      
      if (!isNaN(rate) && !isNaN(makingNum) && makingNum > 0) {
        let newTakingAmount: number;
        
        if (rateFlipped) {
          // Rate is taker/maker, so: takingAmount = makingAmount / rate
          newTakingAmount = makingNum / rate;
        } else {
          // Rate is maker/taker, so: takingAmount = makingAmount * rate
          newTakingAmount = makingNum * rate;
        }
        
        const takerDecimals = getSelectedTokenDecimals(form.takerAsset);
        setForm(prev => ({ 
          ...prev, 
          takingAmount: newTakingAmount.toFixed(takerDecimals) 
        }));
      }
    }
  };

  // Set to market rate
  const setToMarketRate = () => {
    if (!form.makerAsset || !form.takerAsset || !form.makingAmount) return;
    
    const makerPrice = tokenPrices[form.makerAsset.toLowerCase()];
    const takerPrice = tokenPrices[form.takerAsset.toLowerCase()];
    
    if (!makerPrice || !takerPrice) return;
    
    const makingNum = parseFloat(form.makingAmount);
    if (makingNum === 0) return;
    
    const marketRate = makerPrice / takerPrice;
    const marketTakingAmount = (makingNum * marketRate).toFixed(6);
    
    setForm(prev => ({ ...prev, takingAmount: marketTakingAmount }));
    setCustomRate(''); // Clear custom rate when setting to market
  };

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
    lendingInteractionManagerAddress,
    address
  );
  const takerApproval = useTokenApproval(
    form.takerAsset,
    lendingInteractionManagerAddress,
    address
  );

  // Calculate required amounts
  const requiredAmounts = useMemo(() => {
    if (!form.makingAmount || !form.takingAmount || !form.makerAsset || !form.takerAsset) return null;

    const makerDecimals = getSelectedTokenDecimals(form.makerAsset);
    const takerDecimals = getSelectedTokenDecimals(form.takerAsset);

    const makingAmountWei = parseUnits(form.makingAmount, makerDecimals);
    const takingAmountWei = parseUnits(form.takingAmount, takerDecimals);

    return { makingAmountWei, takingAmountWei };
  }, [form.makingAmount, form.takingAmount, form.makerAsset, form.takerAsset, tokens]);

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
        spender: lendingInteractionManagerAddress,
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
        spender: lendingInteractionManagerAddress,
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

      const extensionData = {
        ...Extension.EMPTY,
      };

      // Only enable pre-interaction if "Use Lending Position" is toggled on
      if (form.useLendingProtocol) {
        makerTraits = makerTraits.enablePreInteraction().withExtension();
        const preInteraction = new Interaction(
          new Address(lendingInteractionManagerAddress),
          '0x00'
        );
        extensionData.preInteraction = preInteraction.encode();
      }

      // Only enable post-interaction if "Supply to Lending Protocol" is toggled on
      if (form.supplyToLendingProtocol) {
        makerTraits = makerTraits.enablePostInteraction().withExtension();
        const postInteraction = new Interaction(
          new Address(lendingInteractionManagerAddress),
          '0x00'
        );
        extensionData.postInteraction = postInteraction.encode();
      }

      if (form.useTwapOrder) {
        makerTraits = makerTraits.allowPartialFills();
        const startTime = Math.floor(Date.now() / 1000);
        const endTime = startTime + form.twapRunningTimeHours * 3600;
        const numberOfOrders = form.twapRunningTimeHours;
        console.log('startTime', startTime);
        console.log('endTime', endTime);
        console.log('numberOfOrders', numberOfOrders);
        extensionData.makingAmountData = ethers.solidityPacked(
          ['address', 'uint256', 'uint256', 'uint256'],
          [twapCalculatorAddress, startTime, endTime, numberOfOrders]
        );
        extensionData.takingAmountData = ethers.solidityPacked(
          ['address'],
          [twapCalculatorAddress]
        );
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
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/v1/orders`,
        {
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
        }
      );

      const result = await response.json();

      if (result.success) {
        setSuccess(`Order created successfully! Order hash: ${result.data.orderHash}`);
        setApprovalStatus(null);
        setTimeout(() => {
          navigate(navigationHelpers.toOrders());
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

  // Handler to prevent invalid key presses
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const allowedKeys = [
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
      '.', 'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 
      'ArrowUp', 'ArrowDown', 'Tab', 'Enter', 'Escape'
    ];
    
    // Allow Ctrl/Cmd combinations (copy, paste, select all, etc.)
    if (e.ctrlKey || e.metaKey) {
      return;
    }
    
    if (!allowedKeys.includes(e.key)) {
      e.preventDefault();
      return;
    }
    
    // Prevent multiple decimal points
    if (e.key === '.' && e.currentTarget.value.includes('.')) {
      e.preventDefault();
    }
  };

  // Custom handler for amount inputs that validates decimal places and format
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>, tokenAddress: string) => {
    const { name, value } = e.target;
    
    // Clear custom rate when user manually changes amounts
    setCustomRate('');
    
    // Allow empty value
    if (value === '') {
      setForm((prev) => ({ ...prev, [name]: value }));
      return;
    }

    // Regex to allow only digits and single decimal point
    const regex = /^\d*\.?\d*$/;
    if (!regex.test(value)) {
      return; // Don't update if invalid format
    }

    const decimals = getSelectedTokenDecimals(tokenAddress);
    const decimalParts = value.split('.');
    
    // If there's a decimal part, check if it exceeds allowed decimals
    if (decimalParts.length === 2 && decimalParts[1].length > decimals) {
      // Truncate to allowed decimal places
      const truncatedValue = `${decimalParts[0]}.${decimalParts[1].substring(0, decimals)}`;
      setForm((prev) => ({ ...prev, [name]: truncatedValue }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleTokenSelect = (
    tokenAddress: string,
    symbol: string,
    field: 'makerAsset' | 'takerAsset'
  ) => {
    setForm((prev) => ({
      ...prev,
      [field]: tokenAddress,
    }));
  };

  // Custom Token Dropdown Component
  const TokenDropdown = ({ 
    selectedTokenAddress, 
    onTokenSelect, 
    disabled 
  }: { 
    selectedTokenAddress: string; 
    onTokenSelect: (address: string) => void; 
    disabled: boolean; 
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedToken = tokens.find(t => t.token_address === selectedTokenAddress);

    const formatBalance = (balance: string) => {
      const num = parseFloat(balance);
      if (num === 0) return '0';
      if (num < 0.000001) return '<0.000001';
      if (num < 1) return num.toFixed(6);
      if (num < 1000) return num.toFixed(4);
      if (num < 1000000) return `${(num / 1000).toFixed(2)}K`;
      return `${(num / 1000000).toFixed(2)}M`;
    };

    // Close dropdown when clicking outside
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className="w-40 px-3 py-2 bg-transparent border-0 rounded-l-lg focus:outline-none flex items-center justify-between text-left"
        >
          {disabled ? (
            <span className="text-gray-400">Loading...</span>
          ) : selectedToken ? (
            <div className="flex items-center space-x-2">
              {selectedToken.logo && (
                <img
                  src={selectedToken.logo}
                  alt={selectedToken.symbol}
                  className="w-4 h-4 rounded-full"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <span className="font-medium text-white text-sm truncate">{selectedToken.symbol}</span>
            </div>
          ) : (
            <span className="text-gray-400">Select</span>
          )}
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && !disabled && (
          <div className="absolute top-full left-0 w-80 z-50 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {tokens.map((token) => (
              <div
                key={token.token_address}
                className="flex items-center justify-between p-3 hover:bg-gray-700 cursor-pointer border-b border-gray-700 last:border-b-0"
                onClick={() => {
                  onTokenSelect(token.token_address);
                  setIsOpen(false);
                }}
              >
                <div className="flex items-center space-x-3">
                  {token.logo && (
                    <img
                      src={token.logo}
                      alt={token.symbol}
                      className="w-6 h-6 rounded-full"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                  <div>
                    <div className="font-medium text-white text-sm">{token.symbol}</div>
                    <div className="text-xs text-gray-400 truncate max-w-40">{token.name}</div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-medium text-white text-sm">{formatBalance(token.balance_formatted)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

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
        <Link to={navigationHelpers.toHome()} className="text-blue-400 hover:text-blue-300">
          ← Back to Home
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center mb-6">
        <Link to={navigationHelpers.toOrders()} className="text-blue-400 hover:text-blue-300 mr-4">
          ← Back to Orders
        </Link>
        <h1 className="text-3xl font-bold">Create Order</h1>
      </div>

      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-gray-800 rounded-lg p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-6">
                  <div className="border border-gray-600 rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-4 text-green-400 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                      You pay
                    </h3>

                    <div className="space-y-4">
                      <div className="flex bg-gray-700 border border-gray-600 rounded-lg focus-within:ring-2 focus-within:ring-blue-500">
                        <TokenDropdown
                          selectedTokenAddress={form.makerAsset}
                          onTokenSelect={(address) => setForm(prev => ({ ...prev, makerAsset: address }))}
                          disabled={tokensLoading}
                        />
                        <input
                          id="makingAmount"
                          type="number"
                          name="makingAmount"
                          value={form.makingAmount}
                          onChange={(e) => handleAmountChange(e, form.makerAsset)}
                          onKeyDown={handleKeyDown}
                          step={getStepForDecimals(getSelectedTokenDecimals(form.makerAsset))}
                          min="0"
                          inputMode="decimal"
                          className="flex-1 px-3 py-2 bg-transparent border-0 rounded-r-lg focus:outline-none text-right [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                          placeholder="0.0"
                          required
                        />
                      </div>
                      {form.makerAsset && (
                        <div className="flex justify-between items-center text-lg">
                          <div className="text-left">
                            {(() => {
                              const selectedToken = tokens.find(t => t.token_address === form.makerAsset);
                              if (selectedToken) {
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
                                  <>
                                    <span className="text-white font-medium">{selectedToken.name}</span>
                                    <span className="text-gray-400"> available: {formatBalance(selectedToken.balance_formatted)}</span>
                                  </>
                                );
                              }
                              return <span className="text-gray-400">Available: 0</span>;
                            })()}
                          </div>
                          {form.makingAmount && (
                            <div className="text-gray-500">
                              ≈ ${calculateUsdValue(form.makingAmount, form.makerAsset)} USD
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border border-gray-600 rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-4 text-blue-400 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                      </svg>
                      You get
                    </h3>

                    <div className="space-y-4">
                      <div className="flex bg-gray-700 border border-gray-600 rounded-lg focus-within:ring-2 focus-within:ring-blue-500">
                        <TokenDropdown
                          selectedTokenAddress={form.takerAsset}
                          onTokenSelect={(address) => setForm(prev => ({ ...prev, takerAsset: address }))}
                          disabled={tokensLoading}
                        />
                        <input
                          id="takingAmount"
                          type="number"
                          name="takingAmount"
                          value={form.takingAmount}
                          onChange={(e) => handleAmountChange(e, form.takerAsset)}
                          onKeyDown={handleKeyDown}
                          step={getStepForDecimals(getSelectedTokenDecimals(form.takerAsset))}
                          min="0"
                          inputMode="decimal"
                          className="flex-1 px-3 py-2 bg-transparent border-0 rounded-r-lg focus:outline-none text-right [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                          placeholder="0.0"
                          required
                        />
                      </div>
                      {form.takerAsset && (
                        <div className="flex justify-between items-center text-lg">
                          <div className="text-left">
                            {(() => {
                              const selectedToken = tokens.find(t => t.token_address === form.takerAsset);
                              if (selectedToken) {
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
                                  <>
                                    <span className="text-white font-medium">{selectedToken.name}</span>
                                    <span className="text-gray-400"> balance: {formatBalance(selectedToken.balance_formatted)}</span>
                                  </>
                                );
                              }
                              return <span className="text-gray-400">Available: 0</span>;
                            })()}
                          </div>
                          {form.takingAmount && (
                            <div className="text-gray-500">
                              ≈ ${calculateUsdValue(form.takingAmount, form.takerAsset)} USD
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Rate Display */}
                  <div className="border border-gray-600 rounded-lg p-4 space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-400">
                          Pay {(() => {
                            const selectedToken = tokens.find(t => t.token_address === form.makerAsset);
                            return selectedToken?.symbol || 'Token';
                          })()} at rate ({calculateMarketRatePercentage()}%)
                        </span>
                        <button
                          type="button"
                          onClick={setToMarketRate}
                          className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                        >
                          Set to market
                        </button>
                      </div>
                      
                      {/* Rate Input */}
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          value={calculateExchangeRate()}
                          onChange={handleRateChange}
                          step="0.000001"
                          min="0"
                          placeholder="0.000000"
                          className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setRateFlipped(!rateFlipped);
                            setCustomRate(''); // Clear custom rate when flipping
                          }}
                          className="p-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg transition-colors"
                        >
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                        <span className="text-sm text-gray-400 min-w-16">
                          {(() => {
                            const makerToken = tokens.find(t => t.token_address === form.makerAsset);
                            const takerToken = tokens.find(t => t.token_address === form.takerAsset);
                            
                            if (rateFlipped) {
                              return makerToken?.symbol || 'Token';
                            } else {
                              return takerToken?.symbol || 'Token';
                            }
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-300">
                      Withdraw from Lending Position
                    </span>
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

                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-300">TWAP Order</label>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({ ...prev, useTwapOrder: !prev.useTwapOrder }))
                      }
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 ${
                        form.useTwapOrder ? 'bg-blue-600' : 'bg-gray-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          form.useTwapOrder ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {form.useTwapOrder && (
                    <div className="mt-3">
                      <label className="block text-sm font-medium mb-2">Running Time (hours)</label>
                      <input
                        type="number"
                        name="twapRunningTimeHours"
                        value={form.twapRunningTimeHours}
                        onChange={handleChange}
                        min="1"
                        max="168"
                        step="1"
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="1"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        TWAP will execute over this time period (1-168 hours)
                      </p>
                    </div>
                  )}

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
                    {loading
                      ? approvalStatus
                        ? approvalStatus
                        : 'Creating Order...'
                      : 'Create Order'}
                  </button>

                  <Link
                    to={navigationHelpers.toOrders()}
                    className="px-6 py-3 border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors text-center"
                  >
                    Cancel
                  </Link>
                </div>
              </form>
            </div>
          </div>

          <div className="space-y-6">

            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-xs text-gray-500">
                📝 Note: You may need to approve token spending before creating the order.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
