import { ethers } from 'ethers';

/**
 * TakerTraits bit layout:
 * 255 bit: _MAKER_AMOUNT_FLAG       - If set, amount is making amount, otherwise taking amount
 * 254 bit: _UNWRAP_WETH_FLAG        - If set, unwrap WETH to ETH before sending to taker
 * 253 bit: _SKIP_ORDER_PERMIT_FLAG  - If set, skip maker's permit execution
 * 252 bit: _USE_PERMIT2_FLAG        - If set, use permit2 for authorization
 * 251 bit: _ARGS_HAS_TARGET         - If set, first 20 bytes of args are target address
 * 224-247 bits: ARGS_EXTENSION_LENGTH   - Length of extension data in args (24 bits)
 * 200-223 bits: ARGS_INTERACTION_LENGTH - Length of interaction data in args (24 bits)
 * 0-184 bits: THRESHOLD                 - Maximum amount taker agrees to give (185 bits)
 */

export interface TakerTraitsOptions {
  makerAmount?: boolean;          // If true, amount parameter is making amount
  unwrapWeth?: boolean;           // If true, unwrap WETH to ETH
  skipOrderPermit?: boolean;      // If true, skip maker's permit
  usePermit2?: boolean;          // If true, use permit2
  hasTarget?: boolean;           // If true, args contains target address
  extensionLength?: number;      // Length of extension data in args
  interactionLength?: number;    // Length of interaction data in args
  threshold?: bigint;            // Maximum amount willing to pay
}

export interface InteractionData {
  contractAddress: string;
  extraData?: string;
}

/**
 * Build TakerTraits uint256 value
 */
export function buildTakerTraits(options: TakerTraitsOptions = {}): bigint {
  let traits = 0n;

  // Set flags
  if (options.makerAmount) traits |= (1n << 255n);
  if (options.unwrapWeth) traits |= (1n << 254n);
  if (options.skipOrderPermit) traits |= (1n << 253n);
  if (options.usePermit2) traits |= (1n << 252n);
  if (options.hasTarget) traits |= (1n << 251n);

  // Set lengths
  if (options.extensionLength) {
    traits |= (BigInt(options.extensionLength) << 224n);
  }
  if (options.interactionLength) {
    traits |= (BigInt(options.interactionLength) << 200n);
  }

  // Set threshold (mask to 185 bits to prevent overflow)
  if (options.threshold) {
    const maxThreshold = (1n << 185n) - 1n;
    const threshold = options.threshold > maxThreshold ? maxThreshold : options.threshold;
    traits |= threshold;
  }

  return traits;
}

/**
 * Encode interaction data (contract address + extra data)
 */
export function encodeInteraction(interaction: InteractionData): string {
  const { contractAddress, extraData = '0x' } = interaction;
  
  // Ensure contract address is 20 bytes
  if (!ethers.isAddress(contractAddress)) {
    throw new Error(`Invalid contract address: ${contractAddress}`);
  }

  // Remove 0x prefix from extraData if present
  const cleanExtraData = extraData.startsWith('0x') ? extraData.slice(2) : extraData;
  
  // Concatenate address + extraData
  return contractAddress.toLowerCase() + cleanExtraData;
}

/**
 * Build args parameter for fillOrderArgs
 */
export function buildFillOrderArgs(options: {
  target?: string;
  extension?: string;
  interaction?: InteractionData;
}): { args: string; takerTraits: bigint } {
  const { target, extension = '0x', interaction } = options;

  let args = '';
  let extensionLength = 0;
  let interactionLength = 0;

  // Add target if specified
  if (target) {
    if (!ethers.isAddress(target)) {
      throw new Error(`Invalid target address: ${target}`);
    }
    args += target.toLowerCase().slice(2); // Remove 0x prefix
  }

  // Add extension data
  if (extension && extension !== '0x') {
    const cleanExtension = extension.startsWith('0x') ? extension.slice(2) : extension;
    args += cleanExtension;
    extensionLength = cleanExtension.length / 2;
  }

  // Add interaction data
  if (interaction) {
    const interactionData = encodeInteraction(interaction);
    const cleanInteractionData = interactionData.startsWith('0x') ? interactionData.slice(2) : interactionData;
    args += cleanInteractionData;
    interactionLength = cleanInteractionData.length / 2;
  }

  // Build takerTraits
  const takerTraits = buildTakerTraits({
    hasTarget: !!target,
    extensionLength,
    interactionLength,
    threshold: 0n, // No threshold by default
  });

  return {
    args: args ? '0x' + args : '0x',
    takerTraits,
  };
}

/**
 * Helper to create interaction with simple uint256 extra data
 */
export function createSimpleInteraction(contractAddress: string, value: bigint = 0n): InteractionData {
  const extraData = ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [value]);
  return {
    contractAddress,
    extraData,
  };
}