import type { OrdersQueryParams, OrdersResponse, DatabaseOrder, OrderWithSignature } from '../types/index.ts';

const API_BASE_URL = 'http://localhost:3000/api';

export class ApiError extends Error {
  status: number;
  
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(error.error || 'Request failed', response.status);
  }
  return response.json();
};

export const api = {
  // Get all orders with optional filters
  getOrders: async (filters: OrdersQueryParams = {}): Promise<OrdersResponse> => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value));
      }
    });
    
    const url = `${API_BASE_URL}/orders${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(url);
    return handleResponse<OrdersResponse>(response);
  },

  // Get order by hash
  getOrder: async (orderHash: string): Promise<DatabaseOrder> => {
    const response = await fetch(`${API_BASE_URL}/order/${orderHash}`);
    return handleResponse<DatabaseOrder>(response);
  },

  // Create new order
  createOrder: async (orderData: OrderWithSignature): Promise<DatabaseOrder> => {
    const response = await fetch(`${API_BASE_URL}/limit-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderData),
    });
    return handleResponse<DatabaseOrder>(response);
  },
};