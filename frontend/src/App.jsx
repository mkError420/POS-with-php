import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import DashboardLayout from './components/DashboardLayout';
import Dashboard from './components/Dashboard';
import Checkout from './components/Checkout';
import Inventory from './components/Inventory';
import Suppliers from './components/Suppliers';
import Customers from './components/Customers';
import SalesHistory from './components/SalesHistory';
import ManageStaff from './components/ManageStaff';
import Settings from './components/Settings';
import ManageShops from './components/ManageShops';
import SystemUsers from './components/SystemUsers';
import HeldBills from './components/HeldBills';
import OtherCost from './components/OtherCost';
import TotalRevenue from './components/TotalRevenue';
import Wastage from './components/Wastage';
import Returns from './components/Returns';
import ManualOrders from './components/ManualOrders';

const API_BASE_URL = 'http://localhost:5000/api';

// Decode JWT payload without verifying signature (verification is done server-side)
function decodeToken(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

// Get the default landing path based on role and allowed_sections
function getDefaultPath(user) {
  if (!user) return '/checkout';
  if (user.role === 'super_admin') return '/dashboard';
  if (user.role === 'shop_staff') {
    const allowed = user.allowed_sections || [];
    return allowed.length > 0 ? allowed[0] : '/checkout';
  }
  return '/checkout';
}

export default function App() {
  const [user, setUser] = useState(null);       // null = not logged in
  const [loading, setLoading] = useState(true); // checking stored token on startup
  const [suspendedMessage, setSuspendedMessage] = useState(''); // shop suspended message
  const [currentPath, setCurrentPath] = useState('/checkout');
  const [lowStockAlerts, setLowStockAlerts] = useState([]);
  const [expiryAlerts, setExpiryAlerts] = useState([]);
  const [heldBillsCount, setHeldBillsCount] = useState(0);
  const [resumedHeldBill, setResumedHeldBill] = useState(null);

  // On mount: verify existing token against the backend
  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (!token || !storedUser) {
      setLoading(false);
      return;
    }

    // Quick local expiry check first
    const decoded = decodeToken(token);
    if (!decoded || decoded.exp * 1000 <= Date.now()) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setLoading(false);
      return;
    }

    // Verify the token is accepted by the real backend
    fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (res.ok) {
          return res.json();
        }
        // If 403, check if shop is suspended
        if (res.status === 403) {
          const data = await res.json().catch(() => ({}));
          const msg = data.error || 'Access denied.';
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setSuspendedMessage(msg);
          setLoading(false);
          return;
        }
        throw new Error('Token rejected by server');
      })
      .then((data) => {
        if (!data) return; // handled above (suspended)
        // Build user object from server response
        const userObj = {
          id: data.id,
          name: data.name,
          email: data.email,
          role: data.role,
          shop_id: data.shop_id,
          shop_name: data.shop_name || 'Global System',
          allowed_sections: data.allowed_sections,
          logo: data.logo
        };
        localStorage.setItem('user', JSON.stringify(userObj));
        setUser(userObj);
        setCurrentPath(getDefaultPath(userObj));
      })
      .catch(() => {
        // Invalid/mock token — force logout
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      })
      .finally(() => setLoading(false));
  }, []);

  // Fetch low-stock alerts and shop name whenever user or path changes
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const loadSessionDetails = async () => {
      try {
        // Only fetch shop details for non-super-admins
        if (user.role !== 'super_admin') {
          const shopResponse = await fetch(`${API_BASE_URL}/shops/my-shop`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          // If the shop is suspended, the server returns 403 — force logout
          if (shopResponse.status === 403) {
            const data = await shopResponse.json().catch(() => ({}));
            const msg = data.error || 'This shop has been suspended.';
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setUser(null);
            setLowStockAlerts([]);
            setExpiryAlerts([]);
            setSuspendedMessage(msg);
            return;
          }

          if (shopResponse.ok) {
            const shopData = await shopResponse.json();
            setUser((prev) => {
              const updated = {
                ...prev,
                shop_name: shopData.name,
                shop_email: shopData.email,
                shop_phone: shopData.phone,
                shop_address: shopData.address,
                logo: shopData.logo
              };
              localStorage.setItem('user', JSON.stringify(updated));
              return updated;
            });
          }

          // Fetch low stock warnings
          const stockResponse = await fetch(`${API_BASE_URL}/products?low_stock=true`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (stockResponse.ok) {
            setLowStockAlerts(await stockResponse.json());
          }

          // Fetch expiring alerts
          const expiringResponse = await fetch(`${API_BASE_URL}/products?expiring=true`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (expiringResponse.ok) {
            setExpiryAlerts(await expiringResponse.json());
          }

          // Fetch held bills count
          const heldResponse = await fetch(`${API_BASE_URL}/held-bills`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (heldResponse.ok) {
            const heldData = await heldResponse.json();
            setHeldBillsCount(heldData.filter(bill => bill.status === 'held').length);
          }
        }
      } catch (e) {
        console.error('Session detail load failed:', e);
      }
    };

    loadSessionDetails();
  }, [user?.role, currentPath]);

  // Called by Login component on successful authentication
  const handleLoginSuccess = (userObj) => {
    setUser(userObj);
    setCurrentPath(getDefaultPath(userObj));
  };

  // Logout
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setLowStockAlerts([]);
    setExpiryAlerts([]);
    setSuspendedMessage('');
  };

  // Routing Handler
  const renderPageContent = () => {
    // Super admin guard: redirect to their panel if they navigate to shop-only pages
    if (user.role === 'super_admin') {
      switch (currentPath) {
        case '/dashboard': return <Dashboard />;
        case '/shops': return <ManageShops />;
        case '/users': return <SystemUsers />;
        case '/products': return <Inventory />;
        case '/wastage': return <Wastage />;
        case '/other-cost': return <OtherCost />;
        case '/total-revenue': return <TotalRevenue />;
        case '/settings': return <Settings />;
        default: return <Dashboard />;
      }
    }

    // Staff access guard: redirect if path is not in allowed_sections
    if (user.role === 'shop_staff') {
      const allowed = user.allowed_sections || [];
      if (!allowed.includes(currentPath)) {
        const firstAllowed = allowed.length > 0 ? allowed[0] : null;
        if (firstAllowed && firstAllowed !== currentPath) {
          setTimeout(() => setCurrentPath(firstAllowed), 0);
        } else if (!firstAllowed) {
          return (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center border border-rose-100 text-rose-500">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m0-6h.01M5.071 19.243a9 9 0 1113.858 0L12 12 5.071 19.243z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Access Restricted</h3>
                <p className="text-sm text-slate-500 max-w-sm">Your administrator has not granted you access to any sections yet. Please contact support.</p>
              </div>
            </div>
          );
        }
      }
    }

    switch (currentPath) {
      case '/dashboard': return <Dashboard />;
      case '/checkout': return <Checkout resumedHeldBill={resumedHeldBill} onClearResumedHeldBill={() => setResumedHeldBill(null)} onHeldBillsChange={(count) => setHeldBillsCount(count)} />;
      case '/held-bills': return <HeldBills onResume={(bill) => { setResumedHeldBill(bill); setCurrentPath('/checkout'); }} onHeldBillsChange={(count) => setHeldBillsCount(count)} />;
      case '/products': return <Inventory />;
      case '/suppliers': return <Suppliers />;
      case '/customers': return <Customers />;
      case '/sales': return <SalesHistory />;
      case '/manual-orders': return <ManualOrders />;
      case '/other-cost': return <OtherCost />;
      case '/total-revenue': return <TotalRevenue />;
      case '/wastage': return <Wastage />;
      case '/returns': return <Returns />;
      case '/staff': return <ManageStaff />;
      case '/settings': return <Settings />;
      default: return <Checkout resumedHeldBill={resumedHeldBill} onClearResumedHeldBill={() => setResumedHeldBill(null)} onHeldBillsChange={(count) => setHeldBillsCount(count)} />;
    }
  };

  // Startup loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-600 flex items-center justify-center shadow-xl shadow-indigo-600/40 animate-pulse">
            <span className="text-white font-bold text-sm">POS</span>
          </div>
          <p className="text-slate-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Not logged in — show Login page (with optional suspension message)
  if (!user) {
    return (
      <>
        {suspendedMessage && (
          <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-center p-4 bg-slate-950">
            <div className="w-full max-w-md bg-rose-900/40 border border-rose-500/40 rounded-2xl p-6 text-center shadow-2xl backdrop-blur-sm">
              <div className="w-14 h-14 rounded-2xl bg-rose-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-rose-300 mb-1">Shop Suspended</h3>
              <p className="text-sm text-rose-200/80 mb-4">{suspendedMessage}</p>
              <button
                onClick={() => setSuspendedMessage('')}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Go to Login
              </button>
            </div>
          </div>
        )}
        <Login onLoginSuccess={handleLoginSuccess} />
      </>
    );
  }

  // Logged in — show dashboard
  return (
    <DashboardLayout
      user={user}
      lowStockItems={lowStockAlerts}
      expiryItems={expiryAlerts}
      heldBillsCount={heldBillsCount}
      currentPath={currentPath}
      onNavigate={(path) => setCurrentPath(path)}
      onLogout={handleLogout}
    >
      {renderPageContent()}
    </DashboardLayout>
  );
}
