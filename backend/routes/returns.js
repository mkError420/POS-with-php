const express = require('express');
const db = require('../config/db');
const { authenticate, authorize, enforceTenant } = require('../middleware/auth');
const { normalizeRefundMethod } = require('../utils/refund-methods');

const router = express.Router();

router.use(authenticate);
router.use(enforceTenant);

/**
 * @route   POST /api/returns
 * @desc    Record a customer product return
 * @access  Private (shop_admin, shop_staff)
 */
router.post('/', authorize(['shop_admin', 'shop_staff']), async (req, res) => {
  const shopId = req.shopId;
  const { customer_id, sale_id, product_id, quantity, refund_amount, refund_method, notes, deduct_from_due = 0 } = req.body;

  if (!product_id || !quantity || quantity <= 0 || refund_amount === undefined || refund_amount < 0) {
    return res.status(400).json({ error: 'Please provide product, valid quantity and refund amount.' });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const normalizedRefundMethod = normalizeRefundMethod(refund_method, { deductFromDue: deduct_from_due > 0 });

    // Verify product belongs to this shop
    const [productRows] = await connection.query(
      'SELECT id, name, price, stock_quantity FROM products WHERE id = ? AND shop_id = ? FOR UPDATE',
      [product_id, shopId]
    );

    if (productRows.length === 0) {
      throw new Error('Product not found in this shop.');
    }

    const product = productRows[0];

    // If sale_id is provided, verify it belongs to this shop and contains this product
    if (sale_id) {
      const [saleRows] = await connection.query(
        'SELECT id FROM sales WHERE id = ? AND shop_id = ?',
        [sale_id, shopId]
      );
      if (saleRows.length === 0) {
        throw new Error('Sale transaction not found in this shop.');
      }

      const [saleItemRows] = await connection.query(
        'SELECT quantity FROM sale_items WHERE sale_id = ? AND product_id = ? AND shop_id = ?',
        [sale_id, product_id, shopId]
      );
      if (saleItemRows.length === 0) {
        throw new Error('This product was not part of the specified sale transaction.');
      }

      const soldQty = saleItemRows.reduce((sum, item) => sum + item.quantity, 0);
      const [returnRows] = await connection.query(
        'SELECT COALESCE(SUM(quantity), 0) AS returned_qty FROM customer_returns WHERE shop_id = ? AND sale_id = ? AND product_id = ?',
        [shopId, sale_id, product_id]
      );
      const alreadyReturnedQty = parseInt(returnRows[0].returned_qty || 0, 10);
      const maxReturnQty = soldQty - alreadyReturnedQty;
      if (quantity > maxReturnQty) {
        throw new Error(`Cannot return more items than purchased and not yet returned (${maxReturnQty}).`);
      }
    }

    // If customer_id is provided, verify it belongs to this shop
    if (customer_id) {
      const [customerRows] = await connection.query(
        'SELECT id, due_balance FROM customers WHERE id = ? AND shop_id = ? FOR UPDATE',
        [customer_id, shopId]
      );
      if (customerRows.length === 0) {
        throw new Error('Customer profile not found in this shop.');
      }

      // If user selected deduct_from_due, deduct it from customer's due balance
      if (deduct_from_due && deduct_from_due > 0) {
        const customer = customerRows[0];
        const deduction = Math.min(parseFloat(refund_amount), parseFloat(customer.due_balance));
        if (deduction > 0) {
          await connection.query(
            'UPDATE customers SET due_balance = due_balance - ? WHERE id = ? AND shop_id = ?',
            [deduction, customer_id, shopId]
          );
        }
      }
    }

    // Record the return in customer_returns
    const [result] = await connection.query(
      `INSERT INTO customer_returns (shop_id, customer_id, sale_id, product_id, quantity, refund_amount, refund_method, notes, deduct_from_due)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [shopId, customer_id || null, sale_id || null, product_id, quantity, refund_amount, normalizedRefundMethod, notes || null, deduct_from_due ? 1 : 0]
    );

    // Auto add back to inventory
    await connection.query(
      'UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ? AND shop_id = ?',
      [quantity, product_id, shopId]
    );

    await connection.commit();

    res.status(201).json({
      message: 'Product return successfully processed and inventory updated.',
      return_id: result.insertId
    });

  } catch (error) {
    await connection.rollback();
    console.error('Record customer return error:', error);
    res.status(400).json({ error: error.message || 'Failed to process return.' });
  } finally {
    connection.release();
  }
});

/**
 * @route   GET /api/returns
 * @desc    Retrieve all product returns (tenant isolated)
 */
router.get('/', async (req, res) => {
  const shopId = req.shopId;
  const { start_date, end_date } = req.query;

  try {
    let sql = `
      SELECT cr.*, p.name AS product_name, p.sku AS product_sku, 
             c.name AS customer_name, s.created_at AS sale_date
      FROM customer_returns cr
      JOIN products p ON cr.product_id = p.id
      LEFT JOIN customers c ON cr.customer_id = c.id
      LEFT JOIN sales s ON cr.sale_id = s.id
      WHERE cr.shop_id = ?
    `;
    const params = [shopId];

    if (start_date && end_date) {
      sql += ' AND cr.created_at BETWEEN ? AND ?';
      params.push(`${start_date} 00:00:00`, `${end_date} 23:59:59`);
    }

    sql += ' ORDER BY cr.created_at DESC';

    const [returns] = await db.query(sql, params);
    res.json(returns);
  } catch (error) {
    console.error('Fetch returns error:', error);
    res.status(500).json({ error: 'Server error retrieving returns data.' });
  }
});

/**
 * @route   DELETE /api/returns/:id
 * @desc    Void/Delete a return record
 * @access  Private (shop_admin only)
 */
router.delete('/:id', authorize(['shop_admin']), async (req, res) => {
  const returnId = req.params.id;
  const shopId = req.shopId;

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Fetch return record and lock it
    const [returnRows] = await connection.query(
      'SELECT * FROM customer_returns WHERE id = ? AND shop_id = ? FOR UPDATE',
      [returnId, shopId]
    );

    if (returnRows.length === 0) {
      throw new Error('Return record not found.');
    }

    const ret = returnRows[0];

    // Deduct stock back from products
    const [prodRows] = await connection.query(
      'SELECT stock_quantity FROM products WHERE id = ? AND shop_id = ? FOR UPDATE',
      [ret.product_id, shopId]
    );
    if (prodRows.length > 0 && prodRows[0].stock_quantity < ret.quantity) {
      throw new Error('Cannot void return: current stock level is less than returned quantity.');
    }

    await connection.query(
      'UPDATE products SET stock_quantity = GREATEST(stock_quantity - ?, 0) WHERE id = ? AND shop_id = ?',
      [ret.quantity, ret.product_id, shopId]
    );

    // If it was deducted from customer due balance, restore the due balance
    if (ret.deduct_from_due && ret.customer_id) {
      await connection.query(
        'UPDATE customers SET due_balance = due_balance + ? WHERE id = ? AND shop_id = ?',
        [ret.refund_amount, ret.customer_id, shopId]
      );
    }

    // Delete the record
    await connection.query(
      'DELETE FROM customer_returns WHERE id = ? AND shop_id = ?',
      [returnId, shopId]
    );

    await connection.commit();

    res.json({ message: 'Return record voided and inventory reverted successfully.' });

  } catch (error) {
    await connection.rollback();
    console.error('Void return error:', error);
    res.status(400).json({ error: error.message || 'Failed to void return.' });
  } finally {
    connection.release();
  }
});

module.exports = router;
