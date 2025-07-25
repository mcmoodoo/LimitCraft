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
  expires_in: Date;
  signature: Buffer;
  maker_traits: Record<string, any>;
  extension: Record<string, any>;
  status: OrderStatus;
  created_at: Date;
  updated_at: Date;
}

export type OrderStatus = 'pending' | 'filled' | 'cancelled';

export interface OrdersQueryParams {
  status?: OrderStatus;
  maker?: string;
  limit?: string;
  offset?: string;
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
  [key: string]: Array<{
    name: string;
    type: string;
  }>;
}

export interface EIP712Value {
  makerAsset: string;
  takerAsset: string;
  makingAmount: string;
  takingAmount: string;
  makerAddress: string;
  expiresIn: number;
  makerTraits: string;
  extension: string;
}

export interface ApiError {
  error: string;
  message?: string;
}