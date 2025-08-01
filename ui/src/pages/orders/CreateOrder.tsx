import {
  Address,
  Extension,
  getLimitOrderContract,
  Interaction,
  LimitOrder,
  MakerTraits,
  randBigInt,
} from '@1inch/limit-order-sdk';
import { ethers } from 'ethers';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Slider } from '../../components/ui/slider';
import { Switch } from '../../components/ui/switch';
import { navigationHelpers } from '../../router/navigation';
import { usePermit2, type Permit2Data } from '../../hooks/usePermit2';

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
  usePermit2: boolean;
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
  logo?: string;
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
  const [customRate, setCustomRate] = useState<string>('');

  const { writeContractAsync } = useWriteContract();
  const [approvalTxHash, setApprovalTxHash] = useState<string | null>(null);
  const [_permit2Data, setPermit2Data] = useState<Permit2Data | null>(null);

  // Wait for approval transaction confirmation
  const approvalReceipt = useWaitForTransactionReceipt({
    hash: approvalTxHash as `0x${string}` | undefined,
  });

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
    usePermit2: false,
  });

  // Permit2 integration
  const {
    isPermit2Approved,
    generatePermit2Signature,
    permit2Loading,
    permit2Error,
  } = usePermit2(form.makerAsset);

  // Get the limit order contract address for the current chain
  const limitOrderContractAddress = getLimitOrderContract(chainId);

  // Fetch prices from API
  const fetchPrices = async (token1: string, token2: string) => {
    if (!token1 || !token2) return;

    try {
      const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/v1/prices?token1=${token1}&token2=${token2}&chainId=${chainId}`;

      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Price API Response Error:', response.status, errorText);
        return;
      }

      const priceData = await response.json();

      // Convert string prices to numbers and store in state
      const prices: Record<string, number> = {};
      Object.entries(priceData).forEach(([address, price]) => {
        prices[address.toLowerCase()] = parseFloat(price as string);
      });

      setTokenPrices(prices);
    } catch (err) {
      console.error('Error fetching prices:', err);
    }
  };

  // Fetch tokens from API
  useEffect(() => {
    const fetchTokens = async () => {
      if (!address) return;

      try {
        setTokensLoading(true);
        const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/v1/tokens/${address}?chainId=${chainId}`;

        const response = await fetch(url);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('API Response Error:', response.status, errorText);
          throw new Error(`Failed to fetch tokens: ${response.status} ${errorText}`);
        }

        const data = await response.json();
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
            makingAmount: '1', // Default to 1 token
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

  // Fetch prices when both tokens are selected
  useEffect(() => {
    if (form.makerAsset && form.takerAsset && form.makerAsset !== form.takerAsset) {
      fetchPrices(form.makerAsset, form.takerAsset);
    }
  }, [form.makerAsset, form.takerAsset, chainId]);

  // Auto-calculate taking amount based on spot price when prices are loaded or making amount changes
  useEffect(() => {
    if (Object.keys(tokenPrices).length > 0 && form.makingAmount && !customRate) {
      calculateTakingAmountFromSpot();
    }
  }, [tokenPrices, form.makingAmount, form.makerAsset, form.takerAsset, customRate]);

  // Apply dynamic color to slider based on position
  useEffect(() => {
    const position = getSpectrumPosition();
    const color = getSliderColor(position);

    // Color the track
    const selectors = [
      '.spectrum-gradient-slider [data-orientation="horizontal"]',
      '.spectrum-gradient-slider span[data-orientation="horizontal"]',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector) as HTMLElement;
      if (element) {
        element.style.background = color;
        element.style.setProperty('background', color, 'important');
        console.log('Applied color to:', selector, color);
        break;
      }
    }

    // Color the thumb
    const thumb = document.querySelector(
      '.spectrum-gradient-slider [role="slider"]'
    ) as HTMLElement;
    if (thumb) {
      thumb.style.background = color;
      thumb.style.setProperty('background', color, 'important');
    }

    // Color the percentage text
    const percentageText = document.querySelector('.dynamic-percentage-text') as HTMLElement;
    if (percentageText) {
      percentageText.style.color = color;
      percentageText.style.setProperty('color', color, 'important');
    }
  }, [form.makingAmount, form.takingAmount, form.makerAsset, form.takerAsset, tokenPrices]);

  // Get selected token decimals for step calculation
  const getSelectedTokenDecimals = (tokenAddress: string): number => {
    const token = tokens.find((t) => t.token_address === tokenAddress);
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

  // Get numerical percentage difference for logic
  const getMarketRatePercentageNum = (): number => {
    if (!form.makerAsset || !form.takerAsset || !form.makingAmount || !form.takingAmount) return 0;

    const makerPrice = tokenPrices[form.makerAsset.toLowerCase()];
    const takerPrice = tokenPrices[form.takerAsset.toLowerCase()];

    if (!makerPrice || !takerPrice) return 0;

    const makingNum = parseFloat(form.makingAmount);
    const takingNum = parseFloat(form.takingAmount);

    if (makingNum === 0 || takingNum === 0) return 0;

    const marketRate = makerPrice / takerPrice;
    const userRate = takingNum / makingNum;

    return ((userRate - marketRate) / marketRate) * 100;
  };

  // Get position for spectrum slider (0-100% positioning) - Fixed formula
  const getSpectrumPosition = (): number => {
    const percentage = getMarketRatePercentageNum();
    // Clamp between -50% and +50%, then convert to 0-100% scale for positioning
    const clampedPercentage = Math.max(-50, Math.min(50, percentage));
    return clampedPercentage + 50; // Simplified from ((clampedPercentage + 50) / 100) * 100
  };

  // Get color based on slider position with non-linear transitions
  const getSliderColor = (position: number): string => {
    const clampedPosition = Math.max(0, Math.min(100, position));

    // Convert position (0-100) to market percentage (-50% to +50%)
    const marketPercentage = (clampedPosition / 100) * 100 - 50;

    if (marketPercentage < 0) {
      // Left side: Red to Light Green
      if (marketPercentage >= -5) {
        // -5% to 0%: Light Red to Orange to Light Green transition

        if (marketPercentage >= -2.5) {
          // -2.5% to 0%: Orange to Light Green
          const orangeToGreenFactor = Math.abs(marketPercentage) / 2.5;
          // Orange (255,165,0) to Light Green (144,238,144)
          const red = Math.round(255 * orangeToGreenFactor + 144 * (1 - orangeToGreenFactor));
          const green = Math.round(165 * orangeToGreenFactor + 238 * (1 - orangeToGreenFactor));
          const blue = Math.round(0 * orangeToGreenFactor + 144 * (1 - orangeToGreenFactor));
          return `rgb(${red}, ${green}, ${blue})`;
        } else {
          // -5% to -2.5%: Light Red to Orange
          const lightRedToOrangeFactor = (Math.abs(marketPercentage) - 2.5) / 2.5;
          // Light Red (255,128,128) to Orange (255,165,0)
          const red = 255;
          const green = Math.round(128 + (165 - 128) * (1 - lightRedToOrangeFactor));
          const blue = Math.round(128 * lightRedToOrangeFactor);
          return `rgb(${red}, ${green}, ${blue})`;
        }
      } else {
        // -50% to -5%: Complete Red to Light Red
        const factor = (Math.abs(marketPercentage) - 5) / 45; // 0 at -5%, 1 at -50%
        // Complete Red (255,0,0) to Light Red (255,128,128)
        const red = 255;
        const green = Math.round(128 * (1 - factor));
        const blue = Math.round(128 * (1 - factor));
        return `rgb(${red}, ${green}, ${blue})`;
      }
    } else if (marketPercentage === 0) {
      // Exactly at 0%: Light Green
      return 'rgb(144, 238, 144)';
    } else {
      // Right side: Light Green to Dark Green (0% to +50%)
      const normalizedPos = marketPercentage / 50; // 0 to 1

      let factor;
      if (normalizedPos <= 0.04) {
        // 0% to +2% (slow transition)
        factor = (normalizedPos / 0.04) * 0.3; // Light green range
      } else {
        // +2% to +50% (accelerate to dark green)
        const remaining = (normalizedPos - 0.04) / 0.96;
        factor = 0.3 + remaining * 0.7; // Accelerate to dark green
      }

      // Light Green (144,238,144) to Dark Green (0,100,0)
      const red = Math.round(144 * (1 - factor));
      const green = Math.round(238 - 138 * factor); // 238 to 100
      const blue = Math.round(144 * (1 - factor));
      return `rgb(${red}, ${green}, ${blue})`;
    }
  };

  // Convert mouse position to market percentage
  const positionToPercentage = (position: number): number => {
    // Position is 0-100%, convert to -50% to +50% market percentage
    const clampedPosition = Math.max(0, Math.min(100, position));
    return (clampedPosition / 100) * 100 - 50;
  };

  // Update token amounts based on market percentage
  const updateAmountsFromPosition = (marketPercentage: number) => {
    if (!form.makerAsset || !form.takerAsset || !form.makingAmount) return;

    const makerPrice = tokenPrices[form.makerAsset.toLowerCase()];
    const takerPrice = tokenPrices[form.takerAsset.toLowerCase()];

    if (!makerPrice || !takerPrice) return;

    const makingNum = parseFloat(form.makingAmount);
    if (isNaN(makingNum) || makingNum <= 0) return;

    // Calculate market rate and adjust by percentage
    const marketRate = makerPrice / takerPrice;
    const adjustedRate = marketRate * (1 + marketPercentage / 100);
    const newTakingAmount = makingNum * adjustedRate;

    // Format to appropriate decimal places
    const takerDecimals = getSelectedTokenDecimals(form.takerAsset);
    const formattedAmount = newTakingAmount.toFixed(Math.min(takerDecimals, 8));

    setForm((prev) => ({ ...prev, takingAmount: formattedAmount }));
    setCustomRate(''); // Clear custom rate when using spectrum
  };

  // Handle market spectrum slider value change
  const handleSpectrumSliderChange = (value: number[]) => {
    const position = value[0]; // 0-100
    const percentage = positionToPercentage(position);
    updateAmountsFromPosition(percentage);

    // Update slider color immediately
    const color = getSliderColor(position);

    // Color the track
    const selectors = [
      '.spectrum-gradient-slider [data-orientation="horizontal"]',
      '.spectrum-gradient-slider span[data-orientation="horizontal"]',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector) as HTMLElement;
      if (element) {
        element.style.background = color;
        element.style.setProperty('background', color, 'important');
        break;
      }
    }

    // Color the thumb
    const thumb = document.querySelector(
      '.spectrum-gradient-slider [role="slider"]'
    ) as HTMLElement;
    if (thumb) {
      thumb.style.background = color;
      thumb.style.setProperty('background', color, 'important');
    }

    // Color the percentage text
    const percentageText = document.querySelector('.dynamic-percentage-text') as HTMLElement;
    if (percentageText) {
      percentageText.style.color = color;
      percentageText.style.setProperty('color', color, 'important');
    }
  };

  // Calculate taking amount based on spot price with +3% markup
  const calculateTakingAmountFromSpot = () => {
    if (!form.makerAsset || !form.takerAsset || !form.makingAmount) return;

    const makerPrice = tokenPrices[form.makerAsset.toLowerCase()];
    const takerPrice = tokenPrices[form.takerAsset.toLowerCase()];

    if (!makerPrice || !takerPrice) return;

    const makingNum = parseFloat(form.makingAmount);
    if (isNaN(makingNum) || makingNum <= 0) return;

    // Calculate spot rate with +3% markup for better pricing
    const spotRate = makerPrice / takerPrice;
    const adjustedRate = spotRate * 1.03; // +3% above market
    const takingAmount = makingNum * adjustedRate;

    // Format to appropriate decimal places
    const takerDecimals = getSelectedTokenDecimals(form.takerAsset);
    const formattedAmount = takingAmount.toFixed(Math.min(takerDecimals, 8));

    setForm((prev) => ({ ...prev, takingAmount: formattedAmount }));
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

    setForm((prev) => ({ ...prev, takingAmount: marketTakingAmount }));
    setCustomRate(''); // Clear custom rate when setting to market
  };

  // Switch token positions and flip amounts with +3% markup
  const handleTokenSwitch = () => {
    if (!form.makerAsset || !form.takerAsset || !form.takingAmount) return;

    const currentTakingAmount = parseFloat(form.takingAmount);
    if (isNaN(currentTakingAmount) || currentTakingAmount <= 0) return;

    // Calculate new taking amount with +3% markup using spot prices
    const oldMakerPrice = tokenPrices[form.makerAsset.toLowerCase()];
    const oldTakerPrice = tokenPrices[form.takerAsset.toLowerCase()];

    if (!oldMakerPrice || !oldTakerPrice) return;

    // After switch: old taker becomes new maker, old maker becomes new taker
    const newMakerPrice = oldTakerPrice; // what was taker price
    const newTakerPrice = oldMakerPrice; // what was maker price

    const spotRate = newMakerPrice / newTakerPrice;
    const adjustedRate = spotRate * 1.03; // +3% markup
    const newTakingAmount = currentTakingAmount * adjustedRate;

    // Get decimals for formatting
    const newTakerDecimals = getSelectedTokenDecimals(form.makerAsset); // will become new taker
    const formattedNewTakingAmount = newTakingAmount.toFixed(Math.min(newTakerDecimals, 8));

    // Switch the tokens and amounts
    setForm((prev) => ({
      ...prev,
      makerAsset: prev.takerAsset,
      takerAsset: prev.makerAsset,
      makingAmount: prev.takingAmount,
      takingAmount: formattedNewTakingAmount,
    }));

    setCustomRate(''); // Clear custom rate
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
    if (!form.makingAmount || !form.takingAmount || !form.makerAsset || !form.takerAsset)
      return null;

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
      // Handle Permit2 or traditional approvals
      let permit2Signature: Permit2Data | null = null;
      
      if (form.usePermit2) {
        // Use Permit2 - generate signature instead of approvals
        setApprovalStatus('Generating Permit2 signature...');
        
        if (!requiredAmounts) {
          setError('Please enter valid amounts');
          setLoading(false);
          return;
        }

        try {
          permit2Signature = await generatePermit2Signature(
            form.makerAsset,
            requiredAmounts.makingAmountWei
          );
          setPermit2Data(permit2Signature);
          setApprovalStatus('Permit2 signature generated! Creating order...');
        } catch (error) {
          console.error('Failed to generate Permit2 signature:', error);
          setError(error instanceof Error ? error.message : 'Failed to generate Permit2 signature');
          setLoading(false);
          return;
        }
      } else {
        // Traditional approval process
        const approvalsSuccess = await processApprovals();
        if (!approvalsSuccess) {
          setLoading(false);
          return;
        }
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

      // Enable Permit2 if selected
      if (form.usePermit2) {
        makerTraits = makerTraits.enablePermit2();
      }

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
            ...(permit2Signature && {
              permit2Data: {
                permitSingle: permit2Signature.permitSingle,
                permit2Signature: permit2Signature.signature,
              },
            }),
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
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '.',
      'Backspace',
      'Delete',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Tab',
      'Enter',
      'Escape',
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

    // Prevent leading zeros (except for decimal numbers like 0.5)
    if (value.length > 1 && value[0] === '0' && value[1] !== '.') {
      return; // Don't update state for invalid leading zeros like 01, 000, etc.
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

  // Custom Token Dropdown Component
  const TokenDropdown = ({
    selectedTokenAddress,
    onTokenSelect,
    disabled,
  }: {
    selectedTokenAddress: string;
    onTokenSelect: (address: string) => void;
    disabled: boolean;
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedToken = tokens.find((t) => t.token_address === selectedTokenAddress);

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
          className="w-32 px-3 py-2 bg-transparent border-0 rounded-l-lg focus:outline-none flex items-center justify-between text-left"
        >
          {disabled ? (
            <span className="text-gray-400 text-xs">Loading...</span>
          ) : selectedToken ? (
            <div className="flex items-center space-x-1">
              {selectedToken.logo && (
                <img
                  src={selectedToken.logo}
                  alt={selectedToken.symbol}
                  className="w-3 h-3 rounded-full"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <span className="font-medium text-white text-sm truncate">
                {selectedToken.symbol}
              </span>
            </div>
          ) : (
            <span className="text-gray-400 text-xs">Select</span>
          )}
          <svg
            className="w-3 h-3 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && !disabled && (
          <div className="absolute top-full left-0 w-80 z-50 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {tokens.map((token) => (
              <div
                key={token.token_address}
                className="flex items-center justify-between p-2 hover:bg-gray-700 cursor-pointer border-b border-gray-700 last:border-b-0"
                onClick={() => {
                  onTokenSelect(token.token_address);
                  setIsOpen(false);
                }}
              >
                <div className="flex items-center space-x-2">
                  {token.logo && (
                    <img
                      src={token.logo}
                      alt={token.symbol}
                      className="w-5 h-5 rounded-full"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                  <div>
                    <div className="font-medium text-white text-base">{token.symbol}</div>
                    <div className="text-xs text-gray-400 truncate max-w-40">{token.name}</div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-medium text-white text-sm">
                    {formatBalance(token.balance_formatted)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Expiration options in minutes (will be converted to seconds for form.expiresIn)
  const expirationMinutes = [1, 2, 3, 4, 5, 10, 15, 20, 30, 60, 120, 300, 600, 1440]; // 1 min to 24 hours

  // Helper functions for slider synchronization (working with minutes)
  const getSliderValueFromExpiration = (expiresIn: number): number => {
    const minutes = Math.round(expiresIn / 60);
    const index = expirationMinutes.findIndex((min) => min === minutes);
    return index >= 0 ? index : 4; // Default to 60 minutes index
  };

  const getExpirationFromSliderValue = (sliderValue: number): number => {
    const minutes = expirationMinutes[sliderValue] || 60; // Default to 60 minutes
    return minutes * 60; // Convert to seconds for form.expiresIn
  };

  const handleSliderChange = (value: number[]) => {
    const newExpiration = getExpirationFromSliderValue(value[0]);
    setForm((prev) => ({ ...prev, expiresIn: newExpiration }));
  };

  // Convert seconds to minutes for display
  const getMinutesFromSeconds = (seconds: number): number => {
    return Math.round(seconds / 60);
  };

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
      <div className="flex items-center mb-3">
        <Link to={navigationHelpers.toOrders()} className="text-blue-400 hover:text-blue-300 mr-3">
          ← Back to Orders
        </Link>
        <h1 className="text-2xl font-bold">Create Order</h1>
      </div>

      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <div className="bg-gray-800 rounded-lg p-4">
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-3">
                  {/* Token sections with reduced spacing */}
                  <div className="space-y-1 relative">
                    <div className="border border-gray-600 rounded-lg p-3">
                      <h3 className="text-base font-semibold mb-2 text-green-400 flex items-center gap-1">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 14l-7 7m0 0l-7-7m7 7V3"
                          />
                        </svg>
                        You pay
                      </h3>

                      <div className="space-y-2">
                        <div className="flex bg-gray-700 border border-gray-600 rounded-lg focus-within:ring-2 focus-within:ring-blue-500">
                          <TokenDropdown
                            selectedTokenAddress={form.makerAsset}
                            onTokenSelect={(address) =>
                              setForm((prev) => ({ ...prev, makerAsset: address }))
                            }
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
                          <div className="flex justify-between items-center text-sm">
                            <div className="text-left">
                              {(() => {
                                const selectedToken = tokens.find(
                                  (t) => t.token_address === form.makerAsset
                                );
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
                                      <span className="text-white font-medium">
                                        {selectedToken.name}
                                      </span>
                                      <span className="text-gray-400">
                                        {' '}
                                        available: {formatBalance(selectedToken.balance_formatted)}
                                      </span>
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

                    {/* Token Switch Button - positioned to overlap both sections */}
                    <div className="flex justify-center absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
                      <button
                        type="button"
                        onClick={handleTokenSwitch}
                        disabled={!form.makerAsset || !form.takerAsset || !form.takingAmount}
                        className="w-10 h-10 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:cursor-not-allowed border-2 border-gray-500 rounded-full flex items-center justify-center transition-colors duration-200 shadow-lg"
                        title="Switch tokens and flip amounts"
                      >
                        <svg
                          className="w-4 h-4 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                          />
                        </svg>
                      </button>
                    </div>

                    <div className="border border-gray-600 rounded-lg p-3">
                      <h3 className="text-base font-semibold mb-2 text-blue-400 flex items-center gap-1">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 10l7-7m0 0l7 7m-7-7v18"
                          />
                        </svg>
                        You get
                      </h3>

                      <div className="space-y-2">
                        <div className="flex bg-gray-700 border border-gray-600 rounded-lg focus-within:ring-2 focus-within:ring-blue-500">
                          <TokenDropdown
                            selectedTokenAddress={form.takerAsset}
                            onTokenSelect={(address) =>
                              setForm((prev) => ({ ...prev, takerAsset: address }))
                            }
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
                          <div className="flex justify-between items-center text-sm">
                            <div className="text-left">
                              {(() => {
                                const selectedToken = tokens.find(
                                  (t) => t.token_address === form.takerAsset
                                );
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
                                      <span className="text-white font-medium">
                                        {selectedToken.name}
                                      </span>
                                      <span className="text-gray-400">
                                        {' '}
                                        balance: {formatBalance(selectedToken.balance_formatted)}
                                      </span>
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
                  </div>

                  {/* Market Position Spectrum */}
                  {form.makerAsset &&
                    form.takerAsset &&
                    form.makingAmount &&
                    form.takingAmount &&
                    Object.keys(tokenPrices).length > 0 && (
                      <div className="p-2 space-y-2">
                        <div className="relative mb-1">
                          {/* Exchange rate - left aligned */}
                          <div className="text-left">
                            <span className="text-sm font-medium text-gray-300">
                              1 {(() => {
                                const makerToken = tokens.find(
                                  (t) => t.token_address === form.makerAsset
                                );
                                return makerToken?.symbol || 'Token';
                              })()} for {(() => {
                                const makingNum = parseFloat(form.makingAmount) || 1;
                                const takingNum = parseFloat(form.takingAmount) || 0;
                                const rate =
                                  makingNum > 0 ? (takingNum / makingNum).toFixed(4) : '0.0000';
                                const takerToken = tokens.find(
                                  (t) => t.token_address === form.takerAsset
                                );
                                return `${rate} ${takerToken?.symbol || 'Token'}`;
                              })()}
                            </span>
                          </div>

                          {/* Market Spot - always centered */}
                          <div className="absolute top-0 left-1/2 transform -translate-x-1/2">
                            <button
                              type="button"
                              onClick={setToMarketRate}
                              className="text-gray-400 hover:text-gray-300 font-medium transition-colors"
                            >
                              Market Spot
                            </button>
                          </div>

                          {/* Percentage - right aligned */}
                          <div className="absolute top-0 right-0">
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-semibold dynamic-percentage-text">
                                {getMarketRatePercentageNum() > 0 ? '+' : ''}
                                {getMarketRatePercentageNum().toFixed(1)}%
                              </span>
                              <span className="text-xs text-gray-500">vs </span>
                              <button
                                type="button"
                                onClick={setToMarketRate}
                                className="text-xs text-blue-400 hover:text-blue-300 underline transition-colors"
                              >
                                spot
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Clean gradient slider */}
                        <div className="relative space-y-1">
                          {/* Market spot indicator - pulsing triangle */}
                          <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 z-20">
                            <div className="w-0 h-0 border-l-6 border-r-6 border-t-8 border-transparent border-t-white shadow-md animate-pulse"></div>
                          </div>

                          {/* Gradient Slider - track IS the gradient */}
                          <Slider
                            value={[getSpectrumPosition()]}
                            onValueChange={handleSpectrumSliderChange}
                            max={100}
                            min={0}
                            step={0.1}
                            className="spectrum-gradient-slider"
                          />

                          {/* Labels */}
                          <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>-50%</span>
                            {/* Description text */}
                            <div className="text-center">
                              <p className="text-xs text-gray-400">
                                {getMarketRatePercentageNum() > 15 ? (
                                  <>🚀 Optimistic pricing - might take a while to fill</>
                                ) : getMarketRatePercentageNum() > 5 ? (
                                  <>📈 Above market - good for you if it fills</>
                                ) : getMarketRatePercentageNum() > -5 ? (
                                  <>🎯 Close to market rate - likely to fill quickly</>
                                ) : getMarketRatePercentageNum() > -15 ? (
                                  <>📉 Below market - generous offer</>
                                ) : (
                                  <>💸 Well below market - very generous!</>
                                )}
                              </p>
                            </div>
                            <span>+50%</span>
                          </div>
                        </div>
                      </div>
                    )}

                  {/* Expiration Slider */}
                  <div className="mt-8">
                    <Label className="block text-xs font-medium mb-1">
                      Expiration: {(() => {
                        const minutes = getMinutesFromSeconds(form.expiresIn);
                        if (minutes < 60) {
                          return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
                        } else {
                          const hours = minutes / 60;
                          return `${hours} hour${hours !== 1 ? 's' : ''}`;
                        }
                      })()}
                    </Label>

                    <div className="px-1">
                      <Slider
                        value={[getSliderValueFromExpiration(form.expiresIn)]}
                        onValueChange={handleSliderChange}
                        max={expirationMinutes.length - 1}
                        min={0}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>1m</span>
                        <span>5m</span>
                        <span>30m</span>
                        <span>2h</span>
                        <span>24h</span>
                      </div>
                    </div>
                  </div>

                  {/* Permit2 Section */}
                  <div className="border border-blue-500/30 rounded-lg p-3 bg-blue-900/10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="space-y-1">
                        <Label
                          htmlFor="usePermit2"
                          className="text-sm font-medium text-blue-400 flex items-center gap-2"
                        >
                          <svg 
                            className="w-4 h-4" 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                              strokeWidth={2} 
                              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" 
                            />
                          </svg>
                          Use Permit2 (Recommended)
                        </Label>
                        <p className="text-xs text-gray-400">
                          Skip token approval transactions - sign once, trade efficiently
                        </p>
                      </div>
                      <Switch
                        id="usePermit2"
                        checked={form.usePermit2}
                        onCheckedChange={(checked) =>
                          setForm((prev) => ({
                            ...prev,
                            usePermit2: checked,
                          }))
                        }
                      />
                    </div>
                    
                    {form.usePermit2 && (
                      <div className="mt-2 p-2 bg-gray-800/50 rounded border border-gray-600">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-300">Permit2 Status:</span>
                          <div className="flex items-center gap-1">
                            {permit2Loading ? (
                              <span className="text-yellow-400">Checking...</span>
                            ) : permit2Error ? (
                              <span className="text-red-400">Error</span>
                            ) : isPermit2Approved ? (
                              <>
                                <span className="text-green-400">✓ Ready</span>
                              </>
                            ) : (
                              <span className="text-orange-400">Signature needed</span>
                            )}
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {form.usePermit2 && !permit2Loading && !permit2Error && (
                            isPermit2Approved ? 
                              "You can create orders without approval transactions" :
                              "You'll need to sign a Permit2 message when creating the order"
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between py-1">
                    <Label
                      htmlFor="useLendingProtocol"
                      className="text-xs font-medium text-gray-300"
                    >
                      Withdraw from Lending Position
                    </Label>
                    <Switch
                      id="useLendingProtocol"
                      checked={form.useLendingProtocol}
                      onCheckedChange={(checked) =>
                        setForm((prev) => ({
                          ...prev,
                          useLendingProtocol: checked,
                        }))
                      }
                    />
                  </div>

                  {form.useLendingProtocol && (
                    <div className="mt-1">
                      <Label htmlFor="lendingProtocol" className="block text-xs font-medium mb-1">
                        Protocol
                      </Label>
                      <Select
                        value={form.lendingProtocol}
                        onValueChange={(value) =>
                          setForm((prev) => ({ ...prev, lendingProtocol: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select protocol" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="aave">
                            <div className="flex items-center gap-2">
                              <img
                                src="https://app.aave.com/icons/tokens/aave.svg"
                                alt="Aave"
                                className="w-4 h-4"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />
                              Aave
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="flex items-center justify-between py-1">
                    <Label htmlFor="useTwapOrder" className="text-xs font-medium text-gray-300">
                      TWAP Order
                    </Label>
                    <Switch
                      id="useTwapOrder"
                      checked={form.useTwapOrder}
                      onCheckedChange={(checked) =>
                        setForm((prev) => ({ ...prev, useTwapOrder: checked }))
                      }
                    />
                  </div>

                  {form.useTwapOrder && (
                    <div className="mt-1">
                      <Label className="block text-xs font-medium mb-1">Running Time (hours)</Label>
                      <Input
                        type="number"
                        name="twapRunningTimeHours"
                        value={form.twapRunningTimeHours}
                        onChange={handleChange}
                        min="1"
                        max="168"
                        step="1"
                        placeholder="1"
                        className="h-8 text-xs"
                      />
                      <p className="text-xs text-gray-500 mt-0.5">
                        TWAP will execute over this time period (1-168 hours)
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between py-1">
                    <Label
                      htmlFor="supplyToLendingProtocol"
                      className="text-xs font-medium text-gray-300"
                    >
                      Supply to Lending Protocol
                    </Label>
                    <Switch
                      id="supplyToLendingProtocol"
                      checked={form.supplyToLendingProtocol}
                      onCheckedChange={(checked) =>
                        setForm((prev) => ({
                          ...prev,
                          supplyToLendingProtocol: checked,
                        }))
                      }
                    />
                  </div>

                  {form.supplyToLendingProtocol && (
                    <div className="mt-1">
                      <Label
                        htmlFor="supplyLendingProtocol"
                        className="block text-xs font-medium mb-1"
                      >
                        Protocol
                      </Label>
                      <Select
                        value={form.supplyLendingProtocol}
                        onValueChange={(value) =>
                          setForm((prev) => ({ ...prev, supplyLendingProtocol: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select protocol" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="aave">
                            <div className="flex items-center gap-2">
                              <img
                                src="https://app.aave.com/icons/tokens/aave.svg"
                                alt="Aave"
                                className="w-4 h-4"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />
                              Aave
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {approvalStatus && (
                  <Alert>
                    <AlertDescription>{approvalStatus}</AlertDescription>
                  </Alert>
                )}

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {success && (
                  <Alert className="border-green-500 bg-green-900/20">
                    <AlertDescription className="text-green-400">{success}</AlertDescription>
                  </Alert>
                )}

                <div className="flex space-x-2">
                  <Button
                    type="submit"
                    disabled={loading}
                    className="flex-1 h-9 text-sm"
                    size="default"
                  >
                    {loading
                      ? approvalStatus
                        ? approvalStatus
                        : 'Creating Order...'
                      : 'Create Order'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
