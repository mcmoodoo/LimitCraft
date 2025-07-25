import crypto from 'crypto';
import { ethers } from 'ethers';
import type { OrderData, EIP712Domain, EIP712Types, EIP712Value } from '../types/index.js';

export const generateOrderHash = (orderData: OrderData): string => {
  const {
    makerAsset,
    takerAsset,
    makingAmount,
    takingAmount,
    makerAddress,
    expiresIn,
    makerTraits,
    extension
  } = orderData;
  
  const dataToHash = [
    makerAsset,
    takerAsset,
    makingAmount,
    takingAmount,
    makerAddress,
    expiresIn,
    JSON.stringify(makerTraits),
    JSON.stringify(extension)
  ].join('|');
  
  return '0x' + crypto.createHash('sha256').update(dataToHash).digest('hex');
};

export const verifyEIP712Signature = async (orderData: OrderData, signature: string): Promise<boolean> => {
  try {
    const domain: EIP712Domain = {
      name: 'Orderly',
      version: '1',
      chainId: 1,
      verifyingContract: '0x0000000000000000000000000000000000000000'
    };

    const types: EIP712Types = {
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

    const value: EIP712Value = {
      makerAsset: orderData.makerAsset,
      takerAsset: orderData.takerAsset,
      makingAmount: orderData.makingAmount,
      takingAmount: orderData.takingAmount,
      makerAddress: orderData.makerAddress,
      expiresIn: Math.floor(new Date(orderData.expiresIn).getTime() / 1000),
      makerTraits: ethers.hexlify(ethers.toUtf8Bytes(JSON.stringify(orderData.makerTraits))),
      extension: ethers.hexlify(ethers.toUtf8Bytes(JSON.stringify(orderData.extension)))
    };

    const digest = ethers.TypedDataEncoder.hash(domain, types, value);
    const recoveredAddress = ethers.verifyMessage(ethers.getBytes(digest), signature);
    
    return recoveredAddress.toLowerCase() === orderData.makerAddress.toLowerCase();
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
};