import type { EIP712Domain, EIP712Types, EIP712TypedData, OrderData } from '../types/index.ts';

export const EIP712_DOMAIN: EIP712Domain = {
  name: 'Orderly',
  version: '1',
  chainId: 1,
  verifyingContract: '0x0000000000000000000000000000000000000000'
};

export const EIP712_TYPES: EIP712Types = {
  Order: [
    { name: 'makerAsset', type: 'address' },
    { name: 'takerAsset', type: 'address' },
    { name: 'makingAmount', type: 'uint256' },
    { name: 'takingAmount', type: 'uint256' },
    { name: 'makerAddress', type: 'address' },
    { name: 'expiresIn', type: 'uint256' },
    { name: 'makerTraits', type: 'bytes' },
    { name: 'extension', type: 'bytes' }
  ]
};

export const createOrderTypedData = (orderData: OrderData): EIP712TypedData => {
  const value = {
    makerAsset: orderData.makerAsset,
    takerAsset: orderData.takerAsset,
    makingAmount: orderData.makingAmount,
    takingAmount: orderData.takingAmount,
    makerAddress: orderData.makerAddress,
    expiresIn: Math.floor(new Date(orderData.expiresIn).getTime() / 1000),
    makerTraits: '0x' + Buffer.from(JSON.stringify(orderData.makerTraits)).toString('hex'),
    extension: '0x' + Buffer.from(JSON.stringify(orderData.extension)).toString('hex')
  };

  return {
    domain: EIP712_DOMAIN,
    types: EIP712_TYPES,
    value,
    primaryType: 'Order'
  };
};