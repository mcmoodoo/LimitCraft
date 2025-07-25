import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api.ts';
import type { OrdersQueryParams, OrdersResponse, DatabaseOrder, OrderWithSignature } from '../types/index.ts';

export const useOrders = (filters: OrdersQueryParams = {}) => {
  return useQuery<OrdersResponse>({
    queryKey: ['orders', filters],
    queryFn: () => api.getOrders(filters),
    staleTime: 30000, // 30 seconds
  });
};

export const useOrder = (orderHash: string | undefined) => {
  return useQuery<DatabaseOrder>({
    queryKey: ['order', orderHash],
    queryFn: () => api.getOrder(orderHash!),
    enabled: !!orderHash,
    staleTime: 60000, // 1 minute
  });
};

export const useCreateOrder = () => {
  const queryClient = useQueryClient();
  
  return useMutation<DatabaseOrder, Error, OrderWithSignature>({
    mutationFn: api.createOrder,
    onSuccess: () => {
      // Invalidate orders queries to refetch data
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
};