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
// Constants and utilities
import { config } from '../../config';
import {
  AAVE_V3_POOL_ADDRESS,
  AAVE_V3_POOL_ABI,
  ERC20_ABI,
  INTERACTION_MANAGER_ADDRESS,
  TWAP_CALCULATOR_ADDRESS,
  EXPIRATION_MINUTES,
} from '../../constants/order-constants';
import {
  type Token,
  getSelectedTokenDecimals,
  getStepForDecimals,
  formatBalance,
  calculateUsdValue,
  safeParseFloat,
} from '../../utils/token-utils';
import {
  getMarketRatePercentageNum,
  getSpectrumPosition,
  getSliderColor,
  positionToPercentage,
} from '../../utils/price-utils';
import { handleKeyDown, validateAmountInput } from '../../utils/validation-utils';
import {
  getSliderValueFromExpiration,
  getExpirationFromSliderValue,
  formatExpirationTime,
} from '../../utils/time-utils';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Slider } from '../../components/ui/slider';
import { Switch } from '../../components/ui/switch';
import { navigationHelpers } from '../../router/navigation';
import { usePermit2, type Permit2Data } from '../../hooks/usePermit2';

const InteractionProtocol = {
  NONE: 0,
  AAVE: 1
} as const;

const OrderType = {
  REGULAR: 0,
  TWAP: 1
} as const;

