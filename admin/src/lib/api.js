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

  // approve or reject a vendor's product (needs the review permission)
  review: async ({ id, decision, note }) => {
    const { data } = await axiosInstance.post(`/admin/products/${id}/review`, { decision, note });
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

  // cancel an unshipped order and refund the customer (over the person's limit it becomes a request)
  cancel: async ({ orderId, reason }) => {
    const { data } = await axiosInstance.post(`/admin/orders/${orderId}/cancel`, { reason });
    return data;
  },

  // an admin approves or rejects a refund that was over someone's limit
  decideRefund: async ({ orderId, decision, note }) => {
    const { data } = await axiosInstance.post(`/admin/orders/${orderId}/refund-request/${decision}`, { note });
    return data;
  },
};

export const userApi = {
  me: async () => {
    const { data } = await axiosInstance.get("/users/me");
    return data.user;
  },
  becomeVendor: async (storeName) => {
    const { data } = await axiosInstance.post("/users/become-vendor", { storeName });
    return data.user;
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
  // turn the vendor and/or support role on or off: { id, vendor?: boolean, support?: boolean }
  setRoles: async ({ id, ...roles }) => {
    const { data } = await axiosInstance.patch(`/admin/customers/${id}/roles`, roles);
    return data;
  },

  pause: async ({ id, paused }) => {
    const { data } = await axiosInstance.patch(`/admin/customers/${id}/pause`, { paused });
    return data;
  },

  getAll: async () => {
    const { data } = await axiosInstance.get("/admin/customers");
    return data;
  },
};

export const vendorApi = {
  payouts: async () => {
    const { data } = await axiosInstance.get("/vendor/payouts");
    return data;
  },
  connect: async () => {
    const { data } = await axiosInstance.post("/vendor/connect");
    return data;
  },
};

export const auditApi = {
  getAll: async (params) => {
    const { data } = await axiosInstance.get("/admin/audit", { params });
    return data;
  },
};
