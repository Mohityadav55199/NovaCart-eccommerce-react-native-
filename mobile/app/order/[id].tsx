import SafeScreen from "@/components/SafeScreen";
import { useOrder } from "@/hooks/useOrder";
import { capitalizeFirstLetter, getStatusColor } from "@/lib/utils";
import { Order } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";

const formatDateTime = (value?: string) =>
  value
    ? new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

const StatusChip = ({ status }: { status: string }) => (
  <View className="self-start px-3 py-1.5 rounded-full" style={{ backgroundColor: getStatusColor(status) + "20" }}>
    <Text className="text-xs font-bold" style={{ color: getStatusColor(status) }}>
      {capitalizeFirstLetter(status)}
    </Text>
  </View>
);

// order totals: older orders have no stored breakdown, so derive it from the items
const getPricing = (order: Order) => {
  if (order.pricing?.subtotal !== undefined) return order.pricing;
  const subtotal = order.orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.08;
  return { subtotal, shipping: Math.max(0, order.totalPrice - subtotal - tax), tax };
};

function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: order, isLoading, isError, refetch, cancelOrder, isCancelling } = useOrder(id);

  const handleCancel = () => {
    if (!order) return;

    Alert.alert(
      "Cancel this order?",
      `You will be refunded $${order.totalPrice.toFixed(2)} to your original payment method. Items go back into stock.`,
      [
        { text: "Keep order", style: "cancel" },
        {
          text: "Cancel order",
          style: "destructive",
          onPress: async () => {
            try {
              const cancelled = await cancelOrder("Cancelled by customer");
              const refunded = cancelled.cancellation?.refundAmount ?? 0;
              Alert.alert(
                "Order cancelled",
                refunded > 0
                  ? `Your refund of $${refunded.toFixed(2)} has been issued. It can take 5 to 10 business days to appear on your statement.`
                  : "Your order was cancelled."
              );
            } catch (error: any) {
              Alert.alert("Couldn't cancel", error?.response?.data?.error || "Please try again.");
              refetch();
            }
          },
        },
      ]
    );
  };

  return (
    <SafeScreen>
      <View className="px-6 pb-5 border-b border-surface flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Ionicons name="arrow-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <Text className="text-text-primary text-2xl font-bold">
          {order ? `Order #${order._id.slice(-8).toUpperCase()}` : "Order"}
        </Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#00D9FF" />
        </View>
      ) : isError || !order ? (
        <View className="flex-1 items-center justify-center px-6">
          <Ionicons name="alert-circle-outline" size={64} color="#FF6B6B" />
          <Text className="text-text-primary font-semibold text-xl mt-4">Couldn&apos;t load this order</Text>
          <TouchableOpacity className="bg-primary px-6 py-3 rounded-full mt-5" onPress={() => refetch()}>
            <Text className="text-background font-bold">Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
          <View className="px-6 py-4">
            {/* STATUS */}
            <View className="bg-surface rounded-3xl p-5 mb-4">
              <View className="flex-row items-center justify-between">
                <StatusChip status={order.status} />
                <Text className="text-text-secondary text-sm">{formatDateTime(order.createdAt)}</Text>
              </View>

              {order.status === "cancelled" && order.cancellation && (
                <Text className="text-text-secondary text-sm mt-3">
                  Cancelled by {order.cancellation.by === "customer" ? "you" : order.cancellation.by}
                  {order.cancellation.reason && order.cancellation.by !== "customer"
                    ? `: ${order.cancellation.reason}`
                    : ""}
                  .{" "}
                  {order.cancellation.refundAmount && order.cancellation.refundAmount > 0
                    ? `$${order.cancellation.refundAmount.toFixed(2)} was refunded to your original payment method (5 to 10 business days).`
                    : ""}
                </Text>
              )}
            </View>

            {/* ITEMS */}
            <View className="bg-surface rounded-3xl p-5 mb-4">
              <Text className="text-text-primary text-lg font-bold mb-3">Items</Text>
              {order.orderItems.map((item, index) => (
                <View
                  key={item._id}
                  className={`${index > 0 ? "mt-4 pt-4 border-t border-background-lighter" : ""}`}
                >
                  <View className="flex-row">
                    <Image
                      source={item.image}
                      style={{ width: 64, height: 64, borderRadius: 8 }}
                      contentFit="cover"
                    />
                    <View className="flex-1 ml-3">
                      <Text className="text-text-primary font-semibold" numberOfLines={2}>
                        {item.name}
                      </Text>
                      <Text className="text-text-secondary text-sm mt-1">
                        {item.quantity} × ${item.price.toFixed(2)}
                      </Text>
                      <View className="mt-2">
                        <StatusChip status={item.status || order.status} />
                      </View>
                    </View>
                    <Text className="text-text-primary font-bold">${(item.price * item.quantity).toFixed(2)}</Text>
                  </View>

                  {item.trackingNumber ? (
                    <View className="flex-row items-center mt-3 bg-background-lighter rounded-xl px-3 py-2">
                      <Ionicons name="navigate-outline" size={16} color="#1DB954" />
                      <Text className="text-text-secondary text-xs ml-2 flex-1" selectable>
                        {item.carrier ? `${item.carrier}: ` : "Tracking: "}
                        {item.trackingNumber}
                      </Text>
                    </View>
                  ) : item.status === "shipped" ? (
                    <Text className="text-text-secondary text-xs mt-3">Shipped. Tracking details will appear here.</Text>
                  ) : null}
                </View>
              ))}
            </View>

            {/* TIMELINE */}
            {order.statusHistory && order.statusHistory.length > 0 && (
              <View className="bg-surface rounded-3xl p-5 mb-4">
                <Text className="text-text-primary text-lg font-bold mb-3">Tracking</Text>
                {[...order.statusHistory].reverse().map((event, index, all) => (
                  <View key={index} className="flex-row">
                    <View className="items-center mr-3">
                      <View
                        className="size-3 rounded-full mt-1"
                        style={{ backgroundColor: index === 0 ? getStatusColor(event.status) : "#444" }}
                      />
                      {index < all.length - 1 && <View className="w-px flex-1 bg-background-lighter my-1" />}
                    </View>
                    <View className="flex-1 pb-4">
                      <Text className="text-text-primary text-sm">{event.note || capitalizeFirstLetter(event.status)}</Text>
                      <Text className="text-text-secondary text-xs mt-0.5">{formatDateTime(event.at)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* DELIVERY ADDRESS */}
            <View className="bg-surface rounded-3xl p-5 mb-4">
              <Text className="text-text-primary text-lg font-bold mb-2">Delivery address</Text>
              <Text className="text-text-primary">{order.shippingAddress.fullName}</Text>
              <Text className="text-text-secondary text-sm">
                {order.shippingAddress.streetAddress}, {order.shippingAddress.city}, {order.shippingAddress.state}{" "}
                {order.shippingAddress.zipCode}
              </Text>
              <Text className="text-text-secondary text-sm">{order.shippingAddress.phoneNumber}</Text>
            </View>

            {/* PAYMENT SUMMARY */}
            <View className="bg-surface rounded-3xl p-5 mb-4">
              <Text className="text-text-primary text-lg font-bold mb-3">Payment</Text>
              {(() => {
                const pricing = getPricing(order);
                return (
                  <>
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-text-secondary">Subtotal</Text>
                      <Text className="text-text-primary">${pricing.subtotal.toFixed(2)}</Text>
                    </View>
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-text-secondary">Shipping</Text>
                      <Text className="text-text-primary">
                        {pricing.shipping === 0 ? "FREE" : `$${pricing.shipping.toFixed(2)}`}
                      </Text>
                    </View>
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-text-secondary">Tax</Text>
                      <Text className="text-text-primary">${pricing.tax.toFixed(2)}</Text>
                    </View>
                    <View className="border-t border-background-lighter pt-3 mt-1 flex-row justify-between">
                      <Text className="text-text-primary font-bold text-lg">Total</Text>
                      <Text className="text-primary font-bold text-xl">${order.totalPrice.toFixed(2)}</Text>
                    </View>
                    {order.paymentResult?.status === "refunded" && (
                      <Text className="text-text-secondary text-xs mt-2">Refunded</Text>
                    )}
                  </>
                );
              })()}
            </View>

            {/* CANCEL */}
            {order.status === "pending" && (
              <TouchableOpacity
                className="border border-red-500/60 rounded-2xl py-4 items-center"
                activeOpacity={0.8}
                onPress={handleCancel}
                disabled={isCancelling}
              >
                {isCancelling ? (
                  <ActivityIndicator color="#EF4444" />
                ) : (
                  <Text className="text-red-500 font-bold">Cancel order & get a refund</Text>
                )}
              </TouchableOpacity>
            )}
            {order.status === "shipped" && (
              <Text className="text-text-secondary text-xs text-center">
                This order has shipped, so it can no longer be cancelled.
              </Text>
            )}
          </View>
        </ScrollView>
      )}
    </SafeScreen>
  );
}
export default OrderDetailScreen;
