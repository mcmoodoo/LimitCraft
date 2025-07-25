export interface OrderData {
  makerAsset: string;
  takerAsset: string;
  makingAmount: string;
  takingAmount: string;
  makerAddress: string;
  expiresIn: string;
  makerTraits: Record<string, any>;
  extension: Record<string, any>;
}

export interface OrderWithSignature extends OrderData {
  signature: string;
}

export interface DatabaseOrder {
  order_hash: string;
  maker_asset: string;
  taker_asset: string;
  making_amount: string;
  taking_amount: string;
  maker_address: string;
  expires_in: string;
  signature: ArrayBuffer;
  maker_traits: Record<string, any>;
  extension: Record<string, any>;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
}

export type OrderStatus = 'pending' | 'filled' | 'cancelled';

export interface OrdersQueryParams {
  status?: OrderStatus;
  maker?: string;
  limit?: number;
  offset?: number;
}

export interface OrdersResponse {
  orders: DatabaseOrder[];
  total: number;
  limit: number;
  offset: number;
}

export interface EIP712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

export interface EIP712Types {
  Order: Array<{
    name: string;
    type: string;
  }>;
}

export interface EIP712TypedData {
  domain: EIP712Domain;
  types: EIP712Types;
  value: Record<string, any>;
  primaryType: string;
}

export interface ApiErrorResponse {
  error: string;
  message?: string;
}

export class ApiError extends Error {
  status: number;
  
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}