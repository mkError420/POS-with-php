const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

/**
 * @route   GET /api/analytics/revenue
 * @desc    Fetch revenue breakdown: sales revenue, product buying costs, other costs, net profits
 * @access  Private (shop_admin)
 */
router.get('/revenue', authorize(['super_admin', 'shop_admin']), async (req, res) => {
  const shopId = req.shopId;
  const hasShop = shopId !== null && shopId !== undefined;
  const { start_date, end_date } = req.query;

  try {
    // 1. Calculate Sales Revenue (Accrual & Cash Received)
    let salesQuery = 'SELECT SUM(final_amount) AS total_sales, SUM(paid_amount) AS total_paid, COUNT(id) AS sales_count FROM sales WHERE ' + (hasShop ? 'shop_id = ?' : '1=1');
    const salesParams = hasShop ? [shopId] : [];
    if (start_date && end_date) {
      salesQuery += ' AND created_at BETWEEN ? AND ?';
      salesParams.push(`${start_date} 00:00:00`, `${end_date} 23:59:59`);
    }
    const [salesRows] = await db.query(salesQuery, salesParams);
    const totalSales = parseFloat(salesRows[0].total_sales || 0);
    const totalSalesCash = parseFloat(salesRows[0].total_paid || 0);
    const salesCount = parseInt(salesRows[0].sales_count || 0);

    // 2. Calculate Cost of Goods Sold (COGS) based on actual sales items and cost price of products
    let cogsQuery = `
      SELECT SUM(si.quantity * p.cost_price) AS cogs 
      FROM sale_items si 
      JOIN products p ON si.product_id = p.id
      JOIN sales s ON si.sale_id = s.id
      WHERE ` + (hasShop ? 'si.shop_id = ?' : '1=1');
    const cogsParams = hasShop ? [shopId] : [];
    if (start_date && end_date) {
      cogsQuery += ' AND s.created_at BETWEEN ? AND ?';
      cogsParams.push(`${start_date} 00:00:00`, `${end_date} 23:59:59`);
    }
    const [cogsRows] = await db.query(cogsQuery, cogsParams);
    const totalCOGS = parseFloat(cogsRows[0].cogs || 0);

    // 3. Calculate Product Purchasing Costs (Received & Ordered POs - Accrual vs Cash)
    let poQuery = "SELECT SUM(total_amount) AS total_purchased, SUM(paid_amount) AS total_paid FROM purchase_orders WHERE " + (hasShop ? "shop_id = ?" : "1=1") + " AND status IN ('ordered', 'received')";
    const poParams = hasShop ? [shopId] : [];
    if (start_date && end_date) {
      poQuery += ' AND (received_date BETWEEN ? AND ? OR (received_date IS NULL AND order_date BETWEEN ? AND ?))';
      poParams.push(`${start_date} 00:00:00`, `${end_date} 23:59:59`, `${start_date} 00:00:00`, `${end_date} 23:59:59`);
    }
    const [poRows] = await db.query(poQuery, poParams);
    const totalPurchasing = parseFloat(poRows[0].total_purchased || 0);
    const totalPurchasingCash = parseFloat(poRows[0].total_paid || 0);

    // 4. Calculate Other Costs
    let otherQuery = 'SELECT SUM(amount) AS total_other_costs FROM other_costs WHERE ' + (hasShop ? 'shop_id = ?' : '1=1');
    const otherParams = hasShop ? [shopId] : [];
    if (start_date && end_date) {
      otherQuery += ' AND cost_date BETWEEN ? AND ?';
      otherParams.push(start_date, end_date);
    }
    const [otherRows] = await db.query(otherQuery, otherParams);
    const totalOther = parseFloat(otherRows[0].total_other_costs || 0);

    // 5. Calculate Wastage Loss (Cost of Damage/Wastage)
    let wastageQuery = 'SELECT SUM(cost_loss) AS total_wastage FROM wastages WHERE ' + (hasShop ? 'shop_id = ?' : '1=1');
    const wastageParams = hasShop ? [shopId] : [];
    if (start_date && end_date) {
      wastageQuery += ' AND adjusted_at BETWEEN ? AND ?';
      wastageParams.push(start_date, end_date);
    }
    const [wastageRows] = await db.query(wastageQuery, wastageParams);
    const totalWastage = parseFloat(wastageRows[0].total_wastage || 0);

    // 6. Calculate Supplier Due Balance (Outstanding credit/payable)
    let supplierDueQuery = 'SELECT SUM(due_balance) AS total_due FROM suppliers WHERE ' + (hasShop ? 'shop_id = ?' : '1=1');
    const [supplierDueRows] = await db.query(supplierDueQuery, hasShop ? [shopId] : []);
    const totalSupplierDue = parseFloat(supplierDueRows[0].total_due || 0);

    // 7. Calculate Customer Due Balance (Outstanding receivables/dues)
    let customerDueQuery = 'SELECT SUM(due_balance) AS total_due FROM customers WHERE ' + (hasShop ? 'shop_id = ?' : '1=1');
    const [customerDueRows] = await db.query(customerDueQuery, hasShop ? [shopId] : []);
    const totalCustomerDue = parseFloat(customerDueRows[0].total_due || 0);

    // 8. Calculate Customer Returns (Refunds)
    let returnsQuery = 'SELECT SUM(refund_amount) AS total_refunds FROM customer_returns WHERE ' + (hasShop ? 'shop_id = ?' : '1=1');
    const returnsParams = hasShop ? [shopId] : [];
    if (start_date && end_date) {
      returnsQuery += ' AND created_at BETWEEN ? AND ?';
      returnsParams.push(`${start_date} 00:00:00`, `${end_date} 23:59:59`);
    }
    const [returnsRows] = await db.query(returnsQuery, returnsParams);
    const totalRefunds = parseFloat(returnsRows[0].total_refunds || 0);

    // 9. Calculate Returned COGS to adjust Net Profit (reversing cost of items added back to inventory)
    let returnedCogsQuery = `
      SELECT SUM(cr.quantity * p.cost_price) AS returned_cogs 
      FROM customer_returns cr 
      JOIN products p ON cr.product_id = p.id
      WHERE ` + (hasShop ? 'cr.shop_id = ?' : '1=1');
    const returnedCogsParams = hasShop ? [shopId] : [];
    if (start_date && end_date) {
      returnedCogsQuery += ' AND cr.created_at BETWEEN ? AND ?';
      returnedCogsParams.push(`${start_date} 00:00:00`, `${end_date} 23:59:59`);
    }
    const [returnedCogsRows] = await db.query(returnedCogsQuery, returnedCogsParams);
    const totalReturnedCOGS = parseFloat(returnedCogsRows[0].returned_cogs || 0);

    // Calculate Net Profits (including Customer Returns and COGS reversal)
    const netProfitCOGS = totalSales - (totalCOGS - totalReturnedCOGS) - totalOther - totalWastage - totalRefunds;
    const netProfitCashflow = totalSalesCash - totalPurchasingCash - totalOther - totalWastage - totalRefunds;

    // Calculate 7-Day Trend for Trading Profitability (COGS Basis) and Cashflow
    const trendMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      trendMap[dateStr] = { 
        date: dateStr, 
        sales_revenue: 0, 
        sales_cash_received: 0, 
        cost_of_goods_sold: 0, 
        customer_returns: 0,
        returned_cogs: 0,
        other_costs: 0, 
        wastage_loss: 0, 
        inventory_purchasing_cost: 0, 
        inventory_purchasing_cash_paid: 0, 
        net_profit_cogs: 0, 
        net_profit_cashflow: 0 
      };
    }

    // Query daily sales
    let trendSalesQuery = 'SELECT DATE_FORMAT(created_at, "%Y-%m-%d") AS date, SUM(final_amount) AS revenue, SUM(paid_amount) AS cash_received FROM sales WHERE ' + (hasShop ? 'shop_id = ?' : '1=1') + ' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) GROUP BY DATE(created_at)';
    const [trendSalesRows] = await db.query(trendSalesQuery, salesParams.slice(0, hasShop ? 1 : 0));
    trendSalesRows.forEach(row => {
      if (trendMap[row.date]) {
        trendMap[row.date].sales_revenue = parseFloat(row.revenue || 0);
        trendMap[row.date].sales_cash_received = parseFloat(row.cash_received || 0);
      }
    });

    // Query daily COGS
    let trendCogsQuery = `
      SELECT DATE_FORMAT(s.created_at, "%Y-%m-%d") AS date, SUM(si.quantity * p.cost_price) AS cogs 
      FROM sale_items si 
      JOIN products p ON si.product_id = p.id
      JOIN sales s ON si.sale_id = s.id
      WHERE ` + (hasShop ? 'si.shop_id = ?' : '1=1') + ` AND s.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE(s.created_at)`;
    const [trendCogsRows] = await db.query(trendCogsQuery, cogsParams.slice(0, hasShop ? 1 : 0));
    trendCogsRows.forEach(row => {
      if (trendMap[row.date]) trendMap[row.date].cost_of_goods_sold = parseFloat(row.cogs || 0);
    });

    // Query daily Customer Returns
    let trendReturnsQuery = 'SELECT DATE_FORMAT(created_at, "%Y-%m-%d") AS date, SUM(refund_amount) AS refunds FROM customer_returns WHERE ' + (hasShop ? 'shop_id = ?' : '1=1') + ' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) GROUP BY DATE(created_at)';
    const [trendReturnsRows] = await db.query(trendReturnsQuery, returnsParams.slice(0, hasShop ? 1 : 0));
    trendReturnsRows.forEach(row => {
      if (trendMap[row.date]) trendMap[row.date].customer_returns = parseFloat(row.refunds || 0);
    });

    // Query daily Returned COGS
    let trendReturnedCogsQuery = `
      SELECT DATE_FORMAT(cr.created_at, "%Y-%m-%d") AS date, SUM(cr.quantity * p.cost_price) AS returned_cogs 
      FROM customer_returns cr 
      JOIN products p ON cr.product_id = p.id
      WHERE ` + (hasShop ? 'cr.shop_id = ?' : '1=1') + ` AND cr.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE(cr.created_at)`;
    const [trendReturnedCogsRows] = await db.query(trendReturnedCogsQuery, returnedCogsParams.slice(0, hasShop ? 1 : 0));
    trendReturnedCogsRows.forEach(row => {
      if (trendMap[row.date]) trendMap[row.date].returned_cogs = parseFloat(row.returned_cogs || 0);
    });

    // Query daily Other Costs
    let trendOtherQuery = 'SELECT DATE_FORMAT(cost_date, "%Y-%m-%d") AS date, SUM(amount) AS other FROM other_costs WHERE ' + (hasShop ? 'shop_id = ?' : '1=1') + ' AND cost_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) GROUP BY DATE(cost_date)';
    const [trendOtherRows] = await db.query(trendOtherQuery, otherParams.slice(0, hasShop ? 1 : 0));
    trendOtherRows.forEach(row => {
      if (trendMap[row.date]) trendMap[row.date].other_costs = parseFloat(row.other || 0);
    });

    // Query daily Wastages
    let trendWastageQuery = 'SELECT DATE_FORMAT(adjusted_at, "%Y-%m-%d") AS date, SUM(cost_loss) AS wastage FROM wastages WHERE ' + (hasShop ? 'shop_id = ?' : '1=1') + ' AND adjusted_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) GROUP BY DATE(adjusted_at)';
    const [trendWastageRows] = await db.query(trendWastageQuery, wastageParams.slice(0, hasShop ? 1 : 0));
    trendWastageRows.forEach(row => {
      if (trendMap[row.date]) trendMap[row.date].wastage_loss = parseFloat(row.wastage || 0);
    });

    // Query daily PO purchasing
    let trendPoQuery = 'SELECT DATE_FORMAT(COALESCE(received_date, order_date), "%Y-%m-%d") AS date, SUM(total_amount) AS total, SUM(paid_amount) AS cash_paid FROM purchase_orders WHERE ' + (hasShop ? 'shop_id = ?' : '1=1') + ' AND status IN (\'ordered\', \'received\') AND COALESCE(received_date, order_date) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) GROUP BY DATE(COALESCE(received_date, order_date))';
    const [trendPoRows] = await db.query(trendPoQuery, poParams.slice(0, hasShop ? 1 : 0));
    trendPoRows.forEach(row => {
      if (trendMap[row.date]) {
        trendMap[row.date].inventory_purchasing_cost = parseFloat(row.total || 0);
        trendMap[row.date].inventory_purchasing_cash_paid = parseFloat(row.cash_paid || 0);
      }
    });

    // Calculate daily Net Profit (Trading & Cashflow)
    Object.keys(trendMap).forEach(dateStr => {
      const d = trendMap[dateStr];
      const dailyRefunds = d.customer_returns || 0;
      const dailyReturnedCOGS = d.returned_cogs || 0;
      d.net_profit_cogs = d.sales_revenue - (d.cost_of_goods_sold - dailyReturnedCOGS) - d.other_costs - d.wastage_loss - dailyRefunds;
      d.net_profit_cashflow = d.sales_cash_received - d.inventory_purchasing_cash_paid - d.other_costs - d.wastage_loss - dailyRefunds;
    });

    const trend = Object.values(trendMap);

    // 10. Calculate Manual Sales Order Metrics
    let manualOrdersQuery = `
      SELECT 
        COUNT(CASE WHEN mo.status = 'pending' THEN 1 END) AS pending_count,
        COUNT(CASE WHEN mo.status = 'confirmed' THEN 1 END) AS confirmed_count,
        COALESCE(SUM(CASE WHEN mo.status = 'confirmed' THEN s.final_amount END), 0) AS confirmed_value,
        COALESCE(SUM(CASE WHEN mo.status = 'confirmed' THEN s.paid_amount END), 0) AS confirmed_paid,
        COALESCE(SUM(CASE WHEN mo.status = 'confirmed' THEN s.due_amount END), 0) AS confirmed_due
      FROM manual_orders mo
      LEFT JOIN sales s ON mo.sale_id = s.id
      WHERE ` + (hasShop ? 'mo.shop_id = ?' : '1=1');
    const manualParams = hasShop ? [shopId] : [];
    if (start_date && end_date) {
      manualOrdersQuery += ' AND mo.created_at BETWEEN ? AND ?';
      manualParams.push(`${start_date} 00:00:00`, `${end_date} 23:59:59`);
    }
    const [manualRows] = await db.query(manualOrdersQuery, manualParams);
    
    // Calculate value of pending drafts
    let pendingValueQuery = `
      SELECT COALESCE(SUM(moi.subtotal), 0) as pending_value
      FROM manual_order_items moi
      JOIN manual_orders mo ON moi.order_id = mo.id
      WHERE mo.status = 'pending' AND ` + (hasShop ? 'mo.shop_id = ?' : '1=1');
    const pendingParams = hasShop ? [shopId] : [];
    if (start_date && end_date) {
      pendingValueQuery += ' AND mo.created_at BETWEEN ? AND ?';
      pendingParams.push(`${start_date} 00:00:00`, `${end_date} 23:59:59`);
    }
    const [pendingValueRows] = await db.query(pendingValueQuery, pendingParams);

    const manualMetrics = {
      pending_count: parseInt(manualRows[0].pending_count || 0),
      confirmed_count: parseInt(manualRows[0].confirmed_count || 0),
      confirmed_value: parseFloat(manualRows[0].confirmed_value || 0),
      confirmed_paid: parseFloat(manualRows[0].confirmed_paid || 0),
      confirmed_due: parseFloat(manualRows[0].confirmed_due || 0),
      pending_value: parseFloat(pendingValueRows[0].pending_value || 0)
    };

    res.json({
      sales_revenue: totalSales,
      sales_cash_received: totalSalesCash,
      sales_count: salesCount,
      cost_of_goods_sold: totalCOGS - totalReturnedCOGS,
      customer_returns: totalRefunds,
      inventory_purchasing_cost: totalPurchasing,
      inventory_purchasing_cash_paid: totalPurchasingCash,
      supplier_due: totalSupplierDue,
      customer_due: totalCustomerDue,
      other_costs: totalOther,
      wastage_loss: totalWastage,
      net_profit_cogs: netProfitCOGS,
      net_profit_cashflow: netProfitCashflow,
      trend: trend,
      manual_orders: manualMetrics
    });
  } catch (error) {
    console.error('Revenue breakdown error:', error);
    res.status(500).json({ error: 'Server error generating revenue analytics.' });
  }
});

