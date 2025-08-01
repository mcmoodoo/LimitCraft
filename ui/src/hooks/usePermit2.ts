import { getLimitOrderContract } from '@1inch/limit-order-sdk';
import { AllowanceTransfer, MaxAllowanceTransferAmount, type PermitSingle } from '@uniswap/permit2-sdk';
import { useCallback, useMemo } from 'react';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useSignTypedData,
  useWriteContract,
} from 'wagmi';
import { getContract, type Address } from 'viem';
import { config } from '../config';

const PERMIT2_ABI = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
    ],
    outputs: [],
  },
] as const;

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

export interface Permit2Data {
  permitSingle: PermitSingle;
  signature: string;
}

export interface UsePermit2Return {
  isPermit2Approved: boolean;
  needsPermit2Approval: (amount: bigint) => boolean;
  needsTokenApprovalToPermit2: boolean;
  approveTokenToPermit2: () => Promise<void>;
  generatePermit2Signature: (
    tokenAddress: string,
    amount: bigint,
    expiration?: number
  ) => Promise<Permit2Data>;
  refetchPermit2Allowance: () => void;
  permit2Loading: boolean;
  permit2Error: Error | null;
}

const toDeadline = (expiration: number = 30 * 60): number => {
  return Math.floor(Date.now() / 1000) + expiration;
};

export const usePermit2 = (tokenAddress?: string): UsePermit2Return => {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();

  // Get the 1inch limit order contract address for current chain
  const limitOrderContractAddress = useMemo(() => {
    return getLimitOrderContract(chainId);
  }, [chainId]);

  // Read current token allowance to Permit2 contract
  const {
    data: tokenAllowance,
    refetch: refetchTokenAllowance,
  } = useReadContract({
    address: tokenAddress as Address,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address as Address, config.contracts.permit2 as Address],
    query: {
      enabled: !!address && !!tokenAddress,
    },
  });

  // Read current Permit2 allowance
  const {
    data: permit2Allowance,
    refetch: refetchPermit2Allowance,
    isLoading: permit2Loading,
    error: permit2Error,
  } = useReadContract({
    address: config.contracts.permit2 as Address,
    abi: PERMIT2_ABI,
    functionName: 'allowance',
    args: [
      address as Address,
      tokenAddress as Address,
      limitOrderContractAddress as Address,
    ],
    query: {
      enabled: !!address && !!tokenAddress && !!limitOrderContractAddress,
    },
  });

  // Check if current allowance is sufficient
  const needsPermit2Approval = useCallback(
    (requiredAmount: bigint): boolean => {
      if (!permit2Allowance) return true;
      
      const [amount, expiration] = permit2Allowance;
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Check if allowance is sufficient and not expired
      return amount < requiredAmount || Number(expiration.toString()) < currentTime;
    },
    [permit2Allowance]
  );

  // Check if token needs approval to Permit2 contract
  const needsTokenApprovalToPermit2 = useMemo(() => {
    if (!tokenAllowance) return true;
    // Need approval if allowance is less than max allowance
    return tokenAllowance < BigInt(MaxAllowanceTransferAmount.toString());
  }, [tokenAllowance]);

  const isPermit2Approved = useMemo(() => {
    if (!permit2Allowance) return false;
    
    const [amount, expiration] = permit2Allowance;
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Consider approved if has max allowance or sufficient allowance that's not expired
    return amount >= BigInt(MaxAllowanceTransferAmount.toString()) && expiration.toString() !== '0' && Number(expiration.toString()) > currentTime;
  }, [permit2Allowance]);

  // Function to approve token to Permit2 contract
  const approveTokenToPermit2 = useCallback(async () => {
    if (!tokenAddress || !address) {
      throw new Error('Token address and wallet address required');
    }

    try {
      await writeContractAsync({
        address: tokenAddress as Address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [config.contracts.permit2 as Address, BigInt(MaxAllowanceTransferAmount.toString())],
      });

      // Refetch allowances after approval
      await refetchTokenAllowance();
      await refetchPermit2Allowance();
    } catch (error) {
      console.error('Failed to approve token to Permit2:', error);
      throw error;
    }
  }, [tokenAddress, address, writeContractAsync, refetchTokenAllowance, refetchPermit2Allowance]);

  // Generate Permit2 signature
  const generatePermit2Signature = useCallback(
    async (
      tokenAddress: string,
      _amount: bigint,
      expiration: number = 30 * 24 * 60 * 60
    ): Promise<Permit2Data> => {
      if (!address || !publicClient) {
        throw new Error('Wallet not connected');
      }

      if (!limitOrderContractAddress) {
        throw new Error('Limit order contract not found for this chain');
      }

      try {
        // Get current nonce from Permit2 contract
        const permit2Contract = getContract({
          address: config.contracts.permit2 as Address,
          abi: PERMIT2_ABI,
          client: publicClient,
        });

        const allowanceData = await permit2Contract.read.allowance([
          address,
          tokenAddress as Address,
          limitOrderContractAddress as Address,
        ]);

        const currentNonce = allowanceData[2];

        const permitSingle: PermitSingle = {
          details: {
            token: tokenAddress,
            amount: MaxAllowanceTransferAmount.toString(),
            expiration: toDeadline(expiration),
            nonce: Number(currentNonce.toString()),
          },
          spender: limitOrderContractAddress,
          sigDeadline: toDeadline(30 * 60),
        };

        const { domain, types, values } = AllowanceTransfer.getPermitData(
          permitSingle,
          config.contracts.permit2,
          chainId
        );

        const formattedDomain = {
          name: String(domain.name),
          version: String(domain.version),
          chainId: Number(domain.chainId),
          verifyingContract: domain.verifyingContract as `0x${string}`,
        };

        const details = Array.isArray(values.details) ? values.details[0] : values.details;
        const formattedMessage = {
          details: {
            token: String(details.token),
            amount: String(details.amount),
            expiration: Number(details.expiration),
            nonce: Number(details.nonce),
          },
          spender: String(values.spender),
          sigDeadline: Number(values.sigDeadline),
        };

        const signature = await signTypedDataAsync({
          domain: formattedDomain,
          types,
          primaryType: 'PermitSingle',
          message: formattedMessage,
        });

        return {
          permitSingle,
          signature,
        };
      } catch (error) {
        console.error('Failed to generate Permit2 signature:', error);
        throw new Error(
          error instanceof Error ? error.message : 'Failed to generate Permit2 signature'
        );
      }
    },
    [address, chainId, limitOrderContractAddress, publicClient, signTypedDataAsync]
  );

  return {
    isPermit2Approved,
    needsPermit2Approval,
    needsTokenApprovalToPermit2,
    approveTokenToPermit2,
    generatePermit2Signature,
    refetchPermit2Allowance,
    permit2Loading,
    permit2Error: permit2Error as Error | null,
  };
};