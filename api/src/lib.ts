import {
  FeeTakerExt,
  Address,
  MakerTraits,
  OrderInfoData,
  Interaction,
  Bps,
  LimitOrder,
  Extension,
} from '@1inch/limit-order-sdk';

export const createOrderExt = async (
  orderInfo: OrderInfoData,
  makerTraits = MakerTraits.default(),
  extra: {
    makerPermit?: Interaction;
    integratorFee?: FeeTakerExt.IntegratorFee;
  } = {}
): Promise<LimitOrder> => {
  //   const fees = new FeeTakerExt.Fees(
  //     new FeeTakerExt.ResolverFee(
  //       new Address(feeParams.protocolFeeReceiver),
  //       new Bps(BigInt(feeParams.feeBps)),
  //       Bps.fromPercent(feeParams.whitelistDiscountPercent)
  //     ),
  //     extra.integratorFee ?? FeeTakerExt.IntegratorFee.ZERO
  //   );

  //   const feeExt = FeeTakerExt.FeeTakerExtension.new(
  //     new Address(feeParams.extensionAddress),
  //     fees,
  //     Object.values(feeParams.whitelist).map((w) => new Address(w as string)),
  //     {
  //       ...extra,
  //       customReceiver: orderInfo.receiver,
  //     }
  //   );

  const extensions = new Extension({
    ...Extension.EMPTY,
    predicate: '0xabcdef1234567890',
  });

  return new LimitOrder(orderInfo, makerTraits, extensions);
};
