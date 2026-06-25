import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const API_BASE_URL = 'http://localhost:5000/api';

export default function ManualOrders() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [alert, setAlert] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');

  // Modal States
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showPayDueModal, setShowPayDueModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [viewingOrder, setViewingOrder] = useState(null);
  const [payingOrder, setPayingOrder] = useState(null);

  // Due Payment Form state
  const [payDueAmount, setPayDueAmount] = useState('');
  const [payDueMethod, setPayDueMethod] = useState('cash');
  const [payDueRef, setPayDueRef] = useState('');
  const [payDueNote, setPayDueNote] = useState('');
  const [payDueSubmitting, setPayDueSubmitting] = useState(false);

  // Receipt modal state (reuses checkout receipt rendering system)
  const [receipt, setReceipt] = useState(null);
  const [printMode, setPrintMode] = useState('thermal'); // 'thermal' | 'regular'

  // Current user / Shop details
  const [currentUser, setCurrentUser] = useState(null);
  const [shopDetails, setShopDetails] = useState({ name: '', email: '', phone: '', address: '', tax_rate: 10.00 });

  // Active product search dropdown row index
  const [activeDropdownIndex, setActiveDropdownIndex] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    salesman_name: '',
    customer_name: '',
    customer_phone: '',
    customer_address: '',
    payment_method: 'cash',
    discount: 0,
    tax: 0,
    notes: '',
    items: [] // { product_id, quantity, unit_price, max_stock, searchTerm }
  });

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.product-search-container')) {
        setActiveDropdownIndex(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  useEffect(() => {
    // Load current user
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const u = JSON.parse(stored);
        setCurrentUser(u);
        setShopDetails({
          name: u.shop_name || 'My Shop',
          email: u.shop_email || '',
          phone: u.shop_phone || '',
          address: u.shop_address || '',
          tax_rate: 10.00 // Default, will update if shops API works
        });
      }
    } catch (e) {
      console.error(e);
    }

    fetchOrders();
    fetchProducts();
    fetchShopInfo();
  }, []);

  const triggerAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 4000);
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/manual-orders`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to load manual orders catalog.');
      const data = await response.json();
      setOrders(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/products`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setProducts(await response.json());
      }
    } catch (e) {
      console.error('Failed to fetch product catalog', e);
    }
  };

  const fetchShopInfo = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/shops/my-shop`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const shop = await response.json();
        setShopDetails(prev => ({
          ...prev,
          name: shop.name || prev.name,
          email: shop.email || prev.email,
          phone: shop.phone || prev.phone,
          address: shop.address || prev.address,
          tax_rate: parseFloat(shop.tax_rate) !== undefined ? parseFloat(shop.tax_rate) : 10.00
        }));
      }
    } catch (e) {
      console.error('Failed to fetch shop info', e);
    }
  };

  // Calculations
  const calculateTotals = (items, discountPercent) => {
    const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.unit_price || 0) * parseInt(item.quantity || 0)), 0);
    const discountAmount = parseFloat(((subtotal * parseFloat(discountPercent || 0)) / 100).toFixed(2));
    const taxAmount = parseFloat(((subtotal * shopDetails.tax_rate) / 100).toFixed(2));
    const finalAmount = Math.max(0, subtotal - discountAmount + taxAmount);
    return { subtotal, discountAmount, tax: taxAmount, finalAmount };
  };

  const getFilteredProducts = (term) => {
    if (!term) return products;
    const lowerTerm = term.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(lowerTerm) ||
      (p.sku && p.sku.toLowerCase().includes(lowerTerm))
    );
  };

  // Form handlers
  const openNewOrder = () => {
    setEditingOrder(null);
    setFormData({
      salesman_name: '',
      customer_name: '',
      customer_phone: '',
      customer_address: '',
      payment_method: 'cash',
      discount: 0,
      tax: 0,
      notes: '',
      items: [{ product_id: '', quantity: 1, unit_price: 0, max_stock: 0, searchTerm: '' }]
    });
    setShowFormModal(true);
  };

  const openEditOrder = async (order) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/manual-orders/${order.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to retrieve order details.');
      const detail = await response.json();

      const subtotal = detail.items.reduce((sum, item) => sum + (parseFloat(item.unit_price || 0) * parseInt(item.quantity || 0)), 0);
      const discountPercent = subtotal > 0 ? parseFloat(((parseFloat(detail.discount) / subtotal) * 100).toFixed(2)) : 0;

      setEditingOrder(detail);
      setFormData({
        salesman_name: detail.salesman_name,
        customer_name: detail.customer_name || '',
        customer_phone: detail.customer_phone || '',
        customer_address: detail.customer_address || '',
        payment_method: detail.payment_method,
        discount: discountPercent,
        tax: parseFloat(detail.tax) || 0,
        notes: detail.notes || '',
        items: detail.items.map(item => {
          const prod = products.find(p => p.id === item.product_id);
          return {
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: parseFloat(item.unit_price),
            max_stock: prod ? prod.stock_quantity : item.quantity, // fallback
            searchTerm: prod ? prod.name : ''
          };
        })
      });
      setShowFormModal(true);
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      // Recalculate tax
      if (name === 'discount') {
        const { tax } = calculateTotals(prev.items, value);
        updated.tax = tax;
      }
      return updated;
    });
  };

  const handleItemChange = (index, field, value) => {
    setFormData(prev => {
      const newItems = [...prev.items];
      const item = { ...newItems[index] };

      if (field === 'quantity') {
        item.quantity = Math.max(1, parseInt(value) || 1);
      } else if (field === 'unit_price') {
        item.unit_price = Math.max(0, parseFloat(value) || 0);
      }

      newItems[index] = item;
      const { tax } = calculateTotals(newItems, prev.discount);
      return {
        ...prev,
        items: newItems,
        tax
      };
    });
  };

  const handleItemSearchChange = (index, value) => {
    setFormData(prev => {
      const newItems = [...prev.items];
      newItems[index] = {
        ...newItems[index],
        searchTerm: value
      };
      return {
        ...prev,
        items: newItems
      };
    });
  };

  const handleItemSelect = (index, selectedProd) => {
    setFormData(prev => {
      const newItems = [...prev.items];
      const item = { ...newItems[index] };

      if (selectedProd) {
        item.product_id = selectedProd.id;
        item.unit_price = parseFloat(selectedProd.price);
        item.max_stock = selectedProd.stock_quantity;
        item.searchTerm = selectedProd.name;
      } else {
        item.product_id = '';
        item.unit_price = 0;
        item.max_stock = 0;
        item.searchTerm = '';
      }

      newItems[index] = item;
      const { tax } = calculateTotals(newItems, prev.discount);
      return {
        ...prev,
        items: newItems,
        tax
      };
    });
  };

  const addFormItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { product_id: '', quantity: 1, unit_price: 0, max_stock: 0, searchTerm: '' }]
    }));
  };

  const removeFormItem = (index) => {
    setFormData(prev => {
      const newItems = prev.items.filter((_, idx) => idx !== index);
      const { tax } = calculateTotals(newItems, prev.discount);
      return {
        ...prev,
        items: newItems.length === 0 ? [{ product_id: '', quantity: 1, unit_price: 0, max_stock: 0, searchTerm: '' }] : newItems,
        tax
      };
    });
  };

  const handleFormSubmit = async (e, confirmImmediately = false) => {
    e.preventDefault();

    if (!formData.salesman_name) {
      triggerAlert('error', 'Salesman name is required.');
      return;
    }

    if (formData.payment_method === 'credit' && !formData.customer_name) {
      triggerAlert('error', 'Customer Name is required for Credit Sales.');
      return;
    }

    const filteredItems = formData.items.filter(item => item.product_id !== '');
    if (filteredItems.length === 0) {
      triggerAlert('error', 'Please add at least one product to the order.');
      return;
    }

    // Validate quantities against stock
    for (const item of filteredItems) {
      const prod = products.find(p => p.id === item.product_id);
      if (prod && prod.stock_quantity < item.quantity) {
        triggerAlert('error', `Insufficient stock for product "${prod.name}". Available: ${prod.stock_quantity}.`);
        return;
      }
    }

    try {
      const token = localStorage.getItem('token');
      const { discountAmount } = calculateTotals(filteredItems, formData.discount);
      const payload = {
        salesman_name: formData.salesman_name,
        customer_name: formData.customer_name || null,
        customer_phone: formData.customer_phone || null,
        customer_address: formData.customer_address || null,
        payment_method: formData.payment_method,
        discount: discountAmount,
        tax: parseFloat(formData.tax) || 0,
        notes: formData.notes,
        items: filteredItems
      };

      let orderId = editingOrder ? editingOrder.id : null;
      let url = `${API_BASE_URL}/manual-orders`;
      let method = 'POST';

      if (editingOrder) {
        url += `/${editingOrder.id}`;
        method = 'PUT';
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'Failed to save manual order.');

      if (!editingOrder) {
        orderId = resData.order_id;
      }

      setShowFormModal(false);
      triggerAlert('success', editingOrder ? 'Manual order updated successfully!' : 'Manual order drafted successfully!');

      if (confirmImmediately && orderId) {
        await handleConfirmOrder(orderId);
      } else {
        fetchOrders();
        fetchProducts(); // refresh stock numbers
      }
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const handleConfirmOrder = async (orderId) => {
    if (!window.confirm('Are you sure you want to confirm this order? This will deduct stock, log the sale, auto-register the customer profile (if not exists), and generate the invoice.')) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/manual-orders/${orderId}/confirm`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Failed to confirm order.');

      triggerAlert('success', 'Order confirmed and invoice generated successfully!');
      fetchOrders();
      fetchProducts(); // refresh stock details

      // Load invoice modal details
      await loadInvoiceDetails(data.sale_id);
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const handleDeleteOrder = async (orderId) => {
    if (!window.confirm('Are you sure you want to delete this manual sales order draft?')) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/manual-orders/${orderId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Failed to delete order.');

      triggerAlert('success', 'Manual order draft deleted successfully.');
      fetchOrders();
      fetchProducts();
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const loadInvoiceDetails = async (saleId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/sales/${saleId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to retrieve sale details.');
      const sale = await response.json();

      // Format receipt object
      const formattedReceipt = {
        sale_id: sale.id,
        created_at: new Date(sale.created_at).toLocaleString(),
        customer_name: sale.customer_name || 'Walk-in Customer',
        customer_phone: sale.customer_phone || '',
        customer_address: sale.customer_address || '',
        staff_name: sale.staff_name || 'System Admin',
        shop_name: sale.shop_name || shopDetails.name,
        shop_address: sale.shop_address || shopDetails.address,
        shop_phone: sale.shop_phone || shopDetails.phone,
        shop_email: sale.shop_email || shopDetails.email,
        payment_method: sale.payment_method,
        subtotal: parseFloat(sale.total_amount),
        discount: parseFloat(sale.discount),
        tax: parseFloat(sale.tax),
        final_amount: parseFloat(sale.final_amount),
        paid_amount: parseFloat(sale.paid_amount),
        due_amount: parseFloat(sale.due_amount),
        items: sale.items
      };

      setReceipt(formattedReceipt);
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const openDetails = async (order) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/manual-orders/${order.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch details.');
      const data = await response.json();
      setViewingOrder(data);
      setShowDetailsModal(true);
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const handleAddAmount = (addValue, maxDue) => {
    const currentVal = parseFloat(payDueAmount) || 0;
    const maxVal = parseFloat(maxDue);
    const newVal = Math.min(currentVal + addValue, maxVal);
    setPayDueAmount(newVal.toFixed(2));
  };

  const openPayDueModal = (order) => {
    setPayingOrder(order);
    setPayDueAmount(parseFloat(order.current_sale_due || 0).toFixed(2));
    setPayDueMethod('cash');
    setPayDueRef('');
    setPayDueNote('');
    setShowPayDueModal(true);
  };

  const handlePayDueSubmit = async (e) => {
    e.preventDefault();
    if (!payingOrder) return;

    const amount = parseFloat(payDueAmount);
    if (!amount || amount <= 0) {
      triggerAlert('error', 'Please enter a valid payment amount.');
      return;
    }

    if (amount > parseFloat(payingOrder.current_sale_due)) {
      triggerAlert('error', 'Payment amount cannot exceed the remaining due amount.');
      return;
    }

    setPayDueSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/manual-orders/sales/${payingOrder.sale_id}/pay-due`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          payment_amount: amount,
          payment_method: payDueMethod,
          transaction_reference: payDueRef,
          note: payDueNote
        })
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'Failed to record payment.');

      triggerAlert('success', `Payment of ৳${amount.toFixed(2)} collected successfully!`);
      setShowPayDueModal(false);
      setPayingOrder(null);
      fetchOrders();
    } catch (err) {
      triggerAlert('error', err.message);
    } finally {
      setPayDueSubmitting(false);
    }
  };

  const handlePrintReceipt = (mode) => {
    setPrintMode(mode);
    document.body.classList.add(`print-mode-${mode}`);
    window.print();
    setTimeout(() => {
      document.body.classList.remove(`print-mode-${mode}`);
    }, 500);
  };

  const exportOrdersToCSV = () => {
    if (searchedOrders.length === 0) {
      triggerAlert('error', 'No orders to export in the current view.');
      return;
    }

    const headers = ['Order ID', 'Date', 'Salesman', 'Customer Name', 'Customer Phone', 'Payment Method', 'Status', 'Total Amount', 'Due Amount'];

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '';
      let str = String(val);
      if (/[",\n\r]/.test(str)) {
        str = `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = searchedOrders.map(order => {
      return [
        order.id,
        `"${new Date(order.created_at).toLocaleString()}"`,
        escapeCSV(order.salesman_name),
        escapeCSV(order.customer_name || 'Walk-in'),
        escapeCSV(order.customer_phone || ''),
        escapeCSV(order.payment_method),
        escapeCSV(order.status),
        parseFloat(order.sale_final_amount || 0).toFixed(2),
        parseFloat(order.current_sale_due || 0).toFixed(2)
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `manual_orders_export_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    triggerAlert('success', 'Manual orders exported to CSV successfully!');
  };

  // Filter orders by search query
  const searchedOrders = orders.filter(order => {
    return (
      order.salesman_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.customer_name && order.customer_name.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  // Separate Cash vs Credit orders
  const cashOrders = searchedOrders.filter(order => order.payment_method === 'cash');
  const creditOrders = searchedOrders.filter(order => order.payment_method === 'credit');

  const totals = calculateTotals(formData.items, formData.discount);

  return (
    <div className="space-y-6">
      {alert && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg flex items-center transition-all ${alert.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
          }`}>
          <span className="text-sm font-semibold">{alert.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Manual Sales Order Entry</h2>
          <p className="text-sm text-slate-500">Record and invoice sales collected manually by salesmen</p>
        </div>
        <button
          onClick={openNewOrder}
          className="bg-slate-600 hover:bg-indigo-750 text-white font-semibold py-2.5 px-5 rounded-xl text-sm shadow transition-colors flex items-center space-x-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          <span>New Manual Order</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
        <div className="relative max-w-md">
          <input
            type="text"
            placeholder="Search by salesman or customer name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <svg className="absolute left-3 top-3 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button
          onClick={exportOrdersToCSV}
          className="bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2 px-4 border border-slate-200 rounded-xl text-xs shadow-xs transition-colors flex items-center space-x-2"
        >
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span>Export CSV</span>
        </button>
      </div>

      {/* Two Columns Layout (Vertical Stacking) */}
      <div className="flex flex-col gap-6">

        {/* COLUMN 1: CASH SALES */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4 shadow-xs">
          <div className="border-b border-slate-100 pb-3 flex justify-between items-center bg-slate-50/50 -mx-4 -mt-4 p-4 rounded-t-2xl">
            <div>
              <h3 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                <span>Cash Sales Column</span>
              </h3>
              <p className="text-xs text-slate-400">Cash drafts, orders, and confirmed transactions</p>
            </div>
            <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded border border-emerald-100">{cashOrders.length} Orders</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-450 font-bold uppercase tracking-wider">
                  <th className="pb-2">Details</th>
                  <th className="pb-2 text-center">Status</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-650">
                {loading ? (
                  <tr>
                    <td colSpan="3" className="py-8 text-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-indigo-600 mx-auto"></div>
                    </td>
                  </tr>
                ) : cashOrders.length === 0 ? (
                  <tr>
                    <td colSpan="3" className="py-8 text-center text-slate-400">No cash sales recorded.</td>
                  </tr>
                ) : (
                  cashOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50/40">
                      <td className="py-2.5 pr-2">
                        <div className="font-semibold text-slate-800">{order.salesman_name}</div>
                        <div className="text-[10px] text-slate-400">Buyer: {order.customer_name || 'Walk-in'}</div>
                        <div className="text-[9px] text-slate-400 mt-0.5">{new Date(order.created_at).toLocaleDateString()}</div>
                      </td>
                      <td className="py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold capitalize ${order.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-right space-x-1.5 whitespace-nowrap">
                        <button onClick={() => openDetails(order)} className="text-slate-500 hover:text-slate-900 border border-slate-200 px-2 py-1 rounded font-medium">View</button>
                        {order.status === 'pending' ? (
                          <>
                            <button onClick={() => openEditOrder(order)} className="text-indigo-600 hover:text-indigo-900 border border-indigo-100 px-2 py-1 rounded font-medium">Edit</button>
                            <button onClick={() => handleConfirmOrder(order.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2 py-1 rounded">Confirm</button>
                            <button onClick={() => handleDeleteOrder(order.id)} className="text-rose-600 hover:text-rose-900 border border-rose-100 px-2 py-1 rounded font-medium">Delete</button>
                          </>
                        ) : (
                          <button onClick={() => loadInvoiceDetails(order.sale_id)} className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-1 rounded font-bold">Receipt</button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* COLUMN 2: CREDIT SALES */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4 shadow-xs">
          <div className="border-b border-slate-100 pb-3 flex justify-between items-center bg-slate-50/50 -mx-4 -mt-4 p-4 rounded-t-2xl">
            <div>
              <h3 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></span>
                <span>Credit Sales Column (Standalone Ledger)</span>
              </h3>
              <p className="text-xs text-slate-400">Credit drafts and outstanding customer debt logs</p>
            </div>
            <span className="bg-amber-50 text-amber-700 text-xs font-bold px-2 py-0.5 rounded border border-amber-100">{creditOrders.length} Orders</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-450 font-bold uppercase tracking-wider">
                  <th className="pb-2">Details</th>
                  <th className="pb-2 text-center">Status / Dues</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-650">
                {loading ? (
                  <tr>
                    <td colSpan="3" className="py-8 text-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-indigo-600 mx-auto"></div>
                    </td>
                  </tr>
                ) : creditOrders.length === 0 ? (
                  <tr>
                    <td colSpan="3" className="py-8 text-center text-slate-400">No credit sales recorded.</td>
                  </tr>
                ) : (
                  creditOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50/40">
                      <td className="py-2.5 pr-2">
                        <div className="font-semibold text-slate-800">{order.salesman_name}</div>
                        <div className="text-[10px] text-slate-700 font-semibold">Buyer: {order.customer_name}</div>
                        {order.customer_phone && <div className="text-[9px] text-slate-450">Phone: {order.customer_phone}</div>}
                        <div className="text-[9px] text-slate-400 mt-0.5">{new Date(order.created_at).toLocaleDateString()}</div>
                      </td>
                      <td className="py-2.5 text-center">
                        <div className="flex flex-col items-center space-y-1">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold capitalize ${order.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                            {order.status}
                          </span>
                          {order.status === 'confirmed' && (
                            parseFloat(order.current_sale_due || 0) > 0 ? (
                              <span className="text-[9px] text-rose-500 font-extrabold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                                Due: ৳{parseFloat(order.current_sale_due).toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-[9px] text-emerald-600 font-extrabold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                Fully Paid
                              </span>
                            )
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 text-right space-x-1.5 whitespace-nowrap">
                        <button onClick={() => openDetails(order)} className="text-slate-500 hover:text-slate-900 border border-slate-200 px-2 py-1 rounded font-medium">View</button>
                        {order.status === 'pending' ? (
                          <>
                            <button onClick={() => openEditOrder(order)} className="text-indigo-660 hover:text-indigo-900 border border-indigo-100 px-2 py-1 rounded font-medium">Edit</button>
                            <button onClick={() => handleConfirmOrder(order.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2 py-1 rounded">Confirm</button>
                            <button onClick={() => handleDeleteOrder(order.id)} className="text-rose-600 hover:text-rose-900 border border-rose-100 px-2 py-1 rounded font-medium">Delete</button>
                          </>
                        ) : (
                          <>
                            {parseFloat(order.current_sale_due || 0) > 0 && (
                              <button onClick={() => openPayDueModal(order)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2 py-1 rounded shadow-sm">Collect Due</button>
                            )}
                            <button onClick={() => loadInvoiceDetails(order.sale_id)} className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-1 rounded font-bold">Receipt</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* FORM MODAL (ADD / EDIT) */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">{editingOrder ? 'Edit Sales Order Entry' : 'Manual Sales Order Entry'}</h3>
              <button onClick={() => setShowFormModal(false)} className="text-slate-400 hover:text-slate-650">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={(e) => handleFormSubmit(e, false)} className="mt-4 space-y-4 flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Salesman Name *</label>
                  <input
                    type="text"
                    name="salesman_name"
                    value={formData.salesman_name}
                    onChange={handleInputChange}
                    required
                    placeholder="Enter salesman name"
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Customer Name {formData.payment_method === 'credit' ? '*' : ''}</label>
                  <input
                    type="text"
                    name="customer_name"
                    value={formData.customer_name}
                    onChange={handleInputChange}
                    required={formData.payment_method === 'credit'}
                    placeholder="Walk-in Customer / Buyer"
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Customer Phone</label>
                  <input
                    type="text"
                    name="customer_phone"
                    value={formData.customer_phone}
                    onChange={handleInputChange}
                    placeholder="Phone number"
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Payment Method Basis *</label>
                  <select
                    name="payment_method"
                    value={formData.payment_method}
                    onChange={handleInputChange}
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="cash">Cash Sale (Paid immediately)</option>
                    <option value="credit">Credit Sale (Customer due balance)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Customer Address</label>
                  <input
                    type="text"
                    name="customer_address"
                    value={formData.customer_address}
                    onChange={handleInputChange}
                    placeholder="Physical address / Town"
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Notes / Shipping Details</label>
                  <input
                    type="text"
                    name="notes"
                    value={formData.notes}
                    onChange={handleInputChange}
                    placeholder="E.g. Delivery date, priority notes..."
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Items Section */}
              <div className="space-y-2">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <h4 className="text-sm font-bold text-slate-700">Order Items</h4>
                  <button
                    type="button"
                    onClick={addFormItem}
                    className="text-indigo-650 hover:text-indigo-800 text-xs font-bold flex items-center space-x-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Add Item</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {formData.items.map((item, idx) => (
                    <div key={idx} className="flex flex-col md:flex-row md:items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div className="flex-1 md:flex-[4] product-search-container relative min-w-[280px] md:min-w-[420px]">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Product</label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Search by product name or SKU..."
                            value={item.searchTerm || ''}
                            onChange={(e) => handleItemSearchChange(idx, e.target.value)}
                            onFocus={() => setActiveDropdownIndex(idx)}
                            className="w-64 border border-slate-200 rounded-lg p-2 text-xs bg-white outline-none focus:ring-1 focus:ring-indigo-500 pr-8"
                          />
                          {item.product_id && (
                            <button
                              type="button"
                              onClick={() => handleItemSelect(idx, null)}
                              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                              title="Clear selection"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                          {activeDropdownIndex === idx && (
                            <div className="absolute left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto w-full md:w-[600px]">
                              {getFilteredProducts(item.searchTerm || '').map(p => (
                                <div
                                  key={p.id}
                                  onClick={() => {
                                    handleItemSelect(idx, p);
                                    setActiveDropdownIndex(null);
                                  }}
                                  className="p-2.5 text-xs hover:bg-slate-100 cursor-pointer text-slate-700 flex justify-between items-center border-b border-slate-50 last:border-0"
                                >
                                  <div>
                                    <span className="font-semibold">{p.name}</span>
                                    <span className="text-slate-450 ml-1.5">(SKU: {p.sku})</span>
                                  </div>
                                  <span className="text-slate-500 font-medium text-[10px]">
                                    Stock: {p.stock_quantity} {p.unit || 'pcs'} | ৳{parseFloat(p.price).toFixed(2)}
                                  </span>
                                </div>
                              ))}
                              {getFilteredProducts(item.searchTerm || '').length === 0 && (
                                <div className="p-3 text-xs text-slate-400 text-center italic">No products found</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="w-full md:w-28">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Quantity</label>
                        <input
                          type="number"
                          value={item.quantity}
                          min="1"
                          onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      <div className="w-full md:w-36">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Unit Price (৳)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) => handleItemChange(idx, 'unit_price', e.target.value)}
                          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      <div className="w-full md:w-32 text-right">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Subtotal</span>
                        <span className="text-sm font-semibold text-slate-700">৳{(item.unit_price * item.quantity).toFixed(2)}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeFormItem(idx)}
                        className="text-rose-500 hover:text-rose-700 p-2 self-end md:self-center"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals Summary */}
              <div className="border-t border-slate-100 pt-4 flex flex-col md:flex-row justify-between gap-4">
                <div className="w-full md:w-1/3">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Discount (%)</label>
                  <input
                    type="number"
                    name="discount"
                    value={formData.discount}
                    min="0"
                    max="100"
                    onChange={handleInputChange}
                    placeholder="E.g. 5 for 5%"
                    className="w-full border border-slate-200 rounded-lg p-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="w-full md:w-80 bg-slate-50 border border-slate-100 p-4 rounded-xl space-y-2 text-sm">
                  <div className="flex justify-between text-slate-650">
                    <span>Subtotal:</span>
                    <span className="font-semibold text-slate-800">৳{totals.subtotal.toFixed(2)}</span>
                  </div>
                  {totals.discountAmount > 0 && (
                    <div className="flex justify-between text-rose-500">
                      <span>Discount ({formData.discount}%):</span>
                      <span>-৳{totals.discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-650">
                    <span>Tax ({shopDetails.tax_rate}%):</span>
                    <span>৳{totals.tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-2 text-base">
                    <span>Total Amount:</span>
                    <span>৳{totals.finalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-slate-150 flex flex-col sm:flex-row gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors order-last sm:order-first"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 border border-slate-350 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm transition-colors"
                >
                  Save as Draft (Pending)
                </button>
                <button
                  type="button"
                  onClick={(e) => handleFormSubmit(e, true)}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-colors shadow-md flex items-center justify-center space-x-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Confirm & Generate Invoice</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COLLECT DUE MODAL */}
      {showPayDueModal && payingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs transition-all duration-300">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl flex flex-col overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 flex justify-between items-center border-b border-slate-800">
              <h3 className="text-base font-bold text-white tracking-wide flex items-center space-x-2">
                <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>Collect Outstanding Due</span>
              </h3>
              <button 
                onClick={() => { setShowPayDueModal(false); setPayingOrder(null); }} 
                className="text-slate-400 hover:text-white bg-white/10 hover:bg-white/20 p-1.5 rounded-xl transition-all duration-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handlePayDueSubmit} className="p-6 space-y-5">
              {/* Customer Profile card */}
              <div className="flex justify-between items-center p-3.5 bg-slate-50 border border-slate-100 rounded-2xl">
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Customer Profile</p>
                  <p className="text-sm font-extrabold text-slate-800 mt-0.5">{payingOrder.customer_name || 'Walk-in Customer'}</p>
                </div>
                {payingOrder.customer_phone && (
                  <span className="text-[10px] font-mono bg-slate-200/50 px-2.5 py-1 rounded-lg text-slate-600 font-bold">
                    📞 {payingOrder.customer_phone}
                  </span>
                )}
              </div>

              {/* Financial Breakdown card */}
              <div className="grid grid-cols-3 gap-2 bg-gradient-to-br from-slate-50 to-slate-100/50 p-4 border border-slate-150 rounded-2xl text-center">
                <div className="border-r border-slate-200/60">
                  <p className="text-[9px] text-slate-450 font-bold uppercase tracking-wider">Total Bill</p>
                  <p className="text-xs font-bold text-slate-700 mt-1">৳{parseFloat(payingOrder.sale_final_amount || 0).toFixed(2)}</p>
                </div>
                <div className="border-r border-slate-200/60">
                  <p className="text-[9px] text-emerald-500 font-bold uppercase tracking-wider">Paid</p>
                  <p className="text-xs font-bold text-emerald-600 mt-1">৳{parseFloat(payingOrder.sale_paid_amount || 0).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-rose-500 font-bold uppercase tracking-wider">Remaining Due</p>
                  <p className="text-xs font-extrabold text-rose-600 mt-1 bg-rose-50 px-1 py-0.5 rounded border border-rose-100 inline-block">৳{parseFloat(payingOrder.current_sale_due || 0).toFixed(2)}</p>
                </div>
              </div>

              {/* Payment Method Selector (Interactive Chips) */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Payment Collection Method *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {/* Cash Chip */}
                  <button
                    type="button"
                    onClick={() => setPayDueMethod('cash')}
                    className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center space-y-1.5 transition-all duration-200 cursor-pointer ${
                      payDueMethod === 'cash'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700 font-bold shadow-xs scale-[1.02]'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 font-semibold'
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <span className="text-[11px]">Cash Pay</span>
                  </button>

                  {/* Card Chip */}
                  <button
                    type="button"
                    onClick={() => setPayDueMethod('card')}
                    className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center space-y-1.5 transition-all duration-200 cursor-pointer ${
                      payDueMethod === 'card'
                        ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold shadow-xs scale-[1.02]'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 font-semibold'
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    <span className="text-[11px]">Card Pay</span>
                  </button>

                  {/* Mobile Pay Chip */}
                  <button
                    type="button"
                    onClick={() => setPayDueMethod('mobile_pay')}
                    className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center space-y-1.5 transition-all duration-200 cursor-pointer ${
                      payDueMethod === 'mobile_pay'
                        ? 'bg-purple-50 border-purple-500 text-purple-700 font-bold shadow-xs scale-[1.02]'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 font-semibold'
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <span className="text-[11px]">Mobile Pay</span>
                  </button>

                  {/* Other Chip */}
                  <button
                    type="button"
                    onClick={() => setPayDueMethod('other')}
                    className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center space-y-1.5 transition-all duration-200 cursor-pointer ${
                      payDueMethod === 'other'
                        ? 'bg-slate-100 border-slate-350 text-slate-805 font-bold shadow-xs scale-[1.02]'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 font-semibold'
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                    </svg>
                    <span className="text-[11px]">Other Pay</span>
                  </button>
                </div>
              </div>

              {/* Payment Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Payment Amount (৳) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    value={payDueAmount}
                    onChange={(e) => setPayDueAmount(e.target.value)}
                    required
                    className={`w-full border rounded-xl p-3 text-sm font-semibold outline-none focus:ring-2 transition-all ${
                      parseFloat(payDueAmount) > parseFloat(payingOrder.current_sale_due)
                        ? 'border-rose-500 focus:ring-rose-250 bg-rose-50/20'
                        : 'border-slate-200 focus:ring-indigo-100 focus:border-indigo-500'
                    }`}
                    placeholder="0.00"
                  />
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <button 
                    type="button" 
                    onClick={() => setPayDueAmount(parseFloat(payingOrder.current_sale_due).toFixed(2))} 
                    className="px-2.5 py-1 text-[10px] font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-100 rounded-lg transition-colors cursor-pointer"
                  >
                    Full Amount
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setPayDueAmount((parseFloat(payingOrder.current_sale_due) / 2).toFixed(2))} 
                    className="px-2.5 py-1 text-[10px] font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-100 rounded-lg transition-colors cursor-pointer"
                  >
                    Half Amount
                  </button>
                  <button 
                    type="button" 
                    onClick={() => handleAddAmount(100, payingOrder.current_sale_due)} 
                    className="px-2 py-1 text-[10px] font-bold bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    +৳100
                  </button>
                  <button 
                    type="button" 
                    onClick={() => handleAddAmount(500, payingOrder.current_sale_due)} 
                    className="px-2 py-1 text-[10px] font-bold bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    +৳500
                  </button>
                  <button 
                    type="button" 
                    onClick={() => handleAddAmount(1000, payingOrder.current_sale_due)} 
                    className="px-2 py-1 text-[10px] font-bold bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    +৳1000
                  </button>
                </div>
              </div>

              {/* Conditional Reference Inputs */}
              {payDueMethod === 'card' && (
                <div className="animate-fadeIn">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Card Reference / Last 4 Digits / Txn Ref
                  </label>
                  <input
                    type="text"
                    value={payDueRef}
                    onChange={(e) => setPayDueRef(e.target.value)}
                    placeholder="e.g. Visa 4321 / Card Txn ID"
                    className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500"
                  />
                </div>
              )}

              {payDueMethod === 'mobile_pay' && (
                <div className="animate-fadeIn">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Mobile Payment Transaction ID / Account No
                  </label>
                  <input
                    type="text"
                    value={payDueRef}
                    onChange={(e) => setPayDueRef(e.target.value)}
                    placeholder="e.g. bKash TrxID (9G2K89X) / Account No"
                    className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500"
                  />
                </div>
              )}

              {/* Payment Note/Remarks */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Payment Note / Remarks
                </label>
                <input
                  type="text"
                  value={payDueNote}
                  onChange={(e) => setPayDueNote(e.target.value)}
                  placeholder="e.g. Paid in full, cashier reference, remarks..."
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500"
                />
              </div>

              {/* Real-time Validation Feedback */}
              {parseFloat(payDueAmount) > parseFloat(payingOrder.current_sale_due) ? (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 flex items-start space-x-2.5">
                  <svg className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="text-xs text-rose-700">
                    <p className="font-bold">Overpayment Warning</p>
                    <p className="mt-0.5">The entered amount exceeds the remaining outstanding due balance (৳{parseFloat(payingOrder.current_sale_due).toFixed(2)}).</p>
                  </div>
                </div>
              ) : parseFloat(payDueAmount) > 0 ? (
                <div className="bg-emerald-50 border border-emerald-150 rounded-2xl p-3 flex items-start space-x-2.5">
                  <svg className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-xs text-emerald-700">
                    <p className="font-semibold">Remaining balance after payment:</p>
                    <p className="text-sm font-bold mt-0.5">
                      ৳{(parseFloat(payingOrder.current_sale_due) - parseFloat(payDueAmount)).toFixed(2)}
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-100 flex space-x-3 justify-end">
                <button
                  type="button"
                  onClick={() => { setShowPayDueModal(false); setPayingOrder(null); }}
                  className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    payDueSubmitting ||
                    !parseFloat(payDueAmount) ||
                    parseFloat(payDueAmount) <= 0 ||
                    parseFloat(payDueAmount) > parseFloat(payingOrder.current_sale_due)
                  }
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all duration-200 shadow-md flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {payDueSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      <span>Recording...</span>
                    </>
                  ) : (
                    <span>Confirm Payment</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAILS VIEW MODAL */}
      {showDetailsModal && viewingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">Manual Sales Order Details</h3>
              <button onClick={() => setShowDetailsModal(false)} className="text-slate-400 hover:text-slate-650">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4 space-y-4 flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 border border-slate-100 p-4 rounded-xl">
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase">Salesman</p>
                  <p className="font-semibold text-slate-800">{viewingOrder.salesman_name}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase">Customer Name</p>
                  <p className="font-semibold text-slate-800">{viewingOrder.customer_name || 'Walk-in Customer'}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase">Customer Phone</p>
                  <p className="font-semibold text-slate-800 font-mono text-xs">{viewingOrder.customer_phone || '-'}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase">Customer Address</p>
                  <p className="font-semibold text-slate-800 text-xs">{viewingOrder.customer_address || '-'}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase">Payment Type</p>
                  <p className="font-semibold text-slate-855 capitalize">
                    {viewingOrder.payment_method} Sale
                    {viewingOrder.payment_method === 'credit' && viewingOrder.status === 'confirmed' && (
                      parseFloat(viewingOrder.current_sale_due || 0) > 0 ? (
                        <span className="ml-2 bg-rose-50 text-rose-600 border border-rose-100 rounded text-[10px] font-bold px-1.5 py-0.5">
                          Outstanding: ৳{parseFloat(viewingOrder.current_sale_due).toFixed(2)}
                        </span>
                      ) : (
                        <span className="ml-2 bg-emerald-50 text-emerald-650 border border-emerald-100 rounded text-[10px] font-bold px-1.5 py-0.5">
                          Fully Paid
                        </span>
                      )
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase">Created At</p>
                  <p className="font-semibold text-slate-800">{new Date(viewingOrder.created_at).toLocaleString()}</p>
                </div>
                {viewingOrder.notes && (
                  <div className="col-span-2 border-t border-slate-200/60 pt-2">
                    <p className="text-slate-400 text-xs font-bold uppercase">Notes / Dispatch Instructions</p>
                    <p className="text-slate-700 mt-1 whitespace-pre-wrap">{viewingOrder.notes}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-800 text-sm">Line Items</h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-150 font-bold text-slate-450 uppercase">
                        <th className="p-3">Product Description</th>
                        <th className="p-3 text-center">Qty</th>
                        <th className="p-3 text-right">Unit Price</th>
                        <th className="p-3 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {viewingOrder.items.map((item) => (
                        <tr key={item.id}>
                          <td className="p-3 font-medium">{item.product_name}</td>
                          <td className="p-3 text-center">{item.quantity} {item.unit || 'pcs'}</td>
                          <td className="p-3 text-right">৳{parseFloat(item.unit_price).toFixed(2)}</td>
                          <td className="p-3 text-right font-semibold text-slate-800">৳{parseFloat(item.subtotal).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end">
                <div className="w-64 text-xs space-y-1.5 bg-slate-50 border border-slate-100 p-4 rounded-xl">
                  <div className="flex justify-between text-slate-500">
                    <span>Subtotal:</span>
                    <span>৳{viewingOrder.items.reduce((s, i) => s + parseFloat(i.subtotal), 0).toFixed(2)}</span>
                  </div>
                  {parseFloat(viewingOrder.discount) > 0 && (
                    <div className="flex justify-between text-rose-500">
                      <span>Discount:</span>
                      <span>-৳{parseFloat(viewingOrder.discount).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-500">
                    <span>Tax:</span>
                    <span>৳{parseFloat(viewingOrder.tax).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-800 border-t border-slate-200 pt-1.5 text-sm">
                    <span>Total Amount:</span>
                    <span>৳{((viewingOrder.items.reduce((s, i) => s + parseFloat(i.subtotal), 0) - parseFloat(viewingOrder.discount)) + parseFloat(viewingOrder.tax)).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
              {viewingOrder.status === 'pending' && (
                <button
                  onClick={() => {
                    setShowDetailsModal(false);
                    handleConfirmOrder(viewingOrder.id);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-colors shadow-sm"
                >
                  Confirm & Invoice
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RECEIPT / INVOICE DISPLAY DIALOG */}
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">Print / View Invoice</h3>
              <button onClick={() => setReceipt(null)} className="text-slate-400 hover:text-slate-655">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto min-h-0 space-y-4 pr-1">
              <div className="flex justify-center space-x-3 bg-slate-50 p-2 rounded-xl border border-slate-100">
                <button
                  onClick={() => handlePrintReceipt('thermal')}
                  className="bg-indigo-650 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-xl text-xs shadow-sm flex items-center space-x-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>Print 80mm Thermal Receipt</span>
                </button>
                <button
                  onClick={() => handlePrintReceipt('regular')}
                  className="bg-slate-600 hover:bg-slate-700 text-white font-semibold py-2 px-4 rounded-xl text-xs shadow-sm flex items-center space-x-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Print A4 Invoice</span>
                </button>
              </div>

              {/* Receipt Preview Area inside modal */}
              <div className="border border-slate-200 rounded-2xl p-6 bg-slate-50 max-h-[50vh] overflow-y-auto flex justify-center">
                <div className="bg-white p-6 rounded-lg shadow border border-slate-100 max-w-[500px] w-full text-slate-800">
                  <div className="text-center border-b border-dashed border-slate-200 pb-4 mb-4">
                    <h2 className="text-lg font-bold text-slate-800 uppercase">{receipt.shop_name}</h2>
                    {receipt.shop_address && <p className="text-xs text-slate-500">{receipt.shop_address}</p>}
                    <p className="text-xs text-slate-500">Tel: {receipt.shop_phone || '-'}</p>
                    <p className="text-xs font-bold tracking-wider text-slate-400 mt-2 uppercase">*** Invoice Copy ***</p>
                  </div>

                  <div className="text-xs space-y-1 mb-4 text-slate-655 font-semibold">
                    <div><strong>Invoice ID:</strong> #{receipt.sale_id}</div>
                    <div><strong>Date:</strong> {receipt.created_at}</div>
                    <div><strong>Cashier:</strong> {receipt.staff_name}</div>
                    <div><strong>Billed To:</strong> {receipt.customer_name} {receipt.customer_phone ? `(${receipt.customer_phone})` : ''}</div>
                    {receipt.customer_address && <div><strong>Delivery Address:</strong> {receipt.customer_address}</div>}
                  </div>

                  <table className="w-full text-left text-xs border-collapse border-b border-dashed border-slate-200 mb-4">
                    <thead>
                      <tr className="border-b border-dashed border-slate-200 text-slate-450">
                        <th className="pb-2">Item</th>
                        <th className="pb-2 text-center">Qty</th>
                        <th className="pb-2 text-right">Price</th>
                        <th className="pb-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-700">
                      {receipt.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-2">{item.product_name || item.name}</td>
                          <td className="py-2 text-center">{item.quantity}</td>
                          <td className="py-2 text-right">৳{parseFloat(item.unit_price || item.price).toFixed(2)}</td>
                          <td className="py-2 text-right font-semibold">৳{((item.unit_price || item.price) * item.quantity).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="text-xs space-y-1.5 w-60 ml-auto text-slate-650">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>৳{receipt.subtotal.toFixed(2)}</span>
                    </div>
                    {receipt.discount > 0 && (
                      <div className="flex justify-between text-rose-500">
                        <span>Discount:</span>
                        <span>-৳{receipt.discount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Tax ({shopDetails.tax_rate}%):</span>
                      <span>৳{receipt.tax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-slate-900 text-sm">
                      <span>Total Paid:</span>
                      <span>৳{receipt.paid_amount.toFixed(2)}</span>
                    </div>
                    {receipt.due_amount > 0 && (
                      <div className="flex justify-between font-bold text-rose-600">
                        <span>Outstanding Due:</span>
                        <span>৳{receipt.due_amount.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setReceipt(null)}
                className="px-5 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-750 transition-colors"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- DYNAMIC PRINT AREA (OFF-SCREEN PORTAL FOR CLEAN INVOICE PRINTING) --- */}
      {receipt && createPortal(
        <div id="receipt-print-area">
          {/* Thermal View Container */}
          <div className="thermal-only">
            <div style={{ textAlign: 'center', marginBottom: '8px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 'bold', margin: '0 0 2px 0' }}>{receipt.shop_name}</h2>
              {receipt.shop_address && <p style={{ margin: '0 0 2px 0', fontSize: '9px' }}>{receipt.shop_address}</p>}
              <div style={{ fontSize: '9px', margin: '0 0 4px 0' }}>
                {receipt.shop_phone && <span style={{ marginRight: '6px' }}>Tel: {receipt.shop_phone}</span>}
                {receipt.shop_email && <span>Email: {receipt.shop_email}</span>}
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '9px', fontWeight: 'bold', letterSpacing: '0.05em' }}>*** MANUAL SALES ENTRY RECEIPT ***</p>
            </div>

            <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0', margin: '8px 0', fontSize: '9px', lineHeight: '1.3' }}>
              <div><strong>Invoice ID:</strong> #{receipt.sale_id}</div>
              <div><strong>Date:</strong> {receipt.created_at}</div>
              <div><strong>Cashier:</strong> {receipt.staff_name}</div>
              <div><strong>Customer:</strong> {receipt.customer_name}</div>
              {receipt.customer_phone && <div><strong>Phone:</strong> {receipt.customer_phone}</div>}
              {receipt.customer_address && <div><strong>Address:</strong> {receipt.customer_address}</div>}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px', margin: '8px 0' }}>
              <thead>
                <tr style={{ borderBottom: '1px dashed #000' }}>
                  <th style={{ textAlign: 'left', paddingBottom: '3px' }}>Item</th>
                  <th style={{ textAlign: 'center', paddingBottom: '3px', width: '25px' }}>Qty</th>
                  <th style={{ textAlign: 'center', paddingBottom: '3px', width: '25px' }}>Unit</th>
                  <th style={{ textAlign: 'right', paddingBottom: '3px', width: '55px' }}>Price</th>
                  <th style={{ textAlign: 'right', paddingBottom: '3px', width: '60px' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {receipt.items.map((item, idx) => (
                  <tr key={idx}>
                    <td style={{ paddingTop: '3px', maxWidth: '90px', wordBreak: 'break-all' }}>
                      {item.product_name || item.name}
                    </td>
                    <td style={{ textAlign: 'center', paddingTop: '3px' }}>{item.quantity}</td>
                    <td style={{ textAlign: 'center', paddingTop: '3px', color: '#666' }}>{item.unit || 'pcs'}</td>
                    <td style={{ textAlign: 'right', paddingTop: '3px' }}>৳{parseFloat(item.unit_price || item.price).toFixed(2)}</td>
                    <td style={{ textAlign: 'right', paddingTop: '3px' }}>৳{((item.unit_price || item.price) * item.quantity).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ borderTop: '1px dashed #000', paddingTop: '4px', fontSize: '9px', lineHeight: '1.3' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal:</span>
                <span>৳{receipt.subtotal.toFixed(2)}</span>
              </div>
              {receipt.discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Discount:</span>
                  <span>-৳{receipt.discount.toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Tax ({shopDetails.tax_rate}%):</span>
                <span>৳{receipt.tax.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 'bold', borderTop: '1px dashed #000', paddingTop: '3px', marginTop: '3px' }}>
                <span>Total Paid:</span>
                <span>৳{receipt.paid_amount.toFixed(2)}</span>
              </div>
              {receipt.due_amount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 'bold', color: '#ef4444', borderTop: '1px dashed #000', paddingTop: '2px', marginTop: '2px' }}>
                  <span>Outstanding Due:</span>
                  <span>৳{receipt.due_amount.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '9px' }}>
              <p style={{ margin: '0 0 2px 0' }}>Payment: {receipt.payment_method.toUpperCase()}</p>
              <p style={{ margin: '0', fontWeight: 'bold' }}>*** THANK YOU ***</p>
            </div>
          </div>

          {/* Regular A4 View Container */}
          <div className="regular-only">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px', marginBottom: '16px' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 4px 0' }}>{receipt.shop_name}</h1>
                {receipt.shop_address && <p style={{ margin: '0 0 2px 0', color: '#64748b', fontSize: '12px' }}>{receipt.shop_address}</p>}
                <div style={{ color: '#64748b', fontSize: '12px', marginTop: '2px' }}>
                  {receipt.shop_phone && <span style={{ marginRight: '10px' }}>Tel: {receipt.shop_phone}</span>}
                  {receipt.shop_email && <span>Email: {receipt.shop_email}</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#6366f1', margin: '0 0 4px 0' }}>INVOICE</h2>
                <p style={{ margin: '0 0 2px 0', color: '#64748b', fontSize: '12px' }}><strong>Invoice ID:</strong> #{receipt.sale_id}</p>
                <p style={{ margin: '0', color: '#64748b', fontSize: '12px' }}><strong>Date:</strong> {receipt.created_at}</p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', gap: '30px' }}>
              <div style={{ flex: 1, backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px 0' }}>Billed To</h3>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>{receipt.customer_name}</div>
                {receipt.customer_phone && <div style={{ color: '#475569', fontSize: '12px', marginBottom: '2px' }}>Phone: {receipt.customer_phone}</div>}
                {receipt.customer_address && <div style={{ color: '#475569', fontSize: '12px' }}>Address: {receipt.customer_address}</div>}
              </div>
              <div style={{ flex: 1, backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px 0' }}>Billed By</h3>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>{receipt.shop_name}</div>
                <div style={{ color: '#475569', fontSize: '12px', marginBottom: '2px' }}>Cashier: {receipt.staff_name}</div>
                <div style={{ color: '#475569', fontSize: '12px' }}>Payment Method: {receipt.payment_method.toUpperCase()}</div>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 'bold', color: '#334155' }}>Product Description</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 'bold', color: '#334155', width: '80px' }}>Quantity</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 'bold', color: '#334155', width: '85px' }}>Unit</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 'bold', color: '#334155', width: '110px' }}>Price</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 'bold', color: '#334155', width: '120px' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {receipt.items.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '10px 12px', color: '#1e293b', fontWeight: '500' }}>{item.product_name || item.name}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#334155' }}>{item.quantity}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#64748b' }}>{item.unit || 'pcs'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#334155' }}>৳{parseFloat(item.unit_price || item.price).toFixed(2)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', color: '#1e293b' }}>৳{((item.unit_price || item.price) * item.quantity).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ width: '280px', fontSize: '13px', lineHeight: '1.6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569', marginBottom: '4px' }}>
                  <span>Subtotal:</span>
                  <span>৳{receipt.subtotal.toFixed(2)}</span>
                </div>
                {receipt.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ef4444', marginBottom: '4px' }}>
                    <span>Discount:</span>
                    <span>-৳{receipt.discount.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569', marginBottom: '8px' }}>
                  <span>Tax ({shopDetails.tax_rate}%):</span>
                  <span>৳{receipt.tax.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 'bold', borderTop: '2px solid #cbd5e1', paddingTop: '8px', color: '#1e293b' }}>
                  <span>Total Paid:</span>
                  <span style={{ color: '#10b981' }}>৳{receipt.paid_amount.toFixed(2)}</span>
                </div>
                {receipt.due_amount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold', borderTop: '1px solid #e2e8f0', paddingTop: '4px', marginTop: '4px', color: '#ef4444' }}>
                    <span>Outstanding Due:</span>
                    <span>৳{receipt.due_amount.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>

            <div style={{ borderTop: '2px solid #e2e8f0', marginTop: '40px', paddingTop: '16px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
              <p style={{ margin: '0 0 4px 0' }}>Thank you for doing business with us!</p>
              <p style={{ margin: '0', fontWeight: '600' }}>Powered by Multi-Tenant POS System</p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
