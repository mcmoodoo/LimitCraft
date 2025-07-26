import {
  Address,
  Bps,
  Extension,
  type FeeTakerExt,
  Interaction,
  LimitOrder,
  MakerTraits,
  type OrderInfoData,
} from '@1inch/limit-order-sdk';
import { ethers } from 'ethers';

export const buildOrderExt = async (
  orderInfo: OrderInfoData,
  makerTraits = MakerTraits.default(),
  extra: {
    makerPermit?: Interaction;
    integratorFee?: FeeTakerExt.IntegratorFee;
  } = {}
): Promise<LimitOrder> => {
  const ourContractAddress = '0x1111111254EEB25477B68fb85Ed929f73A960582'; // sample address

  const abiCoder = new ethers.AbiCoder();
  const callData = abiCoder.encode(['uint256'], [1]);

  const postInteraction = new Interaction(new Address(ourContractAddress), callData);

  const extensions = new Extension({
    ...Extension.EMPTY,
    postInteraction: postInteraction.encode(),
  });

  return new LimitOrder(orderInfo, makerTraits, extensions);
};
