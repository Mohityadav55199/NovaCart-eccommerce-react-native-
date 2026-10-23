import { Outlet } from "react-router";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import { useRole } from "../lib/role";

function DashboardLayout() {
  const { paused } = useRole();

  return (
    <div className="drawer lg:drawer-open">
      <input id="my-drawer" type="checkbox" className="drawer-toggle" defaultChecked />

      <div className="drawer-content">
        <Navbar />

        <main className="p-6">
          {paused && (
            <div role="alert" className="alert alert-warning mb-4 text-sm">
              <span>Selling is paused for your store. Your products are hidden and you cannot add new ones. You can still ship open orders. Contact the store owner to resume.</span>
            </div>
          )}
          <Outlet />
        </main>
      </div>

      <Sidebar />
    </div>
  );
}

export default DashboardLayout;
