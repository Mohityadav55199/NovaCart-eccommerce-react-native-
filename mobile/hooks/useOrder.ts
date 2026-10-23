import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import { Order } from "@/types";

// one order (own orders only) plus the cancel action
export const useOrder = (orderId: string) => {
  const api = useApi();
  const queryClient = useQueryClient();

  const query = useQuery<Order>({
    queryKey: ["orders", orderId],
    queryFn: async () => {
      const { data } = await api.get(`/orders/${orderId}`);
      return data.order;
    },
    enabled: !!orderId,
  });

  const cancelMutation = useMutation({
    mutationFn: async (reason?: string) => {
      const { data } = await api.post(`/orders/${orderId}/cancel`, { reason });
      return data.order as Order;
    },
    onSuccess: () => {
      // stock was put back and the order list changed
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  return { ...query, cancelOrder: cancelMutation.mutateAsync, isCancelling: cancelMutation.isPending };
};
