import React, { useState, useEffect } from 'react';

const API_BASE_URL = 'http://localhost:5000/api';

export default function HeldBills({ onResume = () => {}, onHeldBillsChange = () => {} }) {
  const [heldBills, setHeldBills] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [chartType, setChartType] = useState('due'); // 'due' or 'count'
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [error, setError] = useState(null);
  const [alert, setAlert] = useState(null);
  const [expandedBillId, setExpandedBillId] = useState(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  // Due Payment Modal State
  const [showPayDueModal, setShowPayDueModal] = useState(false);
  const [payDueBill, setPayDueBill] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [paySubmitting, setPaySubmitting] = useState(false);

  const fetchHeldBills = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/held-bills`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to retrieve held bills.');
      const data = await response.json();
      setHeldBills(data);
      onHeldBillsChange(data.filter(b => b.status === 'held').length);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHeldBills();
  }, []);

  const triggerAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 4000);
  };

  // 1. UPDATE STATUS
  const handleStatusChange = async (billId, newStatus) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/held-bills/${billId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'Failed to update status.');

      triggerAlert('success', `Status updated to ${newStatus}!`);
      
      // Update locally
      const updatedList = heldBills.map(bill => 
        bill.id === billId ? { ...bill, status: newStatus } : bill
      );
      setHeldBills(updatedList);
      onHeldBillsChange(updatedList.filter(b => b.status === 'held').length);
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  // 2. DISCARD/DELETE HELD BILL
  const handleDelete = async (billId) => {
    if (!window.confirm('Are you sure you want to discard this held bill?')) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/held-bills/${billId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'Failed to delete held bill.');

      triggerAlert('success', 'Held bill discarded successfully.');
      const updatedList = heldBills.filter(bill => bill.id !== billId);
      setHeldBills(updatedList);
      onHeldBillsChange(updatedList.filter(b => b.status === 'held').length);
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  // 3. COLLECT DUE PAYMENT
  const openPayDueModal = (bill) => {
    setPayDueBill(bill);
    setPayAmount(parseFloat(bill.due_amount).toFixed(2));
    setPayMethod('cash');
    setShowPayDueModal(true);
  };

  const handlePayDueSubmit = async (e) => {
    e.preventDefault();
    if (!payDueBill) return;

    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) {
      triggerAlert('error', 'Please enter a valid payment amount.');
      return;
    }

    setPaySubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/held-bills/${payDueBill.id}/pay-due`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          payment_amount: amount,
          payment_method: payMethod
        })
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'Failed to process due payment.');

      triggerAlert('success', resData.message);
      setShowPayDueModal(false);
      setPayDueBill(null);
      setPayAmount('');

      // Refresh all held bills data
      fetchHeldBills();
    } catch (err) {
      triggerAlert('error', err.message);
    } finally {
      setPaySubmitting(false);
    }
  };

  const exportHeldBillsToCSV = () => {
    if (filteredBills.length === 0) {
      triggerAlert('error', 'No bills to export in the current view.');
      return;
    }

    const headers = ['Held Bill ID', 'Date Held', 'Reference Note', 'Customer', 'Cashier', 'Items', 'Due Amount', 'Status'];

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '';
      let str = String(val);
      if (/[",\n\r]/.test(str)) {
        str = `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = filteredBills.map(bill => {
      let itemsList = [];
      try {
        itemsList = typeof bill.items === 'string' ? JSON.parse(bill.items) : bill.items;
      } catch (e) { /* ignore */ }
      const itemsString = itemsList.map(item => `${item.product_name || 'Item'} (x${item.quantity})`).join('; ');

      return [
        bill.id,
        `"${new Date(bill.created_at).toLocaleString()}"`,
        escapeCSV(bill.notes || ''),
        escapeCSV(bill.customer_name || 'Walk-in'),
        escapeCSV(bill.staff_name || 'N/A'),
        escapeCSV(itemsString),
        parseFloat(bill.due_amount || 0).toFixed(2),
        escapeCSV(bill.status)
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `held_bills_export_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    triggerAlert('success', 'Held bills exported to CSV successfully!');
  };
  // Filter and search computation
  const filteredBills = heldBills.filter(bill => {
    const matchesSearch = 
      (bill.notes && bill.notes.toLowerCase().includes(search.toLowerCase())) ||
      (bill.customer_name && bill.customer_name.toLowerCase().includes(search.toLowerCase())) ||
      (bill.customer_phone && bill.customer_phone.includes(search)) ||
      (bill.staff_name && bill.staff_name.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || bill.status === statusFilter;

    return matchesSearch && matchesStatus;
  });
  const totalPages = Math.ceil(filteredBills.length / itemsPerPage);
  const indexOfLastBill = currentPage * itemsPerPage;
  const indexOfFirstBill = indexOfLastBill - itemsPerPage;
  const currentBills = filteredBills.slice(indexOfFirstBill, indexOfLastBill);

  // Summary statistics
  const totalHeld = heldBills.filter(b => b.status === 'held').length;
  const totalPendingDue = heldBills
    .filter(b => b.status === 'held' && parseFloat(b.due_amount || 0) > 0)
    .reduce((sum, b) => sum + parseFloat(b.due_amount || 0), 0);
  const completedDueCount = heldBills.filter(b => b.status === 'completed').length;
  const totalDueBills = heldBills.filter(b => parseFloat(b.due_amount || 0) > 0 || b.notes?.startsWith('Due from Sale')).length;

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
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Held Bills</h2>
        <p className="text-sm text-slate-500">Manage suspended carts, collect due payments, and monitor bill status</p>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Held Bills */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center space-x-3">
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Held</p>
            <h3 className="text-xl font-extrabold text-slate-800">{totalHeld}</h3>
          </div>
        </div>

        {/* Total Due Bills */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center space-x-3">
          <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Due Bills</p>
            <h3 className="text-xl font-extrabold text-slate-800">{totalDueBills}</h3>
          </div>
        </div>

        {/* Pending Due Amount */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center space-x-3">
          <div className={`p-2.5 rounded-xl ${totalPendingDue > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pending Due</p>
            <h3 className={`text-xl font-extrabold ${totalPendingDue > 0 ? 'text-rose-600' : 'text-slate-800'}`}>৳{totalPendingDue.toFixed(2)}</h3>
          </div>
        </div>

        {/* Completed */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Completed</p>
            <h3 className="text-xl font-extrabold text-emerald-600">{completedDueCount}</h3>
          </div>
        </div>
      </div>

      {/* Dynamic Graph Chart */}
      {(() => {
        // Calculate dynamic trend data from the current filtered list
        const trendMap = {};
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          trendMap[dateStr] = { date: dateStr, due: 0, count: 0 };
        }

        filteredBills.forEach(bill => {
          const dateStr = new Date(bill.created_at).toISOString().split('T')[0];
          if (trendMap[dateStr]) {
            trendMap[dateStr].due += parseFloat(bill.due_amount || 0);
            trendMap[dateStr].count += 1;
          }
        });

        const chartData = Object.values(trendMap);
        const chartValues = chartData.map(d => chartType === 'due' ? d.due : d.count);
        const maxVal = Math.max(...chartValues, 5);

        return (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs relative">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Held Bills Activity</h3>
                <p className="text-xs text-slate-500">Real-time breakdown of suspended transactions and outstanding balances</p>
              </div>
              
              <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200/60 self-end sm:self-auto">
                <button
                  onClick={() => setChartType('due')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    chartType === 'due'
                      ? 'bg-white text-indigo-650 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Due Amount (৳)
                </button>
                <button
                  onClick={() => setChartType('count')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    chartType === 'count'
                      ? 'bg-white text-indigo-650 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Carts Volume
                </button>
              </div>
            </div>

            <div className="relative w-full h-[180px]">
              {/* SVG Plot */}
              <svg 
                viewBox="0 0 600 180" 
                className="w-full h-full overflow-visible"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="heldAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#818cf8" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#818cf8" stopOpacity="0.0" />
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
                        {chartType === 'due' ? `৳${Math.round(labelVal)}` : Math.round(labelVal)}
                      </text>
                    </g>
                  );
                })}

                {/* Path Logic */}
                {(() => {
                  const chartPoints = chartData.map((d, index) => {
                    const val = chartType === 'due' ? d.due : d.count;
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
                      <path d={areaPath} fill="url(#heldAreaGradient)" />
                      <path 
                        d={linePath} 
                        fill="none" 
                        stroke="#6366f1" 
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
                            fill={hoveredPoint?.index === idx ? "#6366f1" : "#ffffff"}
                            stroke="#6366f1"
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
                    {chartType === 'due' ? `Outstanding: ৳${parseFloat(hoveredPoint.val).toFixed(2)}` : `Held Bills: ${hoveredPoint.val}`}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search by note, customer, phone, or cashier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <svg className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Status Filter Selector */}
        <div className="flex items-center space-x-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl p-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">All Statuses</option>
            <option value="held">Held (Active)</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            onClick={exportHeldBillsToCSV}
            className="bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2 px-4 border border-slate-200 rounded-xl text-xs shadow-xs transition-colors flex items-center space-x-2"
          >
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Held Bills Table Container */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                <th className="p-4 w-8"></th>
                <th className="p-4">Hold ID / Time</th>
                <th className="p-4">Notes / Reference</th>
                <th className="p-4">Cashier</th>
                <th className="p-4">Customer Info</th>
                <th className="p-4 text-center">Due Amount</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan="8" className="p-12 text-center">
                    <div className="flex justify-center items-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600"></div>
                    </div>
                  </td>
                </tr>
              ) : filteredBills.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-12 text-center text-slate-400">
                    No held bills matched current filters.
                  </td>
                </tr>
              ) : (
                currentBills.map((bill) => {
                  let itemsList = [];
                  try {
                    itemsList = typeof bill.items === 'string' ? JSON.parse(bill.items) : bill.items;
                  } catch (e) {
                    itemsList = [];
                  }
                  const totalItemsQty = itemsList.reduce((sum, item) => sum + item.quantity, 0);
                  const formattedDate = new Date(bill.created_at).toLocaleString();
                  const dueAmount = parseFloat(bill.due_amount || 0);
                  const isExpanded = expandedBillId === bill.id;

                  return (
                    <React.Fragment key={bill.id}>
                      <tr className={`hover:bg-slate-50/50 transition-colors cursor-pointer ${isExpanded ? 'bg-indigo-50/30' : ''}`}>
                        {/* Expand toggle */}
                        <td className="p-4" onClick={() => setExpandedBillId(isExpanded ? null : bill.id)}>
                          <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                          </svg>
                        </td>
                        <td className="p-4" onClick={() => setExpandedBillId(isExpanded ? null : bill.id)}>
                          <span className="font-mono text-xs font-bold text-slate-500">#{bill.id}</span>
                          <div className="text-[10px] text-slate-400 mt-0.5">{formattedDate}</div>
                        </td>
                        <td className="p-4" onClick={() => setExpandedBillId(isExpanded ? null : bill.id)}>
                          <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-0.5 rounded-lg border border-amber-200">
                            {bill.notes || 'N/A'}
                          </span>
                        </td>
                        <td className="p-4 font-semibold text-slate-700">{bill.staff_name}</td>
                        <td className="p-4">
                          {bill.customer_name ? (
                            <div>
                              <div className="font-semibold text-slate-800">{bill.customer_name}</div>
                              {bill.customer_phone && <div className="text-xs text-slate-500">{bill.customer_phone}</div>}
                            </div>
                          ) : (
                            <span className="text-slate-400">Walk-in</span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          {dueAmount > 0 ? (
                            <span className="bg-rose-50 text-rose-700 text-xs font-bold px-2.5 py-1 rounded-lg border border-rose-100 whitespace-nowrap">
                              ৳{dueAmount.toFixed(2)}
                            </span>
                          ) : totalItemsQty > 0 ? (
                            <span className="bg-slate-100 text-slate-700 text-xs font-bold px-2 py-0.5 rounded">
                              {totalItemsQty} items
                            </span>
                          ) : (
                            <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-lg border border-emerald-100">
                              Paid ✓
                        </span>
                          )}
                        </td>
                        <td className="p-4">
                          <select
                            value={bill.status}
                            onChange={(e) => handleStatusChange(bill.id, e.target.value)}
                            className={`text-xs font-bold rounded-lg border p-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                              bill.status === 'held'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : bill.status === 'completed'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            <option value="held">Held (Active)</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center space-x-1.5">
                            {/* Collect Due button */}
                            {dueAmount > 0 && bill.status === 'held' && (
                              <button
                                onClick={() => openPayDueModal(bill)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-1.5 px-3 rounded-lg text-xs transition-colors shadow-sm inline-flex items-center space-x-1"
                                title="Collect Due Payment"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>Collect Due</span>
                              </button>
                            )}
                            {/* Resume button */}
                            <button
                              onClick={() => onResume(bill)}
                              disabled={bill.status !== 'held' || itemsList.length === 0}
                              className="bg-slate-600 disabled:bg-slate-150 disabled:text-slate-400 text-white font-semibold py-1.5 px-3 rounded-lg text-xs transition-colors shadow-sm inline-flex items-center space-x-1"
                              title={itemsList.length === 0 ? "Cannot resume a due payment tracker" : "Resume checkout cart"}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.2" />
                              </svg>
                              <span>Resume</span>
                            </button>
                            {/* Delete button */}
                            <button
                              onClick={() => handleDelete(bill.id)}
                              className="text-rose-600 hover:text-rose-900 border border-rose-100 hover:bg-rose-50 p-1.5 rounded-lg transition-colors inline-flex items-center"
                              title="Discard Held Bill"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Row Detail */}
                      {isExpanded && (
                        <tr>
                          <td colSpan="8" className="p-0">
                            <div className="bg-slate-50/80 border-t border-slate-100 px-8 py-5 space-y-4 animate-in">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Left: Items List */}
                                <div>
                                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Cart Items</h4>
                                  {itemsList.length === 0 ? (
                                    <p className="text-xs text-slate-400 italic">No cart items (due payment tracker only)</p>
                                  ) : (
                                    <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                                      {itemsList.map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-center px-4 py-2.5 text-xs">
                                          <div>
                                            <div className="font-semibold text-slate-700">{item.name}</div>
                                            <div className="text-[10px] text-slate-400 mt-0.5">SKU: {item.sku} | Price: ৳{parseFloat(item.price || 0).toFixed(2)}</div>
                                          </div>
                                          <div className="text-right">
                                            <span className="font-bold text-slate-500">×{item.quantity}</span>
                                            <span className="font-extrabold text-slate-800 ml-3">৳{((item.price || 0) * item.quantity).toFixed(2)}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Right: Bill Details */}
                                <div className="space-y-3">
                                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Bill Details</h4>
                                  <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-2 text-xs">
                                    <div className="flex justify-between">
                                      <span className="text-slate-500">Hold ID:</span>
                                      <span className="font-semibold text-slate-700">#{bill.id}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-slate-500">Created:</span>
                                      <span className="font-semibold text-slate-700">{formattedDate}</span>
                                    </div>
                                    {bill.updated_at && (
                                      <div className="flex justify-between">
                                        <span className="text-slate-500">Last Updated:</span>
                                        <span className="font-semibold text-slate-700">{new Date(bill.updated_at).toLocaleString()}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between">
                                      <span className="text-slate-500">Cashier:</span>
                                      <span className="font-semibold text-slate-700">{bill.staff_name}</span>
                                    </div>
                                    {bill.discount_percent > 0 && (
                                      <div className="flex justify-between">
                                        <span className="text-slate-500">Discount:</span>
                                        <span className="font-semibold text-slate-700">{bill.discount_percent}%</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between border-t border-slate-100 pt-2">
                                      <span className="text-slate-500 font-medium">Due Amount:</span>
                                      <span className={`font-bold ${dueAmount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        {dueAmount > 0 ? `৳${dueAmount.toFixed(2)}` : 'Fully Paid ✓'}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Customer Details */}
                                  {bill.customer_name && (
                                    <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-1.5 text-xs">
                                      <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Customer</h5>
                                      <div className="font-semibold text-slate-800">{bill.customer_name}</div>
                                      {bill.customer_phone && <div className="text-slate-500">📞 {bill.customer_phone}</div>}
                                      {bill.customer_address && <div className="text-slate-500 truncate">📍 {bill.customer_address}</div>}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">
            Showing <span className="text-slate-800">{indexOfFirstBill + 1}</span> to <span className="text-slate-800">{Math.min(indexOfLastBill, filteredBills.length)}</span> of <span className="text-slate-800">{filteredBills.length}</span> entries
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
                    ? 'bg-slate-600 text-white shadow-xs'
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

      {/* --- DUE PAYMENT MODAL --- */}
      {showPayDueModal && payDueBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Collect Due Payment</h3>
                <p className="text-xs text-slate-400 mt-0.5">Held Bill #{payDueBill.id}</p>
              </div>
              <button onClick={() => { setShowPayDueModal(false); setPayDueBill(null); }} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Customer Info */}
            <div className="mt-4 bg-slate-50 rounded-xl p-3 space-y-1.5 text-xs border border-slate-100">
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <span className="font-semibold text-slate-800">{payDueBill.customer_name || 'Unknown'}</span>
              </div>
              {payDueBill.customer_phone && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Phone:</span>
                  <span className="font-semibold text-slate-800">{payDueBill.customer_phone}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Reference:</span>
                <span className="font-semibold text-amber-700">{payDueBill.notes || 'N/A'}</span>
              </div>
            </div>

            {/* Outstanding Amount Display */}
            <div className="mt-4 bg-rose-50 border border-rose-200 rounded-xl p-4 text-center">
              <p className="text-xs font-bold text-rose-500 uppercase tracking-wider">Outstanding Due Amount</p>
              <p className="text-3xl font-extrabold text-rose-700 mt-1">৳{parseFloat(payDueBill.due_amount).toFixed(2)}</p>
            </div>

            <form onSubmit={handlePayDueSubmit} className="mt-5 space-y-4">
              {/* Payment Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Payment Amount (৳)
                </label>
                <div className="flex space-x-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={parseFloat(payDueBill.due_amount)}
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    required
                    placeholder="0.00"
                    className="flex-1 border border-slate-200 rounded-lg p-2.5 text-sm font-semibold focus:ring-1 focus:ring-emerald-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setPayAmount(parseFloat(payDueBill.due_amount).toFixed(2))}
                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold py-2 px-3 rounded-lg text-xs transition-colors whitespace-nowrap"
                  >
                    Full Amount
                  </button>
                </div>
                {parseFloat(payAmount) > 0 && parseFloat(payAmount) < parseFloat(payDueBill.due_amount) && (
                  <p className="mt-1.5 text-[10px] text-amber-600 font-medium">
                    Partial payment — remaining: ৳{(parseFloat(payDueBill.due_amount) - parseFloat(payAmount)).toFixed(2)}
                  </p>
                )}
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['cash', 'card', 'mobile_pay'].map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPayMethod(method)}
                      className={`py-2 px-2 rounded-lg text-xs font-semibold border text-center transition-all ${
                        payMethod === method
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {method === 'mobile_pay' ? 'Mobile' : method.charAt(0).toUpperCase() + method.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-100 flex space-x-3 justify-end">
                <button
                  type="button"
                  onClick={() => { setShowPayDueModal(false); setPayDueBill(null); }}
                  className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paySubmitting || !parseFloat(payAmount) || parseFloat(payAmount) <= 0}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl text-sm font-semibold transition-colors shadow flex items-center space-x-1.5"
                >
                  {paySubmitting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Collect ৳{parseFloat(payAmount || 0).toFixed(2)}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
