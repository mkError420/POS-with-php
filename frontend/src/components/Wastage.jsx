import React, { useState, useEffect } from 'react';

const API_BASE_URL = 'http://localhost:5000/api';

export default function Wastage() {
  const userObj = JSON.parse(localStorage.getItem('user') || '{}');
  const isSuperAdmin = userObj.role === 'super_admin';

  const [wastages, setWastages] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState(null);
  const [alert, setAlert] = useState(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [shops, setShops] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    setCurrentPage(1);
  }, [search, startDate, endDate, selectedShopId]);
 
  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
 
  // Form states
  const [formData, setFormData] = useState({
    product_id: '',
    quantity: '',
    reason: 'Damaged',
    notes: '',
    adjusted_at: new Date().toISOString().split('T')[0]
  });
 
  const fetchWastages = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      let url = `${API_BASE_URL}/wastages?`;
      if (startDate) url += `start_date=${startDate}&`;
      if (endDate) url += `end_date=${endDate}&`;
      if (isSuperAdmin && selectedShopId) {
        url += `shop_id=${selectedShopId}&`;
      }
 
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to retrieve wastage adjustments.');
      const data = await response.json();
      setWastages(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
 
  const fetchProducts = async () => {
    if (isSuperAdmin) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/products`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch inventory products.');
      const data = await response.json();
      setProducts(data);
    } catch (err) {
      console.error(err.message);
    }
  };
 
  useEffect(() => {
    if (isSuperAdmin) {
      const fetchShops = async () => {
        try {
          const token = localStorage.getItem('token');
          const response = await fetch(`${API_BASE_URL}/shops`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (response.ok) {
            const data = await response.json();
            setShops(data);
          }
        } catch (err) {
          console.error('Failed to fetch shops:', err);
        }
      };
      fetchShops();
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    fetchWastages();
    fetchProducts();
  }, [startDate, endDate, selectedShopId]);

  const triggerAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 4000);
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // 1. RECORD WASTAGE
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!formData.product_id || !formData.quantity || !formData.reason || !formData.adjusted_at) {
      triggerAlert('error', 'Please fill in all required fields.');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/wastages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          product_id: parseInt(formData.product_id),
          quantity: parseInt(formData.quantity),
          reason: formData.reason,
          notes: formData.notes,
          adjusted_at: formData.adjusted_at
        })
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'Failed to record stock adjustment.');

      triggerAlert('success', 'Wastage stock adjustment logged successfully!');
      setShowAddModal(false);
      resetForm();
      fetchWastages();
      fetchProducts(); // Refresh product list to update stock preview
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  // 2. DELETE / REVERT ADJUSTMENT
  const handleDelete = async (wastageId) => {
    if (!window.confirm('Are you sure you want to delete this wastage adjustment? This will restore the stock quantity to this product.')) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/wastages/${wastageId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'Failed to delete wastage record.');

      triggerAlert('success', 'Wastage record deleted and inventory restored successfully!');
      fetchWastages();
      fetchProducts();
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const resetForm = () => {
    setFormData({
      product_id: '',
      quantity: '',
      reason: 'Damaged',
      notes: '',
      adjusted_at: new Date().toISOString().split('T')[0]
    });
  };

  const exportWastagesToCSV = () => {
    if (filteredWastages.length === 0) {
      triggerAlert('error', 'No wastage records to export in the current view.');
      return;
    }

    const headers = ['Wastage ID', 'Adjustment Date', 'Product Name', 'Product SKU', 'Quantity Adjusted', 'Estimated Loss (Cost)', 'Reason', 'Notes', 'Shop Name'];

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '';
      let str = String(val);
      if (/[",\n\r]/.test(str)) {
        str = `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = filteredWastages.map(w => [
      w.id,
      `"${new Date(w.adjusted_at).toLocaleString()}"`,
      escapeCSV(w.product_name),
      escapeCSV(w.product_sku),
      w.quantity,
      parseFloat(w.cost_loss || 0).toFixed(2),
      escapeCSV(w.reason),
      escapeCSV(w.notes || ''),
      escapeCSV(w.shop_name || 'N/A')
    ]);

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `wastage_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    triggerAlert('success', 'Wastage logs exported to CSV successfully!');
  };

  // HELPER FORMATTERS
  const formatCurrency = (val) => `৳${parseFloat(val).toFixed(2)}`;
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) {
      return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric'
      });
    }
    return new Date(dateStr).toLocaleDateString();
  };

  // FILTERED WASTAGES FOR CLIENT SIDE SEARCH
  const filteredWastages = wastages.filter(w => {
    const searchLower = search.toLowerCase();
    return w.product_name.toLowerCase().includes(searchLower) || 
           w.product_sku.toLowerCase().includes(searchLower) ||
           w.reason.toLowerCase().includes(searchLower) ||
           (w.notes && w.notes.toLowerCase().includes(searchLower));
  });

  const totalPages = Math.ceil(filteredWastages.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentWastages = filteredWastages.slice(indexOfFirstItem, indexOfLastItem);

  // KPI STATS CALCULATION
  const totalFinancialLoss = wastages.reduce((sum, w) => sum + parseFloat(w.cost_loss), 0);
  const totalWastedUnits = wastages.reduce((sum, w) => sum + parseInt(w.quantity), 0);

  return (
    <div className="space-y-6">
      {/* Alerts Banner */}
      {alert && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg flex items-center transition-all ${
          alert.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
        }`}>
          <span className="text-sm font-semibold">{alert.message}</span>
        </div>
      )}

      {/* Title Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Damage & Wastage Logs</h2>
          <p className="text-sm text-slate-500">Track expired, damaged, stolen inventory, or log manual stock adjustments</p>
        </div>
        <div className="flex items-center space-x-3 w-full sm:w-auto">
            <button
                onClick={exportWastagesToCSV}
                className="bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 px-4 border border-slate-200 rounded-xl text-sm shadow-xs transition-colors flex items-center space-x-2"
            >
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Export CSV</span>
            </button>
            {!isSuperAdmin && (
            <button
              onClick={() => { resetForm(); setShowAddModal(true); }}
              className="bg-rose-600 hover:bg-rose-700 text-white font-semibold py-2.5 px-5 rounded-xl text-sm shadow-sm transition-colors flex items-center space-x-2 w-full sm:w-auto justify-center"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>Log Stock Adjustment</span>
            </button>
            )}
        </div>
      </div>
 
      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {/* Card 1 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-rose-50 text-rose-500 rounded-xl">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Financial Loss</span>
          </div>
          <div className="mt-4">
            <span className="block text-2xl font-black text-rose-600">{formatCurrency(totalFinancialLoss)}</span>
            <span className="text-xs text-slate-450">Accumulated cost-price value of loss</span>
          </div>
        </div>
 
        {/* Card 2 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Wasted / Adjusted Units</span>
          </div>
          <div className="mt-4">
            <span className="block text-2xl font-black text-slate-800">{totalWastedUnits} Units</span>
            <span className="text-xs text-slate-450">Quantity of physical stock written off</span>
          </div>
        </div>
 
        {/* Card 3 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-slate-100 text-slate-550 rounded-xl">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Logged Adjustments</span>
          </div>
          <div className="mt-4">
            <span className="block text-2xl font-black text-slate-800">{wastages.length} Records</span>
            <span className="text-xs text-slate-450">Separate adjustments registered</span>
          </div>
        </div>
      </div>

      {/* Dynamic Graph Chart */}
      {(() => {
        // Calculate dynamic trend data from the current loaded wastages
        const trendMap = {};
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          trendMap[dateStr] = { date: dateStr, loss: 0 };
        }

        wastages.forEach(item => {
          if (!item.adjusted_at) return;
          const dateStr = new Date(item.adjusted_at).toISOString().split('T')[0];
          if (trendMap[dateStr]) {
            trendMap[dateStr].loss += parseFloat(item.cost_loss || 0);
          }
        });

        const chartData = Object.values(trendMap);
        const chartValues = chartData.map(d => d.loss);
        const maxVal = Math.max(...chartValues, 100);

        return (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs relative">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Wastage Loss Trend</h3>
              <p className="text-xs text-slate-500">Daily cost value of inventory write-offs over the last 7 days</p>
            </div>

            <div className="relative w-full h-[180px] mt-4">
              {/* SVG Plot */}
              <svg 
                viewBox="0 0 600 180" 
                className="w-full h-full overflow-visible"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="wastageAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Grid Lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                  const y = 15 + (1 - ratio) * 125;
                  const labelVal = ratio * maxVal;
                  return (
                    <g key={idx}>
                      <line 
                        x1={55} 
                        y1={y} 
                        x2={575} 
                        y2={y} 
                        stroke="#f1f5f9" 
                        strokeWidth="1.5"
                      />
                      <text 
                        x={43} 
                        y={y + 4} 
                        textAnchor="end" 
                        className="text-[10px] font-bold text-slate-400 fill-current font-sans"
                      >
                        ৳{Math.round(labelVal)}
                      </text>
                    </g>
                  );
                })}

                {/* Path Logic */}
                {(() => {
                  const chartPoints = chartData.map((d, index) => {
                    const val = d.loss;
                    const x = 55 + (index * (600 - 55 - 25) / 6);
                    const y = 140 - ((val / maxVal) * 125);
                    return { x, y, val, date: d.date };
                  });

                  const linePath = chartPoints.reduce((path, pt, i) => {
                    return path + (i === 0 ? `M ${pt.x} ${pt.y}` : ` L ${pt.x} ${pt.y}`);
                  }, '');

                  const areaPath = `${linePath} L ${chartPoints[chartPoints.length - 1].x} 140 L ${chartPoints[0].x} 140 Z`;

                  return (
                    <>
                      <path d={areaPath} fill="url(#wastageAreaGradient)" />
                      <path 
                        d={linePath} 
                        fill="none" 
                        stroke="#f43f5e" 
                        strokeWidth="2.5" 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                      />

                      {chartPoints.map((pt, idx) => (
                        <g key={idx}>
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r="15"
                            fill="transparent"
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredPoint({ ...pt, index: idx })}
                            onMouseLeave={() => setHoveredPoint(null)}
                          />
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={hoveredPoint?.index === idx ? "5" : "3.5"}
                            fill={hoveredPoint?.index === idx ? "#f43f5e" : "#ffffff"}
                            stroke="#f43f5e"
                            strokeWidth={hoveredPoint?.index === idx ? "2.5" : "1.5"}
                            className="pointer-events-none transition-all duration-150"
                          />
                        </g>
                      ))}

                      {chartPoints.map((pt, idx) => {
                        const dateObj = new Date(pt.date);
                        const label = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        return (
                          <text
                            key={idx}
                            x={pt.x}
                            y={160}
                            textAnchor="middle"
                            className="text-[10px] font-bold text-slate-400 fill-current font-sans"
                          >
                            {label}
                          </text>
                        );
                      })}
                    </>
                  );
                })()}
              </svg>

              {/* Tooltip */}
              {hoveredPoint && (
                <div
                  className="absolute bg-slate-900/95 backdrop-blur-md text-white rounded-xl p-2.5 shadow-xl border border-slate-700 pointer-events-none text-xs flex flex-col space-y-0.5 transition-all duration-75 z-10"
                  style={{
                    left: `${(hoveredPoint.x / 600) * 100}%`,
                    top: `${(hoveredPoint.y / 180) * 100 - 5}%`,
                    transform: 'translate(-50%, -100%)'
                  }}
                >
                  <span className="font-semibold text-slate-400">
                    {new Date(hoveredPoint.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  <span className="font-extrabold text-white text-sm">
                    Loss: ৳{parseFloat(hoveredPoint.val).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })()}
 
      {/* Filters Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Search by product, SKU, or reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-rose-500"
          />
          <svg className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
 
        {/* Date Filters */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600">
          {isSuperAdmin && (
            <div className="flex items-center space-x-2 mr-4">
              <span className="text-slate-500">Tenant Shop:</span>
              <select
                value={selectedShopId}
                onChange={(e) => setSelectedShopId(e.target.value)}
                className="border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-rose-500 outline-none text-slate-700 font-medium"
              >
                <option value="">All Shops (Consolidated)</option>
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <span>From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-rose-500 outline-none"
            />
          </div>
          <div className="flex items-center space-x-2">
            <span>To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-rose-500 outline-none"
            />
          </div>
          {(startDate || endDate || (isSuperAdmin && selectedShopId)) && (
            <button
              onClick={() => { setStartDate(''); setEndDate(''); setSelectedShopId(''); }}
              className="text-rose-600 hover:text-rose-800 font-bold ml-2 underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>
 
      {/* Ledger Table Container */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                <th className="p-4 pl-6">Adjustment Date</th>
                {isSuperAdmin && <th className="p-4">Shop</th>}
                <th className="p-4">Product details</th>
                <th className="p-4">Qty adjusted</th>
                <th className="p-4">Estimated Loss</th>
                <th className="p-4">Reason</th>
                <th className="p-4">Notes</th>
                {!isSuperAdmin && <th className="p-4 text-center pr-6">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 8 : 7} className="p-12 text-center">
                    <div className="flex justify-center items-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-rose-600"></div>
                    </div>
                  </td>
                </tr>
              ) : filteredWastages.length === 0 ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 8 : 7} className="p-12 text-center text-slate-400">
                    No stock adjustments matching search filters or date ranges.
                  </td>
                </tr>
              ) : (
                currentWastages.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 pl-6 font-semibold text-slate-700">{formatDate(w.adjusted_at)}</td>
                    {isSuperAdmin && <td className="p-4 font-semibold text-slate-700">{w.shop_name}</td>}
                    <td className="p-4">
                      <div className="font-bold text-slate-800">{w.product_name}</div>
                      <div className="text-xs text-slate-400 font-mono">SKU: {w.product_sku}</div>
                    </td>
                    <td className="p-4 font-bold text-slate-800">-{w.quantity}</td>
                    <td className="p-4 font-black text-rose-600">{formatCurrency(w.cost_loss)}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                        w.reason === 'Damaged' ? 'bg-amber-100 text-amber-800' :
                        w.reason === 'Expired' ? 'bg-orange-100 text-orange-800' :
                        w.reason === 'Stolen' ? 'bg-slate-100 text-slate-700' :
                        w.reason === 'Spillage' ? 'bg-red-100 text-red-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {w.reason}
                      </span>
                    </td>
                    <td className="p-4 text-slate-500 italic max-w-xs truncate">{w.notes || '-'}</td>
                    {!isSuperAdmin && (
                      <td className="p-4 text-center pr-6">
                        <button
                          onClick={() => handleDelete(w.id)}
                          className="text-rose-600 hover:text-rose-900 font-semibold text-xs border border-rose-100 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg transition-colors"
                        >
                          Delete & Restore
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">
            Showing <span className="text-slate-800">{indexOfFirstItem + 1}</span> to <span className="text-slate-800">{Math.min(indexOfLastItem, filteredWastages.length)}</span> of <span className="text-slate-800">{filteredWastages.length}</span> entries
          </div>
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 bg-white hover:bg-slate-50 disabled:hover:bg-white disabled:opacity-50 text-slate-600 border border-slate-200 rounded-xl text-xs font-semibold transition-colors disabled:cursor-not-allowed"
            >
              Previous
            </button>
            
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-9 h-9 rounded-xl text-xs font-bold transition-all ${
                  currentPage === page
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200'
                }`}
              >
                {page}
              </button>
            ))}

            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 bg-white hover:bg-slate-50 disabled:hover:bg-white disabled:opacity-50 text-slate-600 border border-slate-200 rounded-xl text-xs font-semibold transition-colors disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* --- RECORD STOCK ADJUSTMENT MODAL --- */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">Record Damage / Wastage</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleAddSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Select Product *</label>
                <select
                  name="product_id"
                  value={formData.product_id}
                  onChange={handleInputChange}
                  required
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-rose-500 outline-none bg-white text-slate-700"
                >
                  <option value="">-- Choose target product --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} (SKU: {p.sku}) | Stock: {p.stock_quantity}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    name="quantity"
                    value={formData.quantity}
                    onChange={handleInputChange}
                    required
                    placeholder="e.g. 5"
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-rose-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Adjustment Date *</label>
                  <input
                    type="date"
                    name="adjusted_at"
                    value={formData.adjusted_at}
                    onChange={handleInputChange}
                    required
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-rose-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Adjustment Reason *</label>
                <select
                  name="reason"
                  value={formData.reason}
                  onChange={handleInputChange}
                  required
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-rose-500 outline-none bg-white text-slate-700"
                >
                  <option value="Damaged">Damaged</option>
                  <option value="Expired">Expired</option>
                  <option value="Stolen">Stolen</option>
                  <option value="Spillage">Spillage</option>
                  <option value="Manual Adjustment">Manual Adjustment</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Optional Notes</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows="3"
                  placeholder="Reasoning details, reference log numbers..."
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-rose-500 outline-none bg-white"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex space-x-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-semibold transition-colors shadow"
                >
                  Confirm Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
