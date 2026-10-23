import { Navigate, Route, Routes } from "react-router";
import LoginPage from "./pages/LoginPage";
import { useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { setTokenGetter } from "./lib/axios";
import DashboardPage from "./pages/DashboardPage";
import ProductsPage from "./pages/ProductsPage";
import OrdersPage from "./pages/OrdersPage";
import CustomersPage from "./pages/CustomersPage";
import DashboardLayout from "./layouts/DashboardLayout";

import PageLoader from "./components/PageLoader";
import AdminGate from "./components/AdminGate";
import { useRole } from "./lib/role";

// customers (and role management) are for admins only
function CustomersRoute() {
  const { role } = useRole();
  return role === "admin" ? <CustomersPage /> : <Navigate to="/dashboard" replace />;
}

function App() {
  const { isSignedIn, isLoaded, getToken } = useAuth();

  useEffect(() => {
    setTokenGetter(getToken);
  }, [getToken]);

  if (!isLoaded) return <PageLoader />;

  return (
    <Routes>
      <Route path="/login" element={isSignedIn ? <Navigate to={"/dashboard"} /> : <LoginPage />} />

      <Route path="/" element={
          isSignedIn ? (
            <AdminGate>
              <DashboardLayout />
            </AdminGate>
          ) : (
            <Navigate to={"/login"} />
          )
        }>
        <Route index element={<Navigate to={"dashboard"} />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="customers" element={<CustomersRoute />} />
      </Route>
    </Routes>
  );
}

export default App;
