import crypto from 'crypto';
import { ethers } from 'ethers';

export const generateOrderHash = (orderData) => {
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

export const verifyEIP712Signature = async (orderData, signature) => {
  try {
    const domain = {
      name: 'Orderly',
      version: '1',
      chainId: 1,
      verifyingContract: '0x0000000000000000000000000000000000000000'
    };

    const types = {
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

    const value = {
      makerAsset: orderData.makerAsset,
      takerAsset: orderData.takerAsset,
      makingAmount: orderData.makingAmount,
      takingAmount: orderData.takingAmount,
      makerAddress: orderData.makerAddress,
      expiresIn: Math.floor(new Date(orderData.expiresIn).getTime() / 1000),
      makerTraits: ethers.utils.hexlify(ethers.utils.toUtf8Bytes(JSON.stringify(orderData.makerTraits))),
      extension: ethers.utils.hexlify(ethers.utils.toUtf8Bytes(JSON.stringify(orderData.extension)))
    };

    const digest = ethers.utils._TypedDataEncoder.hash(domain, types, value);
    const recoveredAddress = ethers.utils.verifyMessage(ethers.utils.arrayify(digest), signature);
    
    return recoveredAddress.toLowerCase() === orderData.makerAddress.toLowerCase();
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
};