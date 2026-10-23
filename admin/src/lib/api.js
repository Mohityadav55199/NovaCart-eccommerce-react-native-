import axiosInstance from "./axios";

export const productApi = {
  getAll: async () => {
    const { data } = await axiosInstance.get("/admin/products");
    return data;
  },

  create: async (formData) => {
    const { data } = await axiosInstance.post("/admin/products", formData);
    return data;
  },

  update: async ({ id, formData }) => {
    const { data } = await axiosInstance.put(`/admin/products/${id}`, formData);
    return data;
  },

  delete: async (productId) => {
    const { data } = await axiosInstance.delete(`/admin/products/${productId}`);
    return data;
  },
};

export const orderApi = {
  getAll: async (params) => {
    const { data } = await axiosInstance.get("/admin/orders", { params });
    return data;
  },

  updateStatus: async ({ orderId, status }) => {
    const { data } = await axiosInstance.patch(`/admin/orders/${orderId}/status`, { status });
    return data;
  },

  // one item: status, carrier and tracking number (admin, or the vendor who owns the item)
  updateItem: async ({ orderId, itemId, ...fields }) => {
    const { data } = await axiosInstance.patch(`/admin/orders/${orderId}/items/${itemId}`, fields);
    return data;
  },

  // admin: cancel an unshipped order and refund the customer
  cancel: async ({ orderId, reason }) => {
    const { data } = await axiosInstance.post(`/admin/orders/${orderId}/cancel`, { reason });
    return data;
  },
};

export const adminApi = {
  check: async () => {
    const { data } = await axiosInstance.get("/admin/check");
    return data;
  },
};

export const statsApi = {
  getDashboard: async () => {
    const { data } = await axiosInstance.get("/admin/stats");
    return data;
  },
};

export const customerApi = {
  setRole: async ({ id, role }) => {
    const { data } = await axiosInstance.patch(`/admin/customers/${id}/role`, { role });
    return data;
  },

  getAll: async () => {
    const { data } = await axiosInstance.get("/admin/customers");
    return data;
  },
};