interface CreateOrderForm {
  makerAsset: string;
  takerAsset: string;
  makingAmount: string;
  takingAmount: string;
  expiresIn: number;
  useLendingProtocol: boolean;
  supplyToLendingProtocol: boolean;
  useTwapOrder: boolean;
  twapRunningTimeHours: number;
  usePermit2: boolean;
}


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
  const interactionManagerAddress = INTERACTION_MANAGER_ADDRESS;
  const twapCalculatorAddress = TWAP_CALCULATOR_ADDRESS;

  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const chainId = useChainId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Token[]>([...config.topTokens]);
  const [tokenPrices, setTokenPrices] = useState<Record<string, number>>({});
  const [customRate, setCustomRate] = useState<string>('');
  const [rateDisplayFlipped, setRateDisplayFlipped] = useState(false); // Track rate display direction

  const { writeContractAsync } = useWriteContract();
  const [approvalTxHash, setApprovalTxHash] = useState<string | null>(null);
  const [_permit2Data, setPermit2Data] = useState<Permit2Data | null>(null);

  // Wait for approval transaction confirmation
  const approvalReceipt = useWaitForTransactionReceipt({
    hash: approvalTxHash as `0x${string}` | undefined,
  });

  const [form, setForm] = useState<CreateOrderForm>({
    makerAsset: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // USDC address directly from config
    takerAsset: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH address directly from config
    makingAmount: '1',
    takingAmount: '',
    expiresIn: 3600, // 1 hour
    useLendingProtocol: false,
    supplyToLendingProtocol: false,
    useTwapOrder: false,
    twapRunningTimeHours: 5,
    usePermit2: false,
  });

  // Permit2 integration
  const {
    isPermit2Approved,
    needsTokenApprovalToPermit2,
    approveTokenToPermit2,
    generatePermit2Signature,
    permit2Loading,
    permit2Error,
    approvalPending,
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
        prices[address.toLowerCase()] = safeParseFloat(price as string, 0);
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
        const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/v1/tokens/${address}?chainId=${chainId}`;

        const response = await fetch(url);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('API Response Error:', response.status, errorText);
          throw new Error(`Failed to fetch tokens: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        const apiTokens = data.data?.tokens || [];
        
        // Create a map of API tokens by address for quick lookup
        const apiTokenMap = new Map(
          apiTokens.map((token: Token) => [token.token_address.toLowerCase(), token])
        );
        
        // Merge static tokens with API tokens
        const mergedTokens = config.topTokens.map(staticToken => {
          const apiToken = apiTokenMap.get(staticToken.token_address.toLowerCase());
          if (apiToken) {
            // API token exists - merge balance and other updated info
            return {
              ...staticToken,
              ...apiToken,
              balance: (apiToken as any)?.balance || '0',
              balance_USD: (apiToken as any)?.balance_USD || 0,
            };
          } else {
            // API doesn't have this token - keep static data with zero balance
            return staticToken;
          }
        });
        
        // Add any tokens from API that aren't in the static list
        const staticAddresses = new Set(config.topTokens.map(t => t.token_address.toLowerCase()));
        const additionalTokens = apiTokens.filter(
          (token: Token) => !staticAddresses.has(token.token_address.toLowerCase())
        );
        
        // Combine all tokens - static ones first, then additional ones with balances
        const allTokens = [...mergedTokens, ...additionalTokens];
        setTokens(allTokens);

        // Set default tokens if not already set
        if (!form.makerAsset && !form.takerAsset && allTokens.length > 0) {
          const usdcToken = allTokens.find((token: Token) => token.symbol === 'USDC');
          const wethToken = allTokens.find((token: Token) => token.symbol === 'WETH');

          setForm((prev) => ({
            ...prev,
            makerAsset: usdcToken?.token_address || allTokens[0].token_address,
            takerAsset:
              wethToken?.token_address || allTokens[1]?.token_address || allTokens[0].token_address,
            makingAmount: '1', // Default to 1 token
          }));
        }
      } catch (err) {
        console.error('Error fetching tokens:', err);
        setError('Failed to load tokens');
      } finally {
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
    const position = getSpectrumPositionLocal();
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

  // Using imported utility functions

  // Using imported calculateUsdValue utility

  // Using imported getMarketRatePercentageNum utility
  const getMarketRatePercentageNumLocal = (): number => {
    return getMarketRatePercentageNum(
      form.makerAsset,
      form.takerAsset,
      form.makingAmount,
      form.takingAmount,
      tokenPrices
    );
  };

  // Using imported getSpectrumPosition utility
  const getSpectrumPositionLocal = (): number => {
    return getSpectrumPosition(
      form.makerAsset,
      form.takerAsset,
      form.makingAmount,
      form.takingAmount,
      tokenPrices
    );
  };

  // Using imported getSliderColor and positionToPercentage utilities

  // Update token amounts based on market percentage
  const updateAmountsFromPosition = (marketPercentage: number) => {
    if (!form.makerAsset || !form.takerAsset || !form.makingAmount) return;

    const makerPrice = tokenPrices[form.makerAsset.toLowerCase()];
    const takerPrice = tokenPrices[form.takerAsset.toLowerCase()];

    if (!makerPrice || !takerPrice) return;

    const makingNum = safeParseFloat(form.makingAmount, 0);
    if (makingNum <= 0) return;

    // Calculate market rate and adjust by percentage
    const marketRate = makerPrice / takerPrice;
    const adjustedRate = marketRate * (1 + marketPercentage / 100);
    const newTakingAmount = makingNum * adjustedRate;

    // Format to appropriate decimal places
    const takerDecimals = getSelectedTokenDecimals(form.takerAsset, tokens);
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

    const makingNum = safeParseFloat(form.makingAmount, 0);
    if (makingNum <= 0) return;

    // Calculate spot rate with +3% markup for better pricing
    const spotRate = makerPrice / takerPrice;
    const adjustedRate = spotRate * 1.03; // +3% above market
    const takingAmount = makingNum * adjustedRate;

    // Format to appropriate decimal places
    const takerDecimals = getSelectedTokenDecimals(form.takerAsset, tokens);
    const formattedAmount = takingAmount.toFixed(Math.min(takerDecimals, 8));

    setForm((prev) => ({ ...prev, takingAmount: formattedAmount }));
  };

  // Set to market rate
  const setToMarketRate = () => {
    if (!form.makerAsset || !form.takerAsset || !form.makingAmount) return;

    const makerPrice = tokenPrices[form.makerAsset.toLowerCase()];
    const takerPrice = tokenPrices[form.takerAsset.toLowerCase()];

    if (!makerPrice || !takerPrice) return;

    const makingNum = safeParseFloat(form.makingAmount, 0);
    if (makingNum === 0) return;

    const marketRate = makerPrice / takerPrice;
    const marketTakingAmount = (makingNum * marketRate).toFixed(6);

    setForm((prev) => ({ ...prev, takingAmount: marketTakingAmount }));
    setCustomRate(''); // Clear custom rate when setting to market
  };

  // Switch token positions and flip amounts with +3% markup
  const handleTokenSwitch = () => {
    if (!form.makerAsset || !form.takerAsset || !form.takingAmount) return;

    const currentTakingAmount = safeParseFloat(form.takingAmount, 0);
    if (currentTakingAmount <= 0) return;

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
    const newTakerDecimals = getSelectedTokenDecimals(form.makerAsset, tokens); // will become new taker
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

  const handleRateDisplayFlip = () => {
    setRateDisplayFlipped(!rateDisplayFlipped);
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

  // Get aToken balance for the user
  const aTokenBalanceQuery = useReadContract({
    address: aaveReserveDataQuery.data?.aTokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: {
      enabled: !!aaveReserveDataQuery.data?.aTokenAddress && !!address && form.useLendingProtocol,
    },
  });

  // Token approval hooks
  const makerApproval = useTokenApproval(form.makerAsset, limitOrderContractAddress, address);
  const aTokenApproval = useTokenApproval(
    aaveReserveDataQuery.data?.aTokenAddress,
    interactionManagerAddress,
    address
  );
  const takerApproval = useTokenApproval(
    form.takerAsset,
    interactionManagerAddress,
    address
  );

  // Calculate required amounts
  const requiredAmounts = useMemo(() => {
    if (!form.makingAmount || !form.takingAmount || !form.makerAsset || !form.takerAsset)
      return null;

    const makerDecimals = getSelectedTokenDecimals(form.makerAsset, tokens);
    const takerDecimals = getSelectedTokenDecimals(form.takerAsset, tokens);

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

    // Add taker asset approval only if Capital Efficiency Mode is enabled
    if (form.supplyToLendingProtocol) {
      items.push({
        tokenAddress: form.takerAsset,
        tokenName: 'taker asset',
        spender: interactionManagerAddress,
        requiredAmount: requiredAmounts.takingAmountWei,
        needsApproval: takerApproval.needsApproval(requiredAmounts.takingAmountWei),
        currentAllowance: takerApproval.allowance,
      });
    }

    // Add aToken approval only if Capital Efficiency Mode is enabled
    if (form.useLendingProtocol && aaveReserveDataQuery.data?.aTokenAddress) {
      const aTokenAddress = aaveReserveDataQuery.data.aTokenAddress;
      items.push({
        tokenAddress: aTokenAddress,
        tokenName: 'aToken',
        spender: interactionManagerAddress,
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

      let extensions;
      
      // Only create extensions when specific features are enabled
      if (form.useTwapOrder || form.useLendingProtocol || form.supplyToLendingProtocol || form.usePermit2) {
        const extensionData = {
          ...Extension.EMPTY,
        };

        let orderType: (typeof OrderType)[keyof typeof OrderType] = OrderType.REGULAR;
        let interactionProtocol: (typeof InteractionProtocol)[keyof typeof InteractionProtocol] = InteractionProtocol.NONE;

        // Enable pre-interaction if lending protocol is enabled
        if (form.useLendingProtocol) {
          makerTraits = makerTraits.enablePreInteraction().withExtension();
          interactionProtocol = InteractionProtocol.AAVE;
          const preInteraction = new Interaction(
            new Address(interactionManagerAddress),
            ethers.AbiCoder.defaultAbiCoder().encode(
            ['uint8', 'uint8'],
            [orderType, interactionProtocol]
          )
          );
          extensionData.preInteraction = preInteraction.encode();
        }

        // Enable post-interaction if supply to lending is enabled
        if (form.supplyToLendingProtocol) {
          makerTraits = makerTraits.enablePostInteraction().withExtension();
          interactionProtocol = InteractionProtocol.AAVE;
          const postInteraction = new Interaction(
            new Address(interactionManagerAddress),
            ethers.AbiCoder.defaultAbiCoder().encode(
            ['uint8', 'uint8'],
            [orderType, interactionProtocol]
          )
          );
          extensionData.postInteraction = postInteraction.encode();     
        }

        if (form.useTwapOrder) {
          makerTraits = makerTraits.allowPartialFills().enablePreInteraction().withExtension();
          const startTime = Math.floor(Date.now() / 1000);
          const endTime = startTime + form.twapRunningTimeHours * 3600;
          const numberOfOrders = form.twapRunningTimeHours;
          console.log('startTime', startTime);
          console.log('endTime', endTime);
          console.log('numberOfOrders', numberOfOrders);
          orderType = OrderType.TWAP;
          const customData = ethers.AbiCoder.defaultAbiCoder().encode(
            ['uint8', 'uint8'],
            [orderType, interactionProtocol]
          );
          const preInteraction = new Interaction(
            new Address(interactionManagerAddress),
            customData
          );
          extensionData.preInteraction = preInteraction.encode();
          extensionData.makingAmountData = ethers.solidityPacked(
            ['address', 'uint256', 'uint256'],
            [twapCalculatorAddress, startTime, endTime]
          );
          extensionData.takingAmountData = ethers.solidityPacked(
            ['address'],
            [twapCalculatorAddress]
          );
          
        }

        // Add permit2 signature to extension if using permit2
        if (form.usePermit2 && permit2Signature) {
          const permit2ContractAddress = config.contracts.permit2;
          const encodedPermitData = ethers.AbiCoder.defaultAbiCoder().encode(
            ['tuple(tuple(address token, uint160 amount, uint48 expiration, uint48 nonce) details, address spender, uint256 sigDeadline)', 'bytes'],
            [permit2Signature.permitSingle, permit2Signature.signature]
          );

          const makerPermitData = ethers.solidityPacked(
            ['address', 'bytes'],
            [permit2ContractAddress, encodedPermitData]
          );

          extensionData.makerPermit = makerPermitData;
        }
        
        console.log('orderType', orderType);
        console.log('interactionProtocol', interactionProtocol);

        extensions = new Extension(extensionData);
        console.log('extension', extensions);
      } else {
        // Use empty extension (0x) when no special features are enabled
        extensions = new Extension(Extension.EMPTY);
      }

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
            ...(form.useTwapOrder && {
              numberOfOrders: Math.ceil(form.twapRunningTimeHours * 2),
            }),
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


  // Using imported handleKeyDown utility

  // Custom handler for amount inputs that validates decimal places and format
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>, tokenAddress: string) => {
    const { name, value } = e.target;

    // Clear custom rate when user manually changes amounts
    setCustomRate('');

    const decimals = getSelectedTokenDecimals(tokenAddress, tokens);
    const validatedValue = validateAmountInput(value, decimals);

    if (validatedValue !== null) {
      setForm((prev) => ({ ...prev, [name]: validatedValue }));
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

    // Using imported formatBalance utility

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

  // Using imported time utilities
  const handleSliderChange = (value: number[]) => {
    const newExpiration = getExpirationFromSliderValue(value[0]);
    setForm((prev) => ({ ...prev, expiresIn: newExpiration }));
  };

  // Format aToken balance for display
  const formatATokenBalance = (balance: bigint | undefined, tokenAddress: string): string => {
    if (!balance) return '0';
    
    const decimals = getSelectedTokenDecimals(tokenAddress, tokens);
    const balanceFormatted = Number(balance) / Math.pow(10, decimals);
    return formatBalance(balanceFormatted.toString());
  };

  // Handle using aToken balance as making amount
  const handleUseATokenBalance = () => {
    if (!aTokenBalanceQuery.data || !form.makerAsset) return;
    
    const decimals = getSelectedTokenDecimals(form.makerAsset, tokens);
    const balanceFormatted = Number(aTokenBalanceQuery.data) / Math.pow(10, decimals);
    
    setForm((prev) => ({ 
      ...prev, 
      makingAmount: balanceFormatted.toString() 
    }));
    
    // Clear custom rate when using balance
    setCustomRate('');
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
                            disabled={false}
                          />
                          <input
                            id="makingAmount"
                            type="number"
                            name="makingAmount"
                            value={form.makingAmount}
                            onChange={(e) => handleAmountChange(e, form.makerAsset)}
                            onKeyDown={handleKeyDown}
                            step={getStepForDecimals(getSelectedTokenDecimals(form.makerAsset, tokens))}
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
                                ≈ ${calculateUsdValue(form.makingAmount, form.makerAsset, tokenPrices)} USD
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
                            disabled={false}
                          />
                          <input
                            id="takingAmount"
                            type="number"
                            name="takingAmount"
                            value={form.takingAmount}
                            onChange={(e) => handleAmountChange(e, form.takerAsset)}
                            onKeyDown={handleKeyDown}
                            step={getStepForDecimals(getSelectedTokenDecimals(form.takerAsset, tokens))}
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
                                ≈ ${calculateUsdValue(form.takingAmount, form.takerAsset, tokenPrices)} USD
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
                          <div className="text-left flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-300">
                              {(() => {
                                const makerToken = tokens.find(
                                  (t) => t.token_address === form.makerAsset
                                );
                                const takerToken = tokens.find(
                                  (t) => t.token_address === form.takerAsset
                                );
                                const makingNum = safeParseFloat(form.makingAmount, 1);
                                const takingNum = safeParseFloat(form.takingAmount, 0);
                                
                                if (!rateDisplayFlipped) {
                                  // Normal: 1 MAKER for X TAKER
                                  const rate = makingNum > 0 ? (takingNum / makingNum).toFixed(4) : '0.0000';
                                  return `1 ${makerToken?.symbol || 'Token'} for ${rate} ${takerToken?.symbol || 'Token'}`;
                                } else {
                                  // Flipped: 1 TAKER for X MAKER
                                  const rate = takingNum > 0 ? (makingNum / takingNum).toFixed(4) : '0.0000';
                                  return `1 ${takerToken?.symbol || 'Token'} for ${rate} ${makerToken?.symbol || 'Token'}`;
                                }
                              })()}
                            </span>
                            
                            {/* Sleek Swap Button */}
                            <button
                              type="button"
                              onClick={handleRateDisplayFlip}
                              className="group w-5 h-4 bg-gray-700 hover:bg-blue-600 rounded flex items-center justify-center transition-all duration-200 hover:scale-110 hover:shadow-lg border border-gray-600 hover:border-blue-500"
                              title="Flip conversion rate display"
                            >
                              <svg
                                className="w-3 h-3 text-gray-400 group-hover:text-white transition-colors duration-200"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                                />
                              </svg>
                            </button>
                          </div>

                          {/* Market Spot - always centered */}
                          <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
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
                                {getMarketRatePercentageNumLocal() > 0 ? '+' : ''}
                                {getMarketRatePercentageNumLocal().toFixed(1)}%
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
                          <div className="absolute -top-2.5 left-1/2 transform -translate-x-1/2 z-20">
                            <div className="w-0 h-0 border-l-6 border-r-6 border-t-8 border-transparent border-t-white shadow-md animate-pulse"></div>
                          </div>

                          {/* Gradient Slider - track IS the gradient */}
                          <Slider
                            value={[getSpectrumPositionLocal()]}
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
                                {getMarketRatePercentageNumLocal() > 15 ? (
                                  <>🚀 Optimistic pricing - might take a while to fill</>
                                ) : getMarketRatePercentageNumLocal() > 5 ? (
                                  <>📈 Above market - good for you if it fills</>
                                ) : getMarketRatePercentageNumLocal() > -5 ? (
                                  <>🎯 Close to market rate - likely to fill quickly</>
                                ) : getMarketRatePercentageNumLocal() > -15 ? (
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
                      Expiration: {formatExpirationTime(form.expiresIn)}
                    </Label>

                    <div className="px-1">
                      <Slider
                        value={[getSliderValueFromExpiration(form.expiresIn)]}
                        onValueChange={handleSliderChange}
                        max={EXPIRATION_MINUTES.length - 1}
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


                  {/* Capital Efficiency Mode Cards */}
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold text-white">
                      Capital Efficiency Mode
                    </Label>
                    
                    <div className="grid grid-cols-2 gap-4">
                      {/* Pre-interaction Card */}
                      <Card 
                        className={`cursor-pointer transition-all duration-200 ${
                          form.useLendingProtocol 
                            ? 'border-green-500 bg-green-500/10 shadow-lg' 
                            : 'border-gray-700 bg-gray-900/50 hover:border-gray-600'
                        }`}
                        onClick={() => setForm(prev => ({ ...prev, useLendingProtocol: !prev.useLendingProtocol }))}
                      >
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm text-white flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${form.useLendingProtocol ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                            Pre-interaction
                          </CardTitle>
                          <CardDescription className="text-xs text-gray-400">
                            Withdraw from lending position
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="space-y-2">
                            {form.useLendingProtocol && (
                              <div className="space-y-3">
                                <RadioGroup value="aave" className="space-y-3">
                                  {/* Aave - Selected */}
                                  <div className="flex items-center gap-2">
                                    <RadioGroupItem value="aave" />
                                    <img
                                      src="https://app.aave.com/icons/tokens/aave.svg"
                                      alt="Aave"
                                      className="w-4 h-4"
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                      }}
                                    />
                                    <span className="text-xs text-gray-300">Aave</span>
                                  </div>
                                  
                                  {/* Compound - Not selected */}
                                  <div className="flex items-center gap-2">
                                    <RadioGroupItem value="compound" />
                                    <img
                                      src="/compound-logo.png"
                                      alt="Compound"
                                      className="w-4 h-4"
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                      }}
                                    />
                                    <span className="text-xs text-gray-300">Compound</span>
                                  </div>
                                </RadioGroup>
                                
                                <div className="mt-3 p-2 bg-gray-800/50 rounded text-xs">
                                  <div className="text-gray-400 mb-1">Available Balance</div>
                                  <div className="flex items-center justify-between">
                                    <div className="text-white font-medium">
                                      {aTokenBalanceQuery.isLoading ? (
                                        <span className="text-gray-400">Loading...</span>
                                      ) : aTokenBalanceQuery.error ? (
                                        <span className="text-red-400">Error</span>
                                      ) : (
                                        <>
                                          {formatATokenBalance(aTokenBalanceQuery.data as bigint, form.makerAsset)}
                                          {' '}
                                          {(() => {
                                            const selectedToken = tokens.find(
                                              (t) => t.token_address === form.makerAsset
                                            );
                                            return selectedToken?.symbol || '';
                                          })()}
                                        </>
                                      )}
                                    </div>
                                    {!aTokenBalanceQuery.isLoading && !aTokenBalanceQuery.error && aTokenBalanceQuery.data && (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleUseATokenBalance();
                                        }}
                                        className="text-xs px-2 py-1 h-5"
                                      >
                                        Use
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Post-interaction Card */}
                      <Card 
                        className={`cursor-pointer transition-all duration-200 ${
                          form.supplyToLendingProtocol 
                            ? 'border-green-500 bg-green-500/10 shadow-lg' 
                            : 'border-gray-700 bg-gray-900/50 hover:border-gray-600'
                        }`}
                        onClick={() => setForm(prev => ({ ...prev, supplyToLendingProtocol: !prev.supplyToLendingProtocol }))}
                      >
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm text-white flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${form.supplyToLendingProtocol ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                            Post-interaction
                          </CardTitle>
                          <CardDescription className="text-xs text-gray-400">
                            Supply to lending protocol
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="space-y-2">
                            {form.supplyToLendingProtocol && (
                              <div className="space-y-3">
                                <RadioGroup value="aave" className="space-y-3">
                                  {/* Aave - Selected */}
                                  <div className="flex items-center gap-2">
                                    <RadioGroupItem value="aave" />
                                    <img
                                      src="https://app.aave.com/icons/tokens/aave.svg"
                                      alt="Aave"
                                      className="w-4 h-4"
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                      }}
                                    />
                                    <span className="text-xs text-gray-300">Aave</span>
                                  </div>
                                  
                                  {/* Compound - Not selected */}
                                  <div className="flex items-center gap-2">
                                    <RadioGroupItem value="compound" />
                                    <img
                                      src="/compound-logo.png"
                                      alt="Compound"
                                      className="w-4 h-4"
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                      }}
                                    />
                                    <span className="text-xs text-gray-300">Compound</span>
                                  </div>
                                </RadioGroup>
                              </div>
                            )}
                            {form.supplyToLendingProtocol && (
                              <div className="mt-3 p-2 bg-gray-800/50 rounded text-xs text-gray-300">
                                Received tokens will be automatically supplied to earn yield
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  {/* TWAP Section with sleek background */}
                  <div className="border border-purple-500/30 rounded-lg p-4 bg-gradient-to-br from-purple-900/20 to-blue-900/20 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
                          <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </div>
                        <div>
                          <Label htmlFor="useTwapOrder" className="text-sm font-semibold text-white">
                            TWAP Order
                          </Label>
                          <p className="text-xs text-gray-400">Time-Weighted Average Price execution</p>
                        </div>
                      </div>
                      <Switch
                        id="useTwapOrder"
                        checked={form.useTwapOrder}
                        onCheckedChange={(checked) =>
                          setForm((prev) => ({ ...prev, useTwapOrder: checked }))
                        }
                      />
                    </div>

                    {form.useTwapOrder && (
                      <div className="space-y-4 pt-2 border-t border-purple-500/20">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <Label className="text-xs font-medium text-gray-300 flex items-center gap-1">
                              <svg className="w-3 h-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Duration: {form.twapRunningTimeHours} hour{form.twapRunningTimeHours !== 1 ? 's' : ''}
                            </Label>
                            <div className="flex items-center gap-1 text-xs text-gray-400">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                              </svg>
                              ~{Math.ceil(form.twapRunningTimeHours * 2)} orders
                            </div>
                          </div>
                          
                          <Slider
                            value={[form.twapRunningTimeHours]}
                            onValueChange={(value) =>
                              setForm((prev) => ({ ...prev, twapRunningTimeHours: value[0] }))
                            }
                            max={168}
                            min={1}
                            step={1}
                            className="w-full"
                          />
                          
                          <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>1h</span>
                            <span>24h</span>
                            <span>72h</span>
                            <span>168h (1 week)</span>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="bg-purple-900/30 rounded p-2">
                            <div className="flex items-center gap-1 text-purple-300 mb-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Frequency
                            </div>
                            <p className="text-white font-medium">Every 30 mins</p>
                          </div>
                          <div className="bg-blue-900/30 rounded p-2">
                            <div className="flex items-center gap-1 text-blue-300 mb-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                              </svg>
                              Orders
                            </div>
                            <p className="text-white font-medium">{Math.ceil(form.twapRunningTimeHours * 2)}</p>
                          </div>
                        </div>
                        
                        <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 rounded p-2 text-xs text-gray-300">
                          <div className="flex items-center gap-1 mb-1">
                            <svg className="w-3 h-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-purple-300 font-medium">TWAP Benefits</span>
                          </div>
                          <p>Reduces market impact by splitting your order into smaller chunks executed over time</p>
                        </div>
                      </div>
                    )}
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
                            ) : approvalPending ? (
                              <span className="text-yellow-400">Approving...</span>
                            ) : needsTokenApprovalToPermit2 ? (
                              <span className="text-orange-400">Token approval needed</span>
                            ) : isPermit2Approved ? (
                              <span className="text-green-400">✓ Ready</span>
                            ) : (
                              <span className="text-orange-400">Signature needed</span>
                            )}
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {form.usePermit2 && !permit2Loading && !permit2Error && (
                            approvalPending ?
                              "Waiting for token approval confirmation..." :
                            needsTokenApprovalToPermit2 ?
                              "First time using Permit2? You'll need to approve the token once" :
                            isPermit2Approved ? 
                              "You can create orders without approval transactions" :
                              "You'll need to sign a Permit2 message when creating the order"
                          )}
                        </div>
                        {needsTokenApprovalToPermit2 && form.makerAsset && !approvalPending && (
                          <div className="mt-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                try {
                                  await approveTokenToPermit2();
                                } catch (error) {
                                  console.error('Approval failed:', error);
                                }
                              }}
                              className="text-xs"
                            >
                              Approve Token to Permit2
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

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
                    disabled={loading || (form.usePermit2 && needsTokenApprovalToPermit2)}
                    className="flex-1 h-9 text-sm"
                    size="default"
                  >
                    {loading
                      ? approvalStatus
                        ? approvalStatus
                        : 'Creating Order...'
                      : form.usePermit2 && needsTokenApprovalToPermit2
                      ? 'Approve Token First'
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