/**
 * @route   GET /api/analytics
 * @desc    Fetch analytics dashboard data.
 *          Super Admin: Global overview (total shops, global revenue, active users).
 *          Shop Admin/Staff: Tenant dashboard metrics (revenue, sales count, low stock warnings).
 * @access  Private
 */
router.get('/', async (req, res) => {
  const { role, shop_id } = req.user;

  try {
    if (role === 'super_admin') {
      // 1. Super Admin Global Analytics
      const [shopStats] = await db.query(
        'SELECT COUNT(*) as total_shops, SUM(CASE WHEN status = "active" THEN 1 ELSE 0 END) as active_shops FROM shops'
      );
      
      const [userStats] = await db.query(
        'SELECT COUNT(*) as total_users FROM users WHERE role != "super_admin"'
      );

      const [salesStats] = await db.query(
        'SELECT COUNT(*) as total_sales, SUM(final_amount) as global_revenue FROM sales'
      );

      // Fetch sales trend grouped by shop name
      const [tenantSales] = await db.query(`
        SELECT sh.name as shop_name, COUNT(s.id) as sales_count, SUM(s.final_amount) as shop_revenue
        FROM shops sh
        LEFT JOIN sales s ON sh.id = s.shop_id
        GROUP BY sh.id
        ORDER BY shop_revenue DESC
      `);

      return res.json({
        dashboard_type: 'super_admin',
        metrics: {
          total_shops: shopStats[0].total_shops,
          active_shops: shopStats[0].active_shops,
          total_users: userStats[0].total_users,
          total_sales: salesStats[0].total_sales,
          global_revenue: parseFloat(salesStats[0].global_revenue || 0).toFixed(2)
        },
        tenant_breakdown: tenantSales
      });

    } else {
      // 2. Tenant Specific (Shop Admin & Staff) Analytics
      const shopId = req.shopId; // Locked by authenticate middleware

      const [salesStats] = await db.query(
        'SELECT COUNT(*) as sales_count, SUM(final_amount) as revenue FROM sales WHERE shop_id = ?',
        [shopId]
      );

      const [productStats] = await db.query(`
        SELECT COUNT(*) as total_products,
               SUM(CASE WHEN stock_quantity <= low_stock_threshold THEN 1 ELSE 0 END) as low_stock_count
        FROM products 
        WHERE shop_id = ?
      `, [shopId]);

      const [customerStats] = await db.query(
        'SELECT COUNT(*) as total_customers FROM customers WHERE shop_id = ?',
        [shopId]
      );

      // Get recent transaction feed
      const [recentSales] = await db.query(`
        SELECT s.id, s.final_amount, s.payment_method, s.created_at, u.name as staff_name 
        FROM sales s
        JOIN users u ON s.user_id = u.id
        WHERE s.shop_id = ? 
        ORDER BY s.created_at DESC 
        LIMIT 5
      `, [shopId]);

      // Get 7-day sales trend
      const [trendRows] = await db.query(`
        SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as sale_date,
               SUM(final_amount) as daily_revenue,
               COUNT(id) as daily_sales
        FROM sales
        WHERE shop_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        GROUP BY DATE(created_at)
        ORDER BY sale_date ASC
      `, [shopId]);

      // Populate last 7 days to guarantee 7 points even if some days have 0 sales
      const trendMap = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        trendMap[dateStr] = { date: dateStr, revenue: 0, sales_count: 0 };
      }

      trendRows.forEach(row => {
        if (trendMap[row.sale_date]) {
          trendMap[row.sale_date].revenue = parseFloat(row.daily_revenue || 0);
          trendMap[row.sale_date].sales_count = parseInt(row.daily_sales || 0);
        }
      });

      const salesTrend = Object.values(trendMap);

      return res.json({
        dashboard_type: 'tenant',
        metrics: {
          total_sales: salesStats[0].sales_count,
          revenue: parseFloat(salesStats[0].revenue || 0).toFixed(2),
          total_products: productStats[0].total_products,
          low_stock_alerts: productStats[0].low_stock_count || 0,
          total_customers: customerStats[0].total_customers
        },
        recent_sales: recentSales,
        sales_trend: salesTrend
      });
    }
  } catch (error) {
    console.error('Analytics fetch error:', error);
    res.status(500).json({ error: 'Server error generating dashboard analytics.' });
  }
});

/**
 * @route   GET /api/analytics/daily-products
 * @desc    Fetch aggregated product sales data for a given date range
 * @access  Private (shop_admin)
 */
router.get('/daily-products', authorize(['shop_admin']), async (req, res) => {
  const shopId = req.shopId;
  const { start_date, end_date } = req.query;

  if (!start_date || !end_date) {
    return res.status(400).json({ error: 'Please provide both a start and end date.' });
  }

  try {
    const sql = `
      SELECT 
        p.id as product_id,
        p.name as product_name,
        p.sku as product_sku,
        SUM(si.quantity) as total_quantity_sold,
        SUM(si.subtotal) as total_revenue
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      JOIN sales s ON si.sale_id = s.id
      WHERE si.shop_id = ? AND DATE(s.created_at) BETWEEN ? AND ?
      GROUP BY p.id, p.name, p.sku
      ORDER BY total_quantity_sold DESC
    `;

    const [productSales] = await db.query(sql, [shopId, start_date, end_date]);
    res.json(productSales);
  } catch (error) {
    console.error('Fetch daily product sales error:', error);
    res.status(500).json({ error: 'Server error retrieving daily product sales.' });
  }
});

module.exports = router;
