import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';

export const useOrders = (filters = {}) => {
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: () => api.getOrders(filters),
    staleTime: 30000, // 30 seconds
  });
};

export const useOrder = (orderHash) => {
  return useQuery({
    queryKey: ['order', orderHash],
    queryFn: () => api.getOrder(orderHash),
    enabled: !!orderHash,
    staleTime: 60000, // 1 minute
  });
};

export const useCreateOrder = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: api.createOrder,
    onSuccess: () => {
      // Invalidate orders queries to refetch data
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
};