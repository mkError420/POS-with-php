import React from 'react';

// Inline SVG Icon Helper Components
const DashboardIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" /></svg>;
const POSIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>;
const InventoryIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>;
const UsersIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;
const ReportsIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" /></svg>;
const SuppliersIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>;
const ShopsIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>;
const SettingsIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const ManualOrdersIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;

export default function Sidebar({
  role = 'shop_admin',
  logo = null,
  allowedSections = null,
  sidebarOpen,
  setSidebarOpen,
  isCollapsed,
  setIsCollapsed,
  currentPath = '/dashboard',
  onNavigate,
  heldBillsCount = 0
}) {

  const getNavItems = () => {
    switch (role) {
      case 'super_admin':
        return [
          {
            section: 'System Administration',
            items: [
              { label: 'Global Analytics', path: '/dashboard', icon: <DashboardIcon /> },
              { label: 'Manage Shops', path: '/shops', icon: <ShopsIcon /> },
              { label: 'System Users', path: '/users', icon: <UsersIcon /> },
              { label: 'Inventory (Products)', path: '/products', icon: <InventoryIcon /> },
            ]
          },
          {
            section: 'Financials & Reports',
            items: [
              { label: 'Wastage', path: '/wastage', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> },
              { label: 'Other Cost', path: '/other-cost', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
              { label: 'Total Revenue', path: '/total-revenue', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg> },
            ]
          },
          {
            section: 'Settings',
            items: [
              { label: 'Settings', path: '/settings', icon: <SettingsIcon /> },
            ]
          }
        ];
      case 'shop_admin':
        return [
          {
            section: 'Dashboard',
            items: [
              { label: 'Shop Dashboard', path: '/dashboard', icon: <DashboardIcon /> }
            ]
          },
          {
            section: 'Sales & Billing',
            items: [
              { label: 'POS Checkout', path: '/checkout', icon: <POSIcon /> },
              { label: 'Held Bills', path: '/held-bills', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>, badge: heldBillsCount },
              { label: 'Sales Orders', path: '/manual-orders', icon: <ManualOrdersIcon /> },
              { label: 'Sales History', path: '/sales', icon: <ReportsIcon /> },
              { label: 'Product Returns', path: '/returns', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 15v-3a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m-9 5h1a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2z" /></svg> }
            ]
          },
          {
            section: 'Inventory & Wastage',
            items: [
              { label: 'Inventory (Products)', path: '/products', icon: <InventoryIcon /> },
              { label: 'Wastage', path: '/wastage', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> }
            ]
          },
          {
            section: 'Directory',
            items: [
              { label: 'Product Purches', path: '/suppliers', icon: <SuppliersIcon /> },
              { label: 'Customers', path: '/customers', icon: <UsersIcon /> }
            ]
          },
          {
            section: 'Financials',
            items: [
              { label: 'Other Cost', path: '/other-cost', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
              { label: 'Total Revenue', path: '/total-revenue', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg> }
            ]
          },
          {
            section: 'Management',
            items: [
              { label: 'Manage Staff', path: '/staff', icon: <UsersIcon /> },
              { label: 'Settings', path: '/settings', icon: <SettingsIcon /> }
            ]
          }
        ];
      case 'shop_staff':
        return [
          {
            section: 'Sales & Billing',
            items: [
              { label: 'POS Checkout', path: '/checkout', icon: <POSIcon /> },
              { label: 'Held Bills', path: '/held-bills', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>, badge: heldBillsCount },
              { label: 'Manual Orders', path: '/manual-orders', icon: <ManualOrdersIcon /> },
              { label: 'My Sales Log', path: '/sales', icon: <ReportsIcon /> },
              { label: 'Product Returns', path: '/returns', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 15v-3a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m-9 5h1a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2z" /></svg> }
            ]
          },
          {
            section: 'Inventory & Directory',
            items: [
              { label: 'Inventory check', path: '/products', icon: <InventoryIcon /> },
              { label: 'Customers', path: '/customers', icon: <UsersIcon /> }
            ]
          },
          {
            section: 'Preferences',
            items: [
              { label: 'Settings', path: '/settings', icon: <SettingsIcon /> }
            ]
          }
        ];
      default:
        return [];
    }
  };

  const rawNavItems = getNavItems();
  const navItems = React.useMemo(() => {
    if (role !== 'shop_staff' || !allowedSections) {
      return rawNavItems;
    }
    return rawNavItems
      .map(sec => ({
        ...sec,
        items: sec.items.filter(item => allowedSections.includes(item.path))
      }))
      .filter(sec => sec.items.length > 0);
  }, [rawNavItems, role, allowedSections]);

  return (
    <>
      {/* 1. Mobile Sidebar Backdrop Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 2. Sidebar Navigation Panel */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-slate-900 text-slate-100 transition-all duration-300 ease-in-out lg:static lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } ${isCollapsed ? 'w-20' : 'w-64'}`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800">
          <div className="flex items-center space-x-3 overflow-hidden">
            {logo ? (
              <img
                src={logo}
                alt="Brand Logo"
                className="w-9 h-9 rounded-lg object-contain bg-slate-900 border border-slate-700 shrink-0"
              />
            ) : (
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-600 font-bold text-white shrink-0">
                POS
              </div>
            )}
            {!isCollapsed && (
              <span className="text-lg font-bold tracking-wider bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent truncate">
                {role === 'super_admin' ? 'SuperAdmin' : 'ShopPortal'}
              </span>
            )}
          </div>
          {/* Mobile close button */}
          <button
            className="p-1 rounded-md text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
          {navItems.map((sectionObj, idx) => (
            <div key={sectionObj.section || idx} className="space-y-1">
              {/* Section Header */}
              {sectionObj.section && !isCollapsed && (
                <div className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 mt-2">
                  {sectionObj.section}
                </div>
              )}
              {/* Section divider when collapsed */}
              {sectionObj.section && isCollapsed && idx > 0 && (
                <div className="border-t border-slate-800 my-2 mx-3" />
              )}

              {sectionObj.items.map((item) => {
                const isActive = currentPath === item.path;
                return (
                  <button
                    key={item.label}
                    onClick={() => {
                      if (onNavigate) onNavigate(item.path);
                      setSidebarOpen(false); // Auto close mobile drawer on tap
                    }}
                    className={`w-full flex items-center px-3 py-2.5 rounded-lg font-medium transition-all group text-left ${isActive
                        ? (role === 'super_admin'
                          ? 'bg-slate-600 text-white shadow-lg shadow-indigo-600/30'
                          : 'bg-slate-600 text-white shadow-lg shadow-slate-600/30')
                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                      }`}
                    title={isCollapsed ? item.label : ''}
                  >
                    <div className={`shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`}>
                      {item.icon}
                    </div>
                    {!isCollapsed && <span className="ml-3 truncate text-sm">{item.label}</span>}
                    {item.badge !== undefined && item.badge > 0 && !isCollapsed && (
                      <span className="ml-auto bg-amber-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Desktop Collapse Toggle Footer */}
        <div className="hidden border-t border-slate-800 p-4 lg:block">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center justify-center w-full py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <svg
              className={`w-6 h-6 transform transition-transform ${isCollapsed ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </aside>
    </>
  );
}
