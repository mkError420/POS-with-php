import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const API_BASE_URL = 'http://localhost:5000/api';

const createNewSaleTab = (index) => ({
  id: Date.now() + index, // Unique ID for the tab
  name: `Sale ${index}`,
  cart: [],
  selectedCustomerId: '',
  customerName: '',
  customerPhone: '',
  customerAddress: '',
  syncToDirectory: true,
  discountPercent: 0,
  paymentMethod: 'cash',
  paidAmount: '',
  isPaidTouched: false,
  reduceDueAmount: 0,
});

export default function Checkout({ onHeldBillsChange = () => {}, resumedHeldBill = null, onClearResumedHeldBill = () => {} }) {
  // --- STATE MANAGEMENT ---
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [saleTabs, setSaleTabs] = useState([createNewSaleTab(1)]);
  const [activeTabId, setActiveTabId] = useState(saleTabs[0].id);
  const [search, setSearch] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [taxRate, setTaxRate] = useState(0.10); // Dynamic Tax Rate (default 10%)

  // UI States
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [alert, setAlert] = useState(null); // { type: 'success' | 'error', message }
  const [receipt, setReceipt] = useState(null); // Receipts detail storage after checkout
  const [previewMode, setPreviewMode] = useState('thermal'); // 'thermal' | 'regular'

  // Held Bills States
  const [heldBills, setHeldBills] = useState([]);
  const [showHeldBillsModal, setShowHeldBillsModal] = useState(false);
  const [showHoldBillModal, setShowHoldBillModal] = useState(false);
  const [holdNotes, setHoldNotes] = useState('');
  const [holdingBill, setHoldingBill] = useState(false);

  // Derived active tab state
  const activeTabIndex = saleTabs.findIndex(t => t.id === activeTabId);
  const activeTab = saleTabs[activeTabIndex];

  // Decode/parse current user details on start
  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        setCurrentUser(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load user session info', e);
    }
  }, []);

  // When active tab changes, sync its details to the local form state
  useEffect(() => {
    // This effect is no longer needed as we bind directly to activeTab state.
    // Kept for historical context, can be removed.
  }, [activeTabId, saleTabs]);

  // Sync details input form fields when selection dropdown changes
  useEffect(() => {
    if (!activeTab) return;
    const selected = customers.find(c => c.id === parseInt(activeTab.selectedCustomerId));
    if (selected) {
      updateActiveTabState('customerName', selected.name || '');
      updateActiveTabState('customerPhone', selected.phone || '');
      updateActiveTabState('customerAddress', selected.address || '');
      updateActiveTabState('syncToDirectory', false);
    }
  }, [activeTab?.selectedCustomerId, customers]);

  // --- API FETCH LOGIC ---
  
  // 1. Fetch products matching search string
  const fetchProducts = async (searchTerm = '') => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/products?search=${encodeURIComponent(searchTerm)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch products.');
      const data = await response.json();
      setProducts(data);
    } catch (err) {
      triggerAlert('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Fetch customers for select options
  const fetchCustomers = async () => {
    try {
      const token = localStorage.getItem('token');
      // Mocked fallback list if API customer endpoint is pending setup
      const response = await fetch(`${API_BASE_URL}/customers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCustomers(data);
      } else {
        // Fallback demo data
        setCustomers([
          { id: 1, name: 'Walk-in Customer', phone: '-' },
          { id: 2, name: 'John Doe', phone: '555-0199' },
          { id: 3, name: 'Alice Smith', phone: '555-0144' }
        ]);
      }
    } catch (e) {
      setCustomers([
        { id: 1, name: 'Walk-in Customer', phone: '-' },
        { id: 2, name: 'John Doe', phone: '555-0199' },
        { id: 3, name: 'Alice Smith', phone: '555-0144' }
      ]);
    }
  };

  // 3. Fetch shop settings (for tax rate)
  const fetchShopSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/shops/my-shop`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.tax_rate !== undefined) {
          setTaxRate(parseFloat(data.tax_rate) / 100);
        }
      }
    } catch (e) {
      console.error('Failed to fetch shop settings for tax rate', e);
    }
  };

  // 4. Fetch held bills from the backend
  const fetchHeldBills = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/held-bills`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setHeldBills(data);
        onHeldBillsChange(data.length);
      }
    } catch (e) {
      console.error('Failed to fetch held bills', e);
    }
  };

  // Fetch initial product list & customer directory
  useEffect(() => {
    fetchProducts();
    fetchCustomers();
    fetchShopSettings();
    fetchHeldBills();
  }, []);

  // Debounced/delayed search triggers on input change
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchProducts(search);
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  // Handle resuming a held bill passed from the parent state (sidebar navigation)
  useEffect(() => {
    if (resumedHeldBill) {
      handleResumeHeldBill(resumedHeldBill);
      onClearResumedHeldBill();
    }
  }, [resumedHeldBill]);

  // Automatically sync paidAmount with final total unless cashier manually edited it
  useEffect(() => {
    if (!activeTab?.isPaidTouched) {
      updateActiveTabState('paidAmount', getFinalTotal().toFixed(2));
    }
  }, [activeTab?.cart, activeTab?.discountPercent, taxRate, activeTab?.isPaidTouched, activeTab?.reduceDueAmount]);

  // --- HELPER FUNCTIONS ---
  
  const triggerAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  const handlePrint = (mode) => {
    document.body.classList.add(`print-mode-${mode}`);
    window.print();
    setTimeout(() => {
      document.body.classList.remove(`print-mode-${mode}`);
    }, 500);
  };

  const updateActiveTabState = (field, value) => {
    setSaleTabs(prevTabs => {
      const newTabs = [...prevTabs];
      const tabIndex = newTabs.findIndex(t => t.id === activeTabId);
      if (tabIndex > -1) {
        newTabs[tabIndex] = { ...newTabs[tabIndex], [field]: value };
      }
      return newTabs;
    });
  };
  // 3. Cart State Modifications
  const addToCart = (product) => {
    if (product.stock_quantity <= 0) {
      triggerAlert('error', `"${product.name}" is currently out of stock.`);
      return;
    }

    const existingIndex = activeTab.cart.findIndex(item => item.id === product.id);

    if (existingIndex > -1) {
      const currentQty = activeTab.cart[existingIndex].quantity;
      if (currentQty >= product.stock_quantity) {
        triggerAlert('error', `Cannot exceed available inventory limit (${product.stock_quantity}) for "${product.name}".`);
        return;
      }
      const updatedCart = [...activeTab.cart];
      updatedCart[existingIndex].quantity += 1;
      updateActiveTabState('cart', updatedCart);
    } else {
      updateActiveTabState('cart', [...activeTab.cart, { ...product, quantity: 1 }]);
    }
  };

  const updateQuantity = (productId, change) => {
    const targetItem = activeTab.cart.find(item => item.id === productId);
    if (!targetItem) return;

    const newQty = targetItem.quantity + change;

    if (newQty <= 0) {
      removeFromCart(productId);
      return;
    }

    if (newQty > targetItem.stock_quantity) {
      triggerAlert('error', `Cannot exceed available stock limit (${targetItem.stock_quantity}) for "${targetItem.name}".`);
      return;
    }

    updateActiveTabState('cart', activeTab.cart.map(item =>
      item.id === productId ? { ...item, quantity: newQty } : item
    ));
  };

  const handleQuantityInput = (productId, valStr) => {
    let parsedVal = parseInt(valStr, 10);
    const targetItem = activeTab.cart.find(item => item.id === productId);
    if (!targetItem) return;

    if (valStr === '') {
      parsedVal = 0;
    } else if (isNaN(parsedVal) || parsedVal < 0) {
      parsedVal = 0;
    }

    if (parsedVal > targetItem.stock_quantity) {
      triggerAlert('error', `Cannot exceed available stock limit (${targetItem.stock_quantity}) for "${targetItem.name}".`);
      parsedVal = targetItem.stock_quantity;
    }

    updateActiveTabState('cart', activeTab.cart.map(item =>
      item.id === productId ? { ...item, quantity: parsedVal } : item
    ));
  };

  const handleQuantityBlur = (productId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId);
    }
  };

  const removeFromCart = (productId) => {
    updateActiveTabState('cart', activeTab.cart.filter(item => item.id !== productId));
  };

  // Financial Calculators
  const getSubtotal = () => activeTab?.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;
  const getTax = () => getSubtotal() * taxRate;
  const getDiscountAmount = () => getSubtotal() * (parseFloat(activeTab?.discountPercent || 0) / 100);
  const getFinalTotal = () => (getSubtotal() - getDiscountAmount()) + getTax() + parseFloat(activeTab?.reduceDueAmount || 0);

  // --- SUBMIT CHECKOUT ---
  const handleCheckout = async () => {
    if (activeTab.cart.length === 0 && parseFloat(activeTab.reduceDueAmount || 0) <= 0) {
      triggerAlert('error', 'Checkout cart is empty.');
      return;
    }

    const finalTotal = getFinalTotal();
    const parsedPaid = activeTab.paidAmount !== '' ? parseFloat(activeTab.paidAmount) : finalTotal;
    const dueAmount = finalTotal - parsedPaid;

    if (parsedPaid < 0) {
      triggerAlert('error', 'Amount Paid cannot be negative.');
      return;
    }

    if (dueAmount > 0) {
      const hasProfile = activeTab.selectedCustomerId !== '' || (activeTab.customerName.trim() !== '' && activeTab.syncToDirectory);
      if (!hasProfile) {
        triggerAlert('error', 'Customer profile selection is required to record outstanding due balance.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      let finalCustomerId = activeTab.selectedCustomerId ? parseInt(activeTab.selectedCustomerId) : null;

      // 1. Sync Customer Details to Customer Directory if requested
      if (activeTab.syncToDirectory && (activeTab.customerName.trim() !== '' || activeTab.selectedCustomerId !== '')) {
        if (activeTab.selectedCustomerId === '') {
          // Add new customer profile
          if (!activeTab.customerName.trim()) {
            throw new Error('Customer Name is required to save profile to directory.');
          }
          const customerRes = await fetch(`${API_BASE_URL}/customers`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              name: activeTab.customerName.trim(),
              phone: activeTab.customerPhone.trim() || null,
              address: activeTab.customerAddress.trim() || null
            })
          });
          const customerData = await customerRes.json();
          if (!customerRes.ok) {
            throw new Error(customerData.error || 'Failed to save new customer profile.');
          }
          finalCustomerId = customerData.id;
        } else {
          // Update existing customer profile
          if (!activeTab.customerName.trim()) {
            throw new Error('Customer Name cannot be empty.');
          }
          const customerRes = await fetch(`${API_BASE_URL}/customers/${activeTab.selectedCustomerId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              name: activeTab.customerName.trim(),
              phone: activeTab.customerPhone.trim() || null,
              address: activeTab.customerAddress.trim() || null
            })
          });
          const customerData = await customerRes.json();
          if (!customerRes.ok) {
            throw new Error(customerData.error || 'Failed to update customer profile.');
          }
        }
        
        // Refresh customer list in background so select dropdown options stay current
        await fetchCustomers();
      }

      // Structure POST payload matching backend schema requirements
      const payload = {
        customer_id: finalCustomerId,
        discount: getDiscountAmount(),
        tax: getTax(),
        payment_method: activeTab.paymentMethod, // This was already correct, but good to confirm
        paid_amount: parsedPaid,        reduce_due_amount: parseFloat(activeTab.reduceDueAmount || 0),
        items: activeTab.cart.map(item => ({
          product_id: item.id,
          quantity: item.quantity
        }))
      };

      const response = await fetch(`${API_BASE_URL}/sales`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Checkout transaction failed.');
      }

      // Calculate paid and outstanding due amounts
      const finalTotal = getFinalTotal();
      const paid = activeTab.paidAmount !== '' ? parseFloat(activeTab.paidAmount) : finalTotal;
      const outstandingDue = finalTotal - paid;

      // Successful Checkout routine
      setReceipt({
        sale_id: data.sale_id,
        items: [...activeTab.cart],
        subtotal: getSubtotal(),
        discount: payload.discount,
        tax: payload.tax,
        total: data.final_amount,
        payment_method: activeTab.paymentMethod,
        created_at: new Date().toLocaleString(),
        customer_name: activeTab.customerName.trim() || 'Walk-in Customer',
        customer_phone: activeTab.customerPhone.trim() || '',
        customer_address: activeTab.customerAddress.trim() || '',
        shop_name: currentUser?.shop_name || 'Boutique POS',
        shop_phone: currentUser?.shop_phone || '',
        shop_address: currentUser?.shop_address || '',
        shop_email: currentUser?.email || '',
        staff_name: currentUser?.name || 'Cashier',
        reduce_due_amount: parseFloat(activeTab.reduceDueAmount || 0),
        paid_amount: paid,
        due_amount: outstandingDue > 0 ? outstandingDue : 0
      });

      // Show warnings if inventory items hit low stock limit
      if (data.stock_alerts && data.stock_alerts.length > 0) {
        const warningNames = data.stock_alerts.map(a => a.name).join(', ');
        triggerAlert('success', `Transaction success! Note low stock threshold warnings on: ${warningNames}`);
      } else {
        triggerAlert('success', 'Checkout transaction completed successfully!');
      }

      // Reset the completed tab
      setSaleTabs(prev => {
        const newTabs = [...prev];
        newTabs[activeTabIndex] = createNewSaleTab(activeTabIndex + 1);
        return newTabs;
      });
      setMobileCartOpen(false);
      
      // Refresh local product stock list
      fetchProducts(search);

    } catch (err) {
      triggerAlert('error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // --- HOLD BILL HANDLERS ---

  const handleHoldBillSubmit = async (e) => {
    e.preventDefault();
    if (activeTab.cart.length === 0) {
      triggerAlert('error', 'Cart is empty. Nothing to hold.');
      return;
    }

    setHoldingBill(true);
    try {
      const token = localStorage.getItem('token');
      let finalCustomerId = activeTab.selectedCustomerId ? parseInt(activeTab.selectedCustomerId) : null;

      const payloadItems = activeTab.cart.map(item => ({
        product_id: item.id,
        quantity: item.quantity
      }));

      const payload = {
        customer_id: finalCustomerId,
        customer_name: activeTab.customerName.trim() || null,
        customer_phone: activeTab.customerPhone.trim() || null,
        customer_address: activeTab.customerAddress.trim() || null,
        discount_percent: activeTab.discountPercent,
        notes: holdNotes.trim(),
        items: payloadItems
      };

      const response = await fetch(`${API_BASE_URL}/held-bills`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'Failed to hold bill.');

      triggerAlert('success', 'Bill held successfully!');
      
      // Reset the current tab
      setSaleTabs(prev => {
        const newTabs = [...prev];
        newTabs[activeTabIndex] = createNewSaleTab(activeTabIndex + 1);
        return newTabs;
      });
      setHoldNotes('');
      setShowHoldBillModal(false);

      // Refresh list
      fetchHeldBills();
    } catch (err) {
      triggerAlert('error', err.message);
    } finally {
      setHoldingBill(false);
    }
  };

  const handleResumeHeldBill = async (heldBill) => {
    if (activeTab.cart.length > 0) {
      if (!window.confirm('Resuming will overwrite your current active cart. Proceed?')) {
        return;
      }
    }

    try {
      let heldItems = [];
      if (typeof heldBill.items === 'string') {
        heldItems = JSON.parse(heldBill.items);
      } else {
        heldItems = heldBill.items;
      }

      const reconstructedCart = [];
      const missingProducts = [];
      const stockCappedProducts = [];

      for (const item of heldItems) {
        let productObj = products.find(p => p.id === item.product_id);
        
        if (!productObj) {
          try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE_URL}/products/${item.product_id}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
              productObj = await res.json();
            }
          } catch (e) {
            console.error(`Failed to fetch details for product ID ${item.product_id}`, e);
          }
        }

        if (!productObj) {
          missingProducts.push(item.product_id);
          continue;
        }

        let finalQty = item.quantity;
        if (productObj.stock_quantity <= 0) {
          stockCappedProducts.push(`${productObj.name} (out of stock)`);
          continue;
        } else if (finalQty > productObj.stock_quantity) {
          finalQty = productObj.stock_quantity;
          stockCappedProducts.push(`${productObj.name} (capped to ${finalQty})`);
        }

        reconstructedCart.push({
          ...productObj,
          quantity: finalQty
        });
      }

      if (missingProducts.length > 0) {
        triggerAlert('error', `Some products in this held bill were deleted or are unavailable.`);
      }

      if (stockCappedProducts.length > 0) {
        triggerAlert('success', `Cart loaded! Note: stock limits adjusted for: ${stockCappedProducts.join(', ')}`);
      } else {
        triggerAlert('success', 'Held cart successfully resumed!');
      }

      updateActiveTabState('cart', reconstructedCart);
      updateActiveTabState('discountPercent', parseFloat(heldBill.discount_percent || 0));
      updateActiveTabState('reduceDueAmount', parseFloat(heldBill.due_amount || 0));
      updateActiveTabState('selectedCustomerId', heldBill.customer_id || '');
      updateActiveTabState('customerName', heldBill.customer_name || '');
      updateActiveTabState('customerPhone', heldBill.customer_phone || '');
      updateActiveTabState('customerAddress', heldBill.customer_address || '');
      updateActiveTabState('isPaidTouched', false);
      updateActiveTabState('paidAmount', '');

      setShowHeldBillsModal(false);
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE_URL}/held-bills/${heldBill.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      fetchHeldBills();
    } catch (err) {
      triggerAlert('error', `Failed to resume held bill: ${err.message}`);
    }
  };

  const handleDeleteHeldBill = async (heldBillId) => {
    if (!window.confirm('Are you sure you want to discard this held bill?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/held-bills/${heldBillId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'Failed to delete held bill.');

      triggerAlert('success', 'Held bill discarded successfully.');
      fetchHeldBills();
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const addSaleTab = () => {
    const newTab = createNewSaleTab(saleTabs.length + 1);
    setSaleTabs([...saleTabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const closeSaleTab = (tabIdToClose) => {
    if (saleTabs.length <= 1) {
      triggerAlert('error', 'Cannot close the last sale tab.');
      return;
    }
    const tabIndexToClose = saleTabs.findIndex(t => t.id === tabIdToClose);
    const newTabs = saleTabs.filter(t => t.id !== tabIdToClose);
    setSaleTabs(newTabs);

    if (activeTabId === tabIdToClose) {
      setActiveTabId(newTabs[Math.max(0, tabIndexToClose - 1)].id);
    }
  };

  return (
    <div className="relative h-full flex flex-col">
      
      {/* 1. Alerts Banner */}
      {alert && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg flex items-center space-x-3 transition-all ${
          alert.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
        }`}>
          <span className="text-sm font-semibold">{alert.message}</span>
        </div>
      )}

      {/* 2. Page Title Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">POS Checkout</h2>
          <p className="text-sm text-slate-500">Scan SKU or search item names to build a customer cart</p>
        </div>
        <div>
          <button
            type="button"
            onClick={() => setShowHeldBillsModal(true)}
            className="relative bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 px-4 border border-slate-200 rounded-xl text-sm shadow-xs transition-colors flex items-center space-x-2"
          >
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span>Resume Held Bills</span>
            {heldBills.filter(b => b.status === 'held').length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center border border-white animate-pulse">
                {heldBills.filter(b => b.status === 'held').length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 3. Tabs Bar */}
      <div className="mb-4 border-b border-slate-200 flex items-center space-x-1">
        {saleTabs.map(tab => (
          <div
            key={tab.id}
            className={`flex items-center space-x-2 py-2 px-4 border-b-2 cursor-pointer transition-all duration-200 ${
              activeTabId === tab.id
                ? 'border-indigo-600 text-indigo-600 font-semibold bg-indigo-50/50'
                : 'border-transparent text-slate-500 hover:bg-slate-100'
            }`}
            onClick={() => setActiveTabId(tab.id)}
          >
            <span>{tab.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); closeSaleTab(tab.id); }}
              className="text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-full p-0.5"
              disabled={saleTabs.length <= 1}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
        <button
          onClick={addSaleTab}
          className="ml-2 text-slate-500 hover:bg-slate-200 rounded-full p-2 transition-colors"
          title="Add New Sale Tab"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
        </button>
      </div>
      {/* 3. Split Screen Flex Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden min-h-0">
        
        {/* Left Side: Product Grid (2 columns on Desktop) */}
        <div className="lg:col-span-2 flex flex-col overflow-hidden">
          
          {/* Search Header Input bar */}
          <div className="mb-4 relative">
            <input
              type="text"
              placeholder="Search by product name or scan SKU code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <svg className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Product Items Scrolling Container */}
          <div className="flex-1 overflow-y-auto pr-1">
            {loading ? (
              <div className="flex justify-center items-center h-48">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600"></div>
              </div>
            ) : products.length === 0 ? (
              <div className="bg-white border border-slate-100 rounded-xl p-12 text-center text-slate-400">
                No items found. Create items in inventory to begin.
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                        <th className="p-3 pl-4 w-24">SKU</th>
                        <th className="p-3">Product Name</th>
                        <th className="p-3 text-right">Price</th>
                        <th className="p-3 text-center">Stock</th>
                        <th className="p-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {products.map((product) => {
                        const inCartItem = activeTab.cart.find(item => item.id === product.id);
                        const remainingQty = product.stock_quantity - (inCartItem ? inCartItem.quantity : 0);
                        const isOutOfStock = remainingQty <= 0;

                        return (
                          <tr key={product.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="p-3 pl-4 font-mono text-xs font-bold text-slate-500">{product.sku}</td>
                            <td 
                              className="p-3 font-semibold text-slate-800 cursor-pointer hover:text-indigo-600 transition-colors"
                              onClick={() => !isOutOfStock && addToCart(product)}
                              title={isOutOfStock ? 'Out of stock' : 'Click to add to cart'}
                            >
                              {product.name}
                            </td>
                            <td className="p-3 text-right font-extrabold text-slate-700">৳{parseFloat(product.price).toFixed(2)}</td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                remainingQty <= product.low_stock_threshold
                                  ? 'bg-rose-50 text-rose-600 border border-rose-100'
                                  : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                              }`}>
                                {remainingQty} left
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              {inCartItem ? (
                                <div className="flex items-center justify-center space-x-2">
                                  <button
                                    onClick={() => updateQuantity(product.id, -1)}
                                    className="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-lg flex items-center justify-center transition-colors"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    min="1"
                                    max={product.stock_quantity}
                                    value={inCartItem.quantity === 0 ? '' : inCartItem.quantity}
                                    onChange={(e) => handleQuantityInput(product.id, e.target.value)}
                                    onBlur={() => handleQuantityBlur(product.id, inCartItem.quantity)}
                                    className="w-12 text-center text-xs font-extrabold text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded-md border border-indigo-100 focus:ring-1 focus:ring-indigo-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                  <button
                                    onClick={() => updateQuantity(product.id, 1)}
                                    className="w-7 h-7 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold rounded-lg flex items-center justify-center transition-colors"
                                  >
                                    +
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => addToCart(product)}
                                  disabled={isOutOfStock}
                                  className="bg-slate-600 hover:bg-indigo-700 text-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shadow-xs"
                                >
                                  {isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side / Cart Side Panel (Always visible on Desktop) */}
        <div className={`hidden lg:flex lg:col-span-1 bg-white border border-slate-200 rounded-2xl flex-col overflow-hidden shadow-sm`}>
          {renderCartPanelContent()}
        </div>

      </div>

      {/* 4. MOBILE BOTTOM DRAWER STICKY NAV BAR */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-3 flex justify-between items-center shadow-2xl lg:hidden z-35">
        <div>
          <p className="text-xs text-slate-400 font-medium">Active Cart</p>
          <p className="text-lg font-bold text-slate-800">
            {activeTab?.cart.reduce((sum, item) => sum + item.quantity, 0) || 0} Items - <span className="text-indigo-600">৳{getFinalTotal().toFixed(2)}</span>
          </p>
        </div>
        <button
          onClick={() => setMobileCartOpen(true)}
          className="bg-slate-600 hover:bg-indigo-700 text-white font-semibold px-6 py-2.5 rounded-xl shadow-lg transition-colors flex items-center space-x-2"
        >
          <span>View Cart</span>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Mobile Cart Backdrop Drawer */}
      {mobileCartOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden">
          <div className="absolute bottom-0 inset-x-0 bg-white rounded-t-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">Active Checkout Cart</h3>
              <button
                onClick={() => setMobileCartOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 pb-16">
              {renderCartPanelContent()}
            </div>
          </div>
        </div>
      )}

      {/* --- RECEIPT PREVIEW & PRINT MODAL --- */}
      {receipt && activeTab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]">

            {/* Left Side: Receipt Live Preview Canvas */}
            <div className="flex-1 bg-slate-100 p-6 flex flex-col items-center justify-center overflow-y-auto min-h-0">
              <div className="w-full flex justify-between items-center mb-4">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Receipt Preview</span>
                <span className="text-[10px] bg-slate-200 text-slate-600 font-semibold px-2 py-0.5 rounded-full uppercase">
                  {previewMode === 'thermal' ? 'Thermal 80mm Roll' : 'Regular A4 Sheet'}
                </span>
              </div>

              <div className="w-full py-4 flex justify-center items-start min-h-0 overflow-y-auto">
                {previewMode === 'thermal' ? (
                  /* Thermal Receipt Mockup */
                  <div className="w-[320px] bg-white text-slate-800 shadow-lg p-6 font-mono text-[11px] leading-relaxed border-t-8 border-indigo-600 rounded-b-md">
                    <div className="text-center mb-4">
                      <h2 className="text-sm font-bold tracking-tight uppercase text-slate-950">{receipt.shop_name}</h2>
                      {receipt.shop_address && <p className="text-[10px] text-slate-500 mt-0.5">{receipt.shop_address}</p>}
                      {receipt.shop_phone && <p className="text-[10px] text-slate-500">Tel: {receipt.shop_phone}</p>}
                      {receipt.shop_email && <p className="text-[10px] text-slate-500">Email: {receipt.shop_email}</p>}
                      <p className="text-[9px] text-slate-400 mt-2 font-sans tracking-widest">*** TRANSACTION RECEIPT ***</p>
                    </div>

                    <div className="border-b border-dashed border-slate-300 py-2 my-2 text-[10px] space-y-0.5 text-slate-600">
                      <div><span className="font-semibold text-slate-800">Sale ID:</span> #{receipt.sale_id}</div>
                      <div><span className="font-semibold text-slate-800">Date:</span> {receipt.created_at}</div>
                      <div><span className="font-semibold text-slate-800">Cashier:</span> {receipt.staff_name}</div>
                      <div><span className="font-semibold text-slate-800">Customer:</span> {receipt.customer_name}</div>
                      {receipt.customer_phone && <div><span className="font-semibold text-slate-800">Phone:</span> {receipt.customer_phone}</div>}
                    </div>

                    <table className="w-full text-left text-[10px] border-collapse">
                      <thead>
                        <tr className="border-b border-dashed border-slate-300 font-bold text-slate-700">
                          <th className="pb-1 text-left">Item</th>
                          <th className="pb-1 text-center w-8">Qty</th>
                          <th className="pb-1 text-center w-8">Unit</th>
                          <th className="pb-1 text-right w-16">Price</th>
                          <th className="pb-1 text-right w-20">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {receipt.items.map((item, idx) => (
                          <tr key={idx} className="border-b border-dotted border-slate-100">
                            <td className="py-2 pr-1 text-slate-800 break-words max-w-[100px]">
                              <div>{item.name || item.product_name}</div>
                            </td>
                            <td className="py-2 text-center text-slate-600">{item.quantity}</td>
                            <td className="py-2 text-center text-slate-500">{item.unit || 'pcs'}</td>
                            <td className="py-2 text-right text-slate-600">৳{parseFloat(item.price || item.unit_price).toFixed(2)}</td>
                            <td className="py-2 text-right font-semibold text-slate-800">
                              ৳{((item.price || item.unit_price) * item.quantity).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="border-t border-dashed border-slate-300 pt-2.5 mt-2.5 text-[10px] space-y-1.5 text-slate-600">
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span className="font-medium text-slate-800">৳{parseFloat(receipt.subtotal).toFixed(2)}</span>
                      </div>
                      {parseFloat(receipt.discount || 0) > 0 && (
                        <div className="flex justify-between text-rose-500">
                          <span>Discount:</span>
                          <span>-৳{parseFloat(receipt.discount).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Tax:</span>
                        <span className="font-medium text-slate-800">৳{parseFloat(receipt.tax).toFixed(2)}</span>
                      </div>
                      {parseFloat(receipt.reduce_due_amount || 0) > 0 && (
                        <div className="flex justify-between text-indigo-600 font-medium">
                          <span>Due Paid:</span>
                          <span>৳{parseFloat(receipt.reduce_due_amount).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-slate-900 border-t border-dotted border-slate-200 pt-1.5 text-[12px]">
                        <span>Total Paid:</span>
                        <span>৳{parseFloat(receipt.total).toFixed(2)}</span>
                      </div>
                      {parseFloat(receipt.due_amount || 0) > 0 && (
                        <div className="flex justify-between font-bold text-rose-600 border-t border-dotted border-slate-200 pt-1 text-[11px]">
                          <span>Outstanding Due:</span>
                          <span>৳{parseFloat(receipt.due_amount).toFixed(2)}</span>
                        </div>
                      )}
                    </div>

                    <div className="text-center mt-6 pt-3 border-t border-dashed border-slate-300">
                      <p className="text-[10px] text-slate-600 uppercase font-semibold">Payment: {receipt.payment_method.replace('_', ' ')}</p>
                      <p className="text-[10px] font-bold text-slate-800 tracking-wider mt-2">*** THANK YOU ***</p>
                    </div>
                  </div>
                ) : (
                  /* Regular A4 Sheet Mockup */
                  <div className="w-full max-w-[620px] bg-white text-slate-800 shadow-lg p-8 font-sans text-[11px] leading-relaxed border-t-8 border-indigo-600 rounded-b-md">
                    <div className="flex justify-between items-start border-b border-slate-200 pb-4 mb-4">
                      <div>
                        <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">{receipt.shop_name}</h1>
                        {receipt.shop_address && <p className="text-slate-500 mt-1 text-[10px]">{receipt.shop_address}</p>}
                        <div className="text-slate-400 mt-0.5 text-[9px] space-x-2">
                          {receipt.shop_phone && <span>Tel: {receipt.shop_phone}</span>}
                          {receipt.shop_email && <span>Email: {receipt.shop_email}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <h2 className="text-sm font-black text-indigo-600 tracking-widest uppercase">INVOICE</h2>
                        <p className="text-slate-500 mt-1 text-[10px]">Invoice ID: <span className="font-semibold text-slate-800">#{receipt.sale_id}</span></p>
                        <p className="text-slate-400 text-[9px]">{receipt.created_at}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg mb-4 text-[10px]">
                      <div>
                        <h3 className="text-[8px] font-bold uppercase tracking-wider text-slate-400 mb-1">Billed To</h3>
                        <div className="font-bold text-slate-800">{receipt.customer_name}</div>
                        {receipt.customer_phone && <p className="text-slate-600 mt-0.5">Phone: {receipt.customer_phone}</p>}
                        {receipt.customer_address && <p className="text-slate-600">Address: {receipt.customer_address}</p>}
                      </div>
                      <div>
                        <h3 className="text-[8px] font-bold uppercase tracking-wider text-slate-400 mb-1">Billed By</h3>
                        <div className="font-bold text-slate-800">{receipt.shop_name}</div>
                        <p className="text-slate-600 mt-0.5">Cashier: {receipt.staff_name}</p>
                        <p className="text-slate-600">Payment: <span className="uppercase text-[9px] font-bold text-slate-700 bg-slate-200 px-1.5 py-0.5 rounded">{receipt.payment_method.replace('_', ' ')}</span></p>
                      </div>
                    </div>

                    <table className="w-full text-left border-collapse text-[10px]">
                      <thead>
                        <tr className="border-b-2 border-slate-200 text-[9px] uppercase font-bold text-slate-500">
                          <th className="pb-2 text-left">Item Description</th>
                          <th className="pb-2 text-center w-16">SKU</th>
                          <th className="pb-2 text-center w-12">Qty</th>
                          <th className="pb-2 text-right w-20">Unit Price</th>
                          <th className="pb-2 text-right w-20">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {receipt.items.map((item, idx) => (
                          <tr key={idx}>
                            <td className="py-2.5 font-semibold text-slate-800">{item.name || item.product_name}</td>
                            <td className="py-2.5 text-center text-slate-400 text-[9px] font-mono">{item.sku || item.product_sku || 'N/A'}</td>
                            <td className="py-2.5 text-center text-slate-600 font-medium">{item.quantity}</td>
                            <td className="py-2.5 text-right text-slate-600">৳{parseFloat(item.price || item.unit_price).toFixed(2)}</td>
                            <td className="py-2.5 text-right font-bold text-slate-900">
                              ৳{((item.price || item.unit_price) * item.quantity).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="flex justify-end mt-4 border-t border-slate-100 pt-3">
                      <div className="w-56 space-y-1.5 text-slate-600 text-[10px]">
                        <div className="flex justify-between">
                          <span>Subtotal:</span>
                          <span className="font-semibold text-slate-800">৳{parseFloat(receipt.subtotal).toFixed(2)}</span>
                        </div>
                        {parseFloat(receipt.discount || 0) > 0 && (
                          <div className="flex justify-between text-rose-500">
                            <span>Discount:</span>
                            <span>-৳{parseFloat(receipt.discount).toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span>Tax:</span>
                          <span className="font-semibold text-slate-800">৳{parseFloat(receipt.tax).toFixed(2)}</span>
                        </div>
                        {parseFloat(receipt.reduce_due_amount || 0) > 0 && (
                          <div className="flex justify-between text-indigo-600 font-semibold">
                            <span>Due Paid:</span>
                            <span>৳{parseFloat(receipt.reduce_due_amount).toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-black text-indigo-600 border-t border-slate-250 pt-1.5 text-xs">
                          <span>Total Paid:</span>
                          <span>৳{parseFloat(receipt.total).toFixed(2)}</span>
                        </div>
                        {parseFloat(receipt.due_amount || 0) > 0 && (
                          <div className="flex justify-between font-bold text-rose-600 border-t border-slate-200 pt-1">
                            <span>Outstanding Due:</span>
                            <span>৳{parseFloat(receipt.due_amount).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-center mt-8 pt-3 border-t border-slate-100 text-slate-400 text-[9px]">
                      <p>Thank you for shopping with us! Please contact us for any inquiries.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Side: Options & Actions Control Panel */}
            <div className="w-full md:w-80 flex flex-col justify-between border-t md:border-t-0 md:border-l border-slate-100 p-6 bg-slate-50">
              <div>
                <div className="flex items-center space-x-2 text-emerald-600 mb-4">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-bold tracking-tight">Checkout Completed</span>
                </div>
                
                <h3 className="text-lg font-extrabold text-slate-800">Print Receipt for {activeTab?.name || 'Sale'}</h3>
                <p className="text-xs text-slate-500 mt-1">Transaction recorded successfully. Preview and choose formatting layout below:</p>

                {/* Print Layout Selector */}
                <div className="mt-5 space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Receipt Format</span>
                  <div className="grid grid-cols-2 gap-2 bg-slate-200/60 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => { setPreviewMode('thermal'); }}
                      className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                        previewMode === 'thermal' 
                          ? 'bg-white text-indigo-700 shadow-sm' 
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
                      }`}
                    >
                      Thermal (80mm) 
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewMode('regular')}
                      className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                        previewMode === 'regular' 
                          ? 'bg-white text-indigo-700 shadow-sm' 
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
                      }`}
                    >
                      Regular (A4) 
                    </button>
                  </div>
                </div>

                {/* Summary Metadata Card */}
                <div className="mt-6 bg-white border border-slate-200/80 rounded-xl p-3.5 space-y-2.5 text-xs">
                  <div className="flex justify-between text-slate-500">
                    <span>Transaction ID:</span>
                    <span className="font-semibold text-slate-700">#{receipt.sale_id}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Payment Method:</span>
                    <span className="font-semibold text-slate-700 uppercase">{receipt.payment_method}</span>
                  </div>
                  <div className="flex justify-between text-slate-500 border-t border-slate-100 pt-2 mt-2">
                    <span>Total Paid:</span>
                    <span className="font-bold text-indigo-600">৳{parseFloat(receipt.total).toFixed(2)}</span>
                  </div>
                  {receipt.due_amount > 0 && (
                    <div className="flex justify-between text-rose-500 font-semibold">
                      <span>Outstanding Due:</span>
                      <span>৳{parseFloat(receipt.due_amount).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="mt-8 space-y-2">
                <button
                  onClick={() => handlePrint(previewMode)}
                  className="w-full bg-slate-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30 flex items-center justify-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>Print {previewMode === 'thermal' ? 'Thermal' : 'Regular A4'}</span>
                </button>
                <button
                  onClick={() => setReceipt(null)}
                  className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2.5 rounded-xl text-sm transition-colors"
                >
                  Done
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* --- DYNAMIC PRINT AREA (OFF-SCREEN ON APPLICATION SCREEN, SHOWN VIA PRINT MEDIA CLASS) --- */}
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
              <p style={{ margin: '4px 0 0 0', fontSize: '9px', fontWeight: 'bold', letterSpacing: '0.05em' }}>*** TRANSACTION RECEIPT ***</p>
            </div>
            
            <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0', margin: '8px 0', fontSize: '9px', lineHeight: '1.3' }}>
              <div><strong>Sale ID:</strong> #{receipt.sale_id}</div>
              <div><strong>Date:</strong> {receipt.created_at}</div>
              <div><strong>Cashier:</strong> {receipt.staff_name}</div>
              <div><strong>Customer:</strong> {receipt.customer_name}</div>
              {receipt.customer_phone && <div><strong>Phone:</strong> {receipt.customer_phone}</div>}
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
                    <td style={{ paddingTop: '3px', maxWidth: '100px', wordBreak: 'break-all' }}>
                      {item.name || item.product_name}
                    </td>
                    <td style={{ textAlign: 'center', paddingTop: '3px' }}>{item.quantity}</td>
                    <td style={{ textAlign: 'center', paddingTop: '3px', color: '#666' }}>{item.unit || 'pcs'}</td>
                    <td style={{ textAlign: 'right', paddingTop: '3px' }}>৳{parseFloat(item.price || item.unit_price).toFixed(2)}</td>
                    <td style={{ textAlign: 'right', paddingTop: '3px' }}>৳{((item.price || item.unit_price) * item.quantity).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ borderTop: '1px dashed #000', paddingTop: '4px', fontSize: '9px', lineHeight: '1.3' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal:</span>
                <span>৳{receipt.subtotal.toFixed(2)}</span>
              </div>
              {parseFloat(receipt.discount || 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Discount:</span>
                  <span>-৳{parseFloat(receipt.discount).toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Tax ({(taxRate * 100).toString()}%):</span>
                <span>৳{receipt.tax.toFixed(2)}</span>
              </div>
              {parseFloat(receipt.reduce_due_amount || 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                  <span>Due Paid:</span>
                  <span>৳{parseFloat(receipt.reduce_due_amount).toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 'bold', borderTop: '1px dashed #000', paddingTop: '3px', marginTop: '3px' }}>
                <span>Total Paid:</span>
                <span>৳{parseFloat(receipt.total).toFixed(2)}</span>
              </div>
              {parseFloat(receipt.due_amount || 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 'bold', color: '#ef4444', borderTop: '1px dashed #000', paddingTop: '2px', marginTop: '2px' }}>
                  <span>Outstanding Due:</span>
                  <span>৳{parseFloat(receipt.due_amount).toFixed(2)}</span>
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

            <table style={{ width: '100%', borderCollapse: 'collapse', margin: '16px 0' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #cbd5e1', color: '#475569', fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold', textAlign: 'left' }}>
                  <th style={{ padding: '8px 0' }}>Item Description</th>
                  <th style={{ padding: '8px 0', textAlign: 'center', width: '100px' }}>SKU</th>
                  <th style={{ padding: '8px 0', textAlign: 'center', width: '60px' }}>Qty</th>
                  <th style={{ padding: '8px 0', textAlign: 'right', width: '100px' }}>Unit Price</th>
                  <th style={{ padding: '8px 0', textAlign: 'right', width: '100px' }}>Total</th>
                </tr>
              </thead>
              <tbody style={{ fontSize: '13px', color: '#334155' }}>
                {receipt.items.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 0', fontWeight: '500' }}>{item.name || item.product_name}</td>
                    <td style={{ padding: '10px 0', textAlign: 'center', color: '#64748b' }}>{item.sku || item.product_sku || 'N/A'}</td>
                    <td style={{ padding: '10px 0', textAlign: 'center' }}>{item.quantity}</td>
                    <td style={{ padding: '10px 0', textAlign: 'right' }}>৳{parseFloat(item.price || item.unit_price).toFixed(2)}</td>
                    <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 'bold' }}>৳{((item.price || item.unit_price) * item.quantity).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <div style={{ width: '250px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#64748b' }}>
                  <span>Subtotal</span>
                  <span style={{ fontWeight: '600', color: '#1e293b' }}>৳{receipt.subtotal.toFixed(2)}</span>
                </div>
                {parseFloat(receipt.discount || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#ef4444' }}>
                    <span>Discount</span>
                    <span>-৳{parseFloat(receipt.discount).toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#64748b' }}>
                  <span>Tax ({(taxRate * 100).toString()}%)</span>
                  <span style={{ fontWeight: '600', color: '#1e293b' }}>৳{receipt.tax.toFixed(2)}</span>
                </div>
                {parseFloat(receipt.reduce_due_amount || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#4f46e5', fontWeight: 'bold' }}>
                    <span>Due Balance Paid</span>
                    <span>৳{parseFloat(receipt.reduce_due_amount).toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '15px', fontWeight: 'bold', borderTop: '2px solid #e2e8f0', marginTop: '6px' }}>
                  <span>Total Paid</span>
                  <span style={{ color: '#6366f1' }}>৳{parseFloat(receipt.total).toFixed(2)}</span>
                </div>
                {parseFloat(receipt.due_amount || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#ef4444', fontWeight: 'bold', borderTop: '1px solid #e2e8f0', marginTop: '4px' }}>
                    <span>Outstanding Due</span>
                    <span>৳{parseFloat(receipt.due_amount).toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginTop: '60px', borderTop: '1px solid #e2e8f0', paddingTop: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '11px' }}>
              <p style={{ margin: '0 0 3px 0' }}>Thank you for shopping with us!</p>
              <p style={{ margin: '0' }}>Please contact us for any inquiry regarding this invoice.</p>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* --- HOLD BILL MODAL --- */}
      {showHoldBillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 ">
              <h3 className="text-lg font-bold text-slate-800">Hold Current Bill</h3>
              <button onClick={() => setShowHoldBillModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleHoldBillSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Hold Reference / Note (e.g. Table Number, Name) *
                </label>
                <input
                  type="text"
                  value={holdNotes}
                  onChange={(e) => setHoldNotes(e.target.value)}
                  required
                  placeholder="e.g. Table 5, Mr. Rabbani, In a hurry"
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-amber-500 outline-none"
                />
              </div>

              <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500 space-y-1">
                <div className="flex justify-between font-semibold text-slate-700">
                  <span>Cart Items Count:</span>
                  <span>{activeTab.cart.reduce((sum, item) => sum + item.quantity, 0)}</span>
                </div>
                <div className="flex justify-between font-semibold text-slate-700">
                  <span>Subtotal Amount:</span>
                  <span>৳{getSubtotal().toFixed(2)}</span>
                </div>
                {activeTab.selectedCustomerId && (
                  <div className="flex justify-between">
                    <span>Customer: </span>
                    <span>{activeTab.customerName}</span>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 flex space-x-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowHoldBillModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={holdingBill || !holdNotes.trim() || activeTab.cart.length === 0}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white rounded-xl text-sm font-semibold transition-colors shadow flex items-center space-x-1.5"
                >
                  {holdingBill ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Hold Bill</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- RESUME HELD BILLS MODAL --- */}
      {showHeldBillsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Resume Held Bills</h3>
                <p className="text-xs text-slate-400 mt-0.5">Select a suspended cart to load back into checkout</p>
              </div>
              <button
                type="button"
                onClick={() => setShowHeldBillsModal(false)} 
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* List Container */}
            <div className="mt-4 flex-1 overflow-y-auto space-y-3 pr-1">
              {heldBills.filter(b => b.status === 'held').length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">
                  No active held bills found.
                </div>
              ) : (
                heldBills
                  .filter(b => b.status === 'held')
                  .map((bill) => {
                    let itemsList = [];
                    try {
                      itemsList = typeof bill.items === 'string' ? JSON.parse(bill.items) : bill.items;
                    } catch (e) {
                      itemsList = [];
                    }
                    const totalQty = itemsList.reduce((sum, item) => sum + item.quantity, 0);
                    const isDueTracker = itemsList.length === 0;

                    return (
                      <div 
                        key={bill.id} 
                        className="p-4 border border-slate-200 rounded-xl hover:border-indigo-300 transition-colors bg-slate-50/50 flex flex-col sm:flex-row justify-between sm:items-center gap-4 text-left"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-xs font-extrabold text-indigo-650 bg-indigo-50 px-2 py-0.5 rounded">
                              #{bill.id}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              {new Date(bill.created_at).toLocaleString()}
                            </span>
                            {isDueTracker ? (
                              <span className="bg-rose-50 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-100">
                                Due Tracker (৳{parseFloat(bill.due_amount || 0).toFixed(2)})
                              </span>
                            ) : (
                              <span className="bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-100">
                                Suspended Cart ({totalQty} items)
                              </span>
                            )}
                          </div>
                          <div className="text-sm font-semibold text-slate-700">
                            Ref: {bill.notes || 'No notes'}
                          </div>
                          <div className="text-xs text-slate-500">
                            Customer: {bill.customer_name || 'Walk-in'} | Cashier: {bill.staff_name || 'System'}
                          </div>
                          {!isDueTracker && itemsList.length > 0 && (
                            <div className="text-[11px] text-slate-450 mt-1 truncate max-w-md">
                              Items: {itemsList.map(item => `${item.product_name || 'Item'} (x${item.quantity})`).join(', ')}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto">
                          <button
                            type="button"
                            onClick={() => handleResumeHeldBill(bill)}
                            disabled={isDueTracker}
                            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-2 px-4 rounded-xl text-xs shadow-sm transition-colors"
                            title={isDueTracker ? "Cannot resume a due payment tracker here" : "Resume Cart"}
                          >
                            Resume
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteHeldBill(bill.id)}
                            className="text-rose-600 hover:text-rose-900 hover:bg-rose-50 border border-rose-100 p-2 rounded-xl transition-colors"
                            title="Discard Held Bill"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHeldBillsModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );

  // --- SUB-COMPONENT: CART PANEL DETAILS ---
  function renderCartPanelContent() {
    if (!activeTab) return null; 

    return (
      <div className="flex flex-col h-full overflow-hidden">

        {/* Customer & Cart items header */}
        <div className="p-4 border-b border-slate-100 bg-slate-50 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Select Customer
            </label>
            <select
              value={activeTab.selectedCustomerId}
              onChange={(e) => updateActiveTabState('selectedCustomerId', e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Walk-in Customer</option>
              {customers.map(c => {
                const balance = parseFloat(c.due_balance || 0);
                const balanceStr = balance > 0 ? ` [Due: ৳${balance.toFixed(2)}]` : '';
                return (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone && c.phone !== '-' ? `(${c.phone})` : ''}{balanceStr}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="border-t border-slate-200/60 pt-3 space-y-2.5">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Customer Details
            </h4>

{activeTab.selectedCustomerId && (() => {
               const selected = customers.find(c => c.id === parseInt(activeTab.selectedCustomerId));
               const balance = parseFloat(selected?.due_balance || 0);
               const reduceDue = parseFloat(activeTab.reduceDueAmount || 0);
               if (balance > 0) {
                 return (
                   <div className="bg-rose-50 border border-rose-100 rounded-lg p-2 space-y-2 text-xs text-rose-700">
                     <div className="flex justify-between">
                       <span className="font-medium">Outstanding Due Balance:</span>
                       <span className="font-bold">৳{balance.toFixed(2)}</span>
                     </div>
                     <div className="flex justify-between items-center pt-1 border-t border-rose-200">
                       <span className="font-medium">Collect Due Payment:</span>
                       <div className="flex items-center space-x-2">
                         <input
                           type="number"
                           min="0"
                           step="0.01"
                           max={balance}
                           value={reduceDue > 0 ? reduceDue : ''}
                           onChange={(e) => {
                             const val = parseFloat(e.target.value) || 0;
                             const cappedVal = Math.min(val, balance);
                             updateActiveTabState('reduceDueAmount', cappedVal);
                             updateActiveTabState('paidAmount', '');
                             updateActiveTabState('isPaidTouched', false);
                           }}
                           placeholder="0.00"
                           className="w-24 border border-rose-300 rounded px-2 py-1 text-right font-semibold text-rose-700 bg-white focus:outline-none focus:ring-1 focus:ring-rose-500"
                         />
                         <span className="text-[11px] font-bold">৳</span>
                       </div>
                     </div>
                     {reduceDue > 0 && (
                       <div className="text-[10px] text-rose-600 text-right">
                         Applied: ৳{reduceDue.toFixed(2)} from due balance
                       </div>
                     )}
                   </div>
                 );
               }
               return null;
             })()}

            <div className="grid grid-cols-1 gap-2">
              <div>
                <input
                  type="text"
                  placeholder="Customer Name"
                  value={activeTab.customerName}
                  onChange={(e) => updateActiveTabState('customerName', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Phone Number"
                  value={activeTab.customerPhone}
                  onChange={(e) => {
                    updateActiveTabState('customerPhone', e.target.value);
                    if (activeTab.selectedCustomerId !== '') {
                      updateActiveTabState('selectedCustomerId', '');
                    }
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />

                {/* Autocomplete Customer Suggestions */}
                {activeTab.selectedCustomerId === '' && activeTab.customerPhone.trim() !== '' && (() => {
                  const query = activeTab.customerPhone.replace(/[^0-9]/g, '');
                  const suggestions = customers.filter(c =>
                    c.phone && c.phone.replace(/[^0-9]/g, '').includes(query)
                  );
                  if (suggestions.length === 0) return null;
                  return (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-40 overflow-y-auto divide-y divide-slate-100">
                      {suggestions.map(c => (
                        <div
                          key={c.id}                          onClick={() => updateActiveTabState('selectedCustomerId', c.id)}
                          className="p-2 px-3 hover:bg-indigo-50 cursor-pointer text-left transition-colors"
                        >
                          <div className="text-xs font-semibold text-slate-800">{c.name}</div>
                          <div className="text-[10px] text-slate-500 flex justify-between mt-0.5">
                            <span>Phone: {c.phone}</span>
                            {c.address && <span className="truncate max-w-[120px]">Loc: {c.address}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div>
                <input
                  type="text"
                  placeholder="Address"
                  value={activeTab.customerAddress}
                  onChange={(e) => updateActiveTabState('customerAddress', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Checkbox for saving / syncing to database */}
            {((activeTab.selectedCustomerId === '' && activeTab.customerName.trim() !== '') ||
              (activeTab.selectedCustomerId !== '' && (
                (() => {
                  const selected = customers.find(c => c.id === parseInt(activeTab.selectedCustomerId));
                  return selected && (
                    activeTab.customerName !== (selected.name || '') ||
                    activeTab.customerPhone !== (selected.phone || '') ||
                    activeTab.customerAddress !== (selected.address || '')
                  );
                })()
              ))) && (
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={activeTab.syncToDirectory}
                  onChange={(e) => updateActiveTabState('syncToDirectory', e.target.checked)}
                  className="w-3.5 h-3.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
                <span className="text-xs text-indigo-600 font-medium">
                  {activeTab.selectedCustomerId === ''
                    ? 'Save as new customer in directory' 
                    : 'Sync profile updates to directory'}
                </span>
              </label>
            )}
          </div>
        </div>

        {/* Selected products scrollpane */}
        <div className="flex-1 overflow-y-auto p-4 divide-y divide-slate-100 min-h-0">
          {activeTab.cart.length === 0 ? (
            <div className="h-full flex flex-col justify-center items-center text-slate-400 py-12">
              <svg className="w-10 h-10 mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              <p className="text-sm font-medium">Cart is empty</p>
            </div>
          ) : (
            activeTab.cart.map((item) => (
              <div key={item.id} className="py-3 flex items-center justify-between first:pt-0 last:pb-0">
                <div className="min-w-0 pr-3">
                  <h4 className="text-sm font-semibold text-slate-800 truncate">{item.name}</h4>
                  <span className="text-xs text-slate-500">৳{parseFloat(item.price).toFixed(2)}</span>
                </div>

                <div className="flex items-center space-x-3">
                  {/* Quantity adjustments */}
                  <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50 overflow-hidden">
                    <button
                      onClick={() => updateQuantity(item.id, -1)}
                      className="px-2 py-1 hover:bg-slate-200 text-slate-600 transition-colors font-bold"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="1"
                      max={item.stock_quantity}
                      value={item.quantity === 0 ? '' : item.quantity}
                      onChange={(e) => handleQuantityInput(item.id, e.target.value)}
                      onBlur={() => handleQuantityBlur(item.id, item.quantity)}
                      className="w-10 text-center text-xs font-bold text-slate-700 bg-transparent border-0 focus:ring-0 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      onClick={() => updateQuantity(item.id, 1)}
                      className="px-2 py-1 hover:bg-slate-200 text-slate-600 transition-colors font-bold"
                    >
                      +
                    </button>
                  </div>
                  
                  {/* Clear line item */}
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors"
                    title="Remove Item"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Calculation summary + Pay trigger button */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-3 shrink-0 ">
          <div className="space-y-1.5 text-xs text-slate-600">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-semibold">৳{getSubtotal().toFixed(2)}</span>
            </div>
            
            {/* Discount Manual Inputs */}
            <div className="flex justify-between items-center">
              <span>Discount (%)</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={activeTab.discountPercent}
                onChange={(e) => updateActiveTabState('discountPercent', Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                className="w-20 border border-slate-200 rounded px-1.5 py-0.5 text-right font-medium text-slate-700 bg-white"
              />
            </div>
            {getDiscountAmount() > 0 && (
              <div className="flex justify-between text-xs text-rose-500">
                <span>Discounted Amount</span>
                <span>-৳{getDiscountAmount().toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between">
              <span>Tax ({(taxRate * 100).toString()}%)</span>
              <span className="font-semibold">৳{getTax().toFixed(2)}</span>
            </div>

{parseFloat(activeTab.reduceDueAmount || 0) > 0 && (
               <div className="flex justify-between items-center bg-rose-50 border border-rose-100 rounded-lg p-2.5 text-rose-800 font-medium">
                 <span className="flex items-center">
                   <svg className="w-3.5 h-3.5 mr-1 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                   </svg>
                   Due Balance Payment
                 </span>
                 <div className="flex items-center space-x-1.5">
                   <span className="font-bold">৳{parseFloat(activeTab.reduceDueAmount).toFixed(2)}</span>
                   <button
                     type="button"
                     onClick={() => {
                       updateActiveTabState('reduceDueAmount', 0);
                       updateActiveTabState('isPaidTouched', false);
                     }}
                     className="text-rose-400 hover:text-rose-600 font-extrabold text-sm px-1"
                     title="Remove Due Payment"
                   >
                     ×
                   </button>
                 </div>
               </div>
             )}

            <div className="flex justify-between text-base font-extrabold text-slate-800 border-t border-slate-200/60 pt-2">
              <span>Final Total</span>
              <span className="text-indigo-600">৳{getFinalTotal().toFixed(2)}</span>
            </div>

            {/* Amount Paid input */}
            <div className="flex justify-between items-center border-t border-slate-200/60 pt-2">
              <span className="font-semibold">Amount Paid</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={activeTab.paidAmount}
                onChange={(e) => {
                  updateActiveTabState('paidAmount', e.target.value);
                  updateActiveTabState('isPaidTouched', true);
                }}
                placeholder={getFinalTotal().toFixed(2)}
                className="w-24 border border-slate-200 rounded px-1.5 py-0.5 text-right font-semibold text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

              {activeTab && (() => {
              const finalTotal = getFinalTotal();
              const parsedPaid = activeTab.paidAmount !== '' ? parseFloat(activeTab.paidAmount) : finalTotal;
              const dueAmount = finalTotal - parsedPaid;
              if (dueAmount > 0) {
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-2 space-y-1 text-xs text-amber-800">
                    <div className="flex justify-between">
                      <span className="font-medium">Outstanding Due:</span>
                      <span className="font-bold">৳{dueAmount.toFixed(2)}</span>
                    </div>
                    <div className="text-[10px] text-amber-600 font-semibold text-right">
                      * Customer Profile Required
                    </div>
                  </div>
                );
              }
              return null;
            })()}
          </div>

          {/* Payment Method Selector */}
          <div className="pt-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Payment Method
            </label>
            <div className="grid grid-cols-3 gap-2">
              {['cash', 'card', 'mobile_pay'].map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => updateActiveTabState('paymentMethod', method)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold border text-center transition-all ${
                    activeTab.paymentMethod === method
                      ? 'bg-slate-600 border-indigo-600 text-white shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {method === 'mobile_pay' ? 'Mobile' : method.charAt(0).toUpperCase() + method.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Action Triggers */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <button
              type="button"
              onClick={() => { if (activeTab.cart.length > 0) setShowHoldBillModal(true); }}
              disabled={activeTab.cart.length === 0}
              className="col-span-1 bg-amber-50 hover:bg-amber-100 disabled:bg-slate-100 disabled:text-slate-400 text-amber-700 border border-amber-200 disabled:border-slate-200 font-bold py-3 px-2 rounded-xl transition-colors flex justify-center items-center space-x-1.5"
              title="Hold Cart"
            >
              <svg className="w-4 h-4 text-amber-600 disabled:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs">Hold Bill</span>
            </button>
            <button
              onClick={handleCheckout}
              disabled={activeTab.cart.length === 0 || submitting}
              className="col-span-2 bg-slate-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-colors flex justify-center items-center space-x-2"
            >
              {submitting ? (
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
              ) : (
                <>
                  <span>Complete Checkout</span>
                  <span className="font-extrabold bg-indigo-500 px-2 py-0.5 rounded text-xs">
                    ৳{getFinalTotal().toFixed(2)}
                  </span>
                </>
              )}
            </button>
          </div>

        </div>
      </div>
    );
  }
}
