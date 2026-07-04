<?php
/**
 * Sale Controller
 */

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../middleware/auth.php';

class SaleController {

    public static function createSale($requestData) {
        Auth::authenticate();
        Auth::enforceTenant();
        Auth::authorize(['shop_admin', 'shop_staff']);

        $shopId = Auth::$shopId;
        $userId = Auth::$user['id'];

        $customerId = $requestData['customer_id'] ?? null;
        $items = $requestData['items'] ?? [];
        $discount = (float)($requestData['discount'] ?? 0);
        $tax = (float)($requestData['tax'] ?? 0);
        $paymentMethod = $requestData['payment_method'] ?? null;
        $reduceDueAmount = (float)($requestData['reduce_due_amount'] ?? 0);

        if (empty($items) && $reduceDueAmount <= 0) {
            Auth::jsonError('Checkout cart is empty.', 400);
        }

        if (empty($paymentMethod)) {
            Auth::jsonError('Please specify payment method.', 400);
        }

        try {
            DB::beginTransaction();

            $calculatedTotal = 0.00;
            $validatedItems = [];
            $stockAlerts = [];

            // 1. Validate products and lock rows to prevent race conditions on stock
            foreach ($items as $item) {
                $productId = $item['product_id'] ?? null;
                $quantity = (int)($item['quantity'] ?? 0);

                if (empty($productId) || $quantity <= 0) {
                    throw new \Exception("Invalid item details for product ID $productId.");
                }

                // SELECT FOR UPDATE to lock product row
                $stmt = DB::query(
                    'SELECT id, name, price, stock_quantity, low_stock_threshold FROM products WHERE id = ? AND shop_id = ? FOR UPDATE',
                    [$productId, $shopId]
                );
                $product = $stmt->fetch();

                if (!$product) {
                    throw new \Exception("Product with ID $productId not found in this shop.");
                }

                if ((int)$product['stock_quantity'] < $quantity) {
                    throw new \Exception("Insufficient stock for product \"{$product['name']}\". Available: {$product['stock_quantity']}, requested: $quantity.");
                }

                $unitPrice = (float)$product['price'];
                $subtotal = $unitPrice * $quantity;
                $calculatedTotal += $subtotal;

                $validatedItems[] = [
                    'product_id' => $productId,
                    'quantity' => $quantity,
                    'unit_price' => $unitPrice,
                    'subtotal' => $subtotal
                ];

                // Deduct stock quantity
                $newStock = (int)$product['stock_quantity'] - $quantity;
                DB::query(
                    'UPDATE products SET stock_quantity = ? WHERE id = ? AND shop_id = ?',
                    [$newStock, $productId, $shopId]
                );

                // Check low stock threshold
                if ($newStock <= (int)$product['low_stock_threshold']) {
                    $stockAlerts[] = [
                        'product_id' => $productId,
                        'name' => $product['name'],
                        'remaining_stock' => $newStock,
                        'threshold' => (int)$product['low_stock_threshold']
                    ];
                }
            }

            // 2. Fetch loyalty program settings
            $stmt = DB::query('SELECT loyalty_enabled, loyalty_point_earn_rate, loyalty_point_value FROM shops WHERE id = ?', [$shopId]);
            $shopSettings = $stmt->fetch() ?: [
                'loyalty_enabled' => 0,
                'loyalty_point_earn_rate' => 100.00,
                'loyalty_point_value' => 1.00
            ];

            $isLoyaltyEnabled = (int)$shopSettings['loyalty_enabled'] === 1;

            $redeemPoints = (int)($requestData['redeem_points'] ?? 0);
            $pointsRedeemedValue = 0.00;

            if ($isLoyaltyEnabled && $customerId && $redeemPoints > 0) {
                $cStmt = DB::query(
                    'SELECT loyalty_points FROM customers WHERE id = ? AND shop_id = ? FOR UPDATE',
                    [$customerId, $shopId]
                );
                $cust = $cStmt->fetch();

                if (!$cust) {
                    throw new \Exception('Customer not found for loyalty points redemption.');
                }

                $currentPoints = (int)$cust['loyalty_points'];
                if ($currentPoints < $redeemPoints) {
                    throw new \Exception("Insufficient loyalty points. Customer has $currentPoints, requested redemption of $redeemPoints.");
                }

                $pointsRedeemedValue = $redeemPoints * (float)$shopSettings['loyalty_point_value'];

                // Deduct loyalty points from customer
                DB::query(
                    'UPDATE customers SET loyalty_points = loyalty_points - ? WHERE id = ? AND shop_id = ?',
                    [$redeemPoints, $customerId, $shopId]
                );
            }

            $netAmount = $calculatedTotal - $discount - $pointsRedeemedValue;
            $finalAmount = max(0.00, $netAmount) + $tax + $reduceDueAmount;

            $paidAmount = isset($requestData['paid_amount']) ? (float)$requestData['paid_amount'] : $finalAmount;
            $dueAmount = $finalAmount - $paidAmount;

            if ($dueAmount > 0 && !$customerId) {
                throw new \Exception('Customer profile selection is required to record outstanding due balance.');
            }

            // Award loyalty points
            $pointsEarned = 0;
            if ($isLoyaltyEnabled && $customerId) {
                $earnRate = (float)$shopSettings['loyalty_point_earn_rate'] ?: 100.00;
                $pointsEarningBasis = $calculatedTotal - $discount - $pointsRedeemedValue;
                if ($pointsEarningBasis > 0) {
                    $pointsEarned = (int)floor($pointsEarningBasis / $earnRate);
                }
                if ($pointsEarned > 0) {
                    DB::query(
                        'UPDATE customers SET loyalty_points = loyalty_points + ? WHERE id = ? AND shop_id = ?',
                        [$pointsEarned, $customerId, $shopId]
                    );
                }
            }

            // Save sale header
            DB::query(
                'INSERT INTO sales (shop_id, customer_id, user_id, total_amount, discount, tax, final_amount, paid_amount, due_amount, payment_method, points_earned, points_redeemed, points_redeemed_value) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    $shopId,
                    $customerId ? (int)$customerId : null,
                    $userId,
                    $calculatedTotal,
                    $discount,
                    $tax,
                    $finalAmount,
                    $paidAmount,
                    $dueAmount,
                    $paymentMethod,
                    $pointsEarned,
                    $redeemPoints,
                    $pointsRedeemedValue
                ]
            );
            $saleId = DB::lastInsertId();

            // If a due payment is collected, decrement customer due_balance
            if ($reduceDueAmount > 0 && $customerId) {
                DB::query(
                    'UPDATE customers SET due_balance = due_balance - ? WHERE id = ? AND shop_id = ?',
                    [$reduceDueAmount, $customerId, $shopId]
                );
            }

            // If due_amount > 0, increment customer due_balance and create held bill
            if ($dueAmount > 0) {
                DB::query(
                    'UPDATE customers SET due_balance = due_balance + ? WHERE id = ? AND shop_id = ?',
                    [$dueAmount, $customerId, $shopId]
                );

                $cStmt = DB::query('SELECT name, phone, address FROM customers WHERE id = ? AND shop_id = ?', [$customerId, $shopId]);
                $cust = $cStmt->fetch();

                if ($cust) {
                    $note = "Due from Sale #$saleId";
                    $discountPercent = $calculatedTotal > 0 ? ($discount / $calculatedTotal) * 100 : 0.00;
                    
                    DB::query(
                        "INSERT INTO held_bills (shop_id, user_id, customer_id, customer_name, customer_phone, customer_address, discount_percent, notes, items, due_amount, status) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'held')",
                        [
                            $shopId,
                            $userId,
                            $customerId,
                            $cust['name'],
                            $cust['phone'] ?: null,
                            $cust['address'] ?: null,
                            $discountPercent,
                            $note,
                            json_encode($validatedItems),
                            $dueAmount
                        ]
                    );
                }
            }

            // Save line items
            foreach ($validatedItems as $item) {
                DB::query(
                    'INSERT INTO sale_items (shop_id, sale_id, product_id, quantity, unit_price, subtotal) 
                     VALUES (?, ?, ?, ?, ?, ?)',
                    [$shopId, $saleId, $item['product_id'], $item['quantity'], $item['unit_price'], $item['subtotal']]
                );
            }

            DB::commit();

            header('Content-Type: application/json');
            http_response_code(201);
            echo json_encode([
                'message' => 'Transaction completed successfully.',
                'sale_id' => (int)$saleId,
                'final_amount' => (float)$finalAmount,
                'points_earned' => $pointsEarned,
                'stock_alerts' => $stockAlerts
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            error_log('POS Checkout Transaction failed: ' . $e->getMessage());
            Auth::jsonError($e->getMessage(), 400);
        }
    }

    public static function listSales() {
        Auth::authenticate();
        Auth::enforceTenant();

        $shopId = Auth::$shopId;
        $startDate = $_GET['start_date'] ?? null;
        $endDate = $_GET['end_date'] ?? null;
        $productName = $_GET['product_name'] ?? null;

        try {
            $sql = "SELECT 
                        s.*, 
                        u.name as staff_name, 
                        c.name as customer_name,
                        (SELECT GROUP_CONCAT(p.name SEPARATOR ', ') FROM sale_items si JOIN products p ON si.product_id = p.id WHERE si.sale_id = s.id) as product_names
                    FROM sales s 
                    LEFT JOIN users u ON s.user_id = u.id 
                    LEFT JOIN customers c ON s.customer_id = c.id 
                    WHERE s.shop_id = ?";
            
            $params = [$shopId];

            if (!empty($startDate) && !empty($endDate)) {
                $sql .= ' AND DATE(s.created_at) BETWEEN ? AND ?';
                $params[] = "$startDate 00:00:00";
                $params[] = "$endDate 23:59:59";
            }

            if (!empty($productName)) {
                $sql .= ' AND EXISTS (SELECT 1 FROM sale_items si JOIN products p ON si.product_id = p.id WHERE si.sale_id = s.id AND p.name LIKE ?)';
                $params[] = "%$productName%";
            }

            $sql .= ' ORDER BY s.created_at DESC';

            $stmt = DB::query($sql, $params);
            $sales = $stmt->fetchAll();

            // Format numeric values
            foreach ($sales as &$s) {
                $s['id'] = (int)$s['id'];
                $s['shop_id'] = (int)$s['shop_id'];
                $s['customer_id'] = $s['customer_id'] !== null ? (int)$s['customer_id'] : null;
                $s['user_id'] = (int)$s['user_id'];
                $s['total_amount'] = (float)$s['total_amount'];
                $s['discount'] = (float)$s['discount'];
                $s['tax'] = (float)$s['tax'];
                $s['final_amount'] = (float)$s['final_amount'];
                $s['paid_amount'] = (float)$s['paid_amount'];
                $s['due_amount'] = (float)$s['due_amount'];
                $s['points_earned'] = (int)$s['points_earned'];
                $s['points_redeemed'] = (int)$s['points_redeemed'];
                $s['points_redeemed_value'] = (float)$s['points_redeemed_value'];
            }

            // Fetch and embed sale items for detailed list
            $saleIds = array_column($sales, 'id');
            if (!empty($saleIds)) {
                // In MySQL, to pass array in placeholders:
                $inQuery = implode(',', array_fill(0, count($saleIds), '?'));
                $iParams = array_merge($saleIds, [$shopId]);
                
                $stmt = DB::query(
                    "SELECT si.sale_id, si.quantity, p.name as product_name, p.unit 
                     FROM sale_items si 
                     JOIN products p ON si.product_id = p.id 
                     WHERE si.sale_id IN ($inQuery) AND si.shop_id = ?",
                    $iParams
                );
                $items = $stmt->fetchAll();

                foreach ($sales as &$sale) {
                    $sale['items'] = [];
                    foreach ($items as $item) {
                        if ((int)$item['sale_id'] === $sale['id']) {
                            $sale['items'][] = [
                                'product_name' => $item['product_name'],
                                'quantity' => (int)$item['quantity'],
                                'unit' => $item['unit']
                            ];
                        }
                    }
                }
            }

            header('Content-Type: application/json');
            echo json_encode($sales);

        } catch (\Exception $e) {
            error_log('Fetch sales error: ' . $e->getMessage());
            Auth::jsonError('Server error retrieving sales data.', 500);
        }
    }

    public static function getSale($id) {
        Auth::authenticate();
        Auth::enforceTenant();

        $saleId = (int)$id;
        $shopId = Auth::$shopId;

        try {
            $stmt = DB::query(
                "SELECT s.*, u.name as staff_name, 
                        c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
                        sh.name as shop_name, sh.phone as shop_phone, sh.address as shop_address, sh.email as shop_email
                 FROM sales s
                 LEFT JOIN users u ON s.user_id = u.id
                 LEFT JOIN customers c ON s.customer_id = c.id
                 LEFT JOIN shops sh ON s.shop_id = sh.id
                 WHERE s.id = ? AND s.shop_id = ?",
                [$saleId, $shopId]
            );
            $sale = $stmt->fetch();

            if (!$sale) {
                Auth::jsonError('Sale record not found or access denied.', 404);
            }

            $sale['id'] = (int)$sale['id'];
            $sale['shop_id'] = (int)$sale['shop_id'];
            $sale['customer_id'] = $sale['customer_id'] !== null ? (int)$sale['customer_id'] : null;
            $sale['user_id'] = (int)$sale['user_id'];
            $sale['total_amount'] = (float)$sale['total_amount'];
            $sale['discount'] = (float)$sale['discount'];
            $sale['tax'] = (float)$sale['tax'];
            $sale['final_amount'] = (float)$sale['final_amount'];
            $sale['paid_amount'] = (float)$sale['paid_amount'];
            $sale['due_amount'] = (float)$sale['due_amount'];
            $sale['points_earned'] = (int)$sale['points_earned'];
            $sale['points_redeemed'] = (int)$sale['points_redeemed'];
            $sale['points_redeemed_value'] = (float)$sale['points_redeemed_value'];

            // Fetch sale items
            $stmt = DB::query(
                "SELECT si.*, p.name as product_name, p.sku as product_sku, p.cost_price 
                 FROM sale_items si
                 JOIN products p ON si.product_id = p.id
                 WHERE si.sale_id = ? AND si.shop_id = ?",
                [$saleId, $shopId]
            );
            $items = $stmt->fetchAll();

            foreach ($items as &$item) {
                $item['id'] = (int)$item['id'];
                $item['shop_id'] = (int)$item['shop_id'];
                $item['sale_id'] = (int)$item['sale_id'];
                $item['product_id'] = (int)$item['product_id'];
                $item['quantity'] = (int)$item['quantity'];
                $item['unit_price'] = (float)$item['unit_price'];
                $item['subtotal'] = (float)$item['subtotal'];
                $item['cost_price'] = (float)$item['cost_price'];
            }

            $sale['items'] = $items;

            header('Content-Type: application/json');
            echo json_encode($sale);

        } catch (\Exception $e) {
            error_log('Fetch sale details error: ' . $e->getMessage());
            Auth::jsonError('Server error retrieving sale details.', 500);
        }
    }

    public static function deleteSale($id) {
        Auth::authenticate();
        Auth::enforceTenant();
        Auth::authorize(['shop_admin']);

        $saleId = (int)$id;
        $shopId = Auth::$shopId;

        try {
            DB::beginTransaction();

            $stmt = DB::query('SELECT * FROM sales WHERE id = ? AND shop_id = ? FOR UPDATE', [$saleId, $shopId]);
            $sale = $stmt->fetch();

            if (!$sale) {
                DB::rollBack();
                Auth::jsonError('Sale record not found or access denied.', 404);
            }

            // Restore stock for each sold item
            $stmt = DB::query('SELECT * FROM sale_items WHERE sale_id = ? AND shop_id = ?', [$saleId, $shopId]);
            $saleItems = $stmt->fetchAll();

            foreach ($saleItems as $item) {
                DB::query(
                    'UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ? AND shop_id = ?',
                    [(int)$item['quantity'], (int)$item['product_id'], $shopId]
                );
            }

            // Reverse customer due_balance
            $dueAmount = (float)$sale['due_amount'];
            if ($dueAmount > 0 && $sale['customer_id']) {
                DB::query(
                    'UPDATE customers SET due_balance = GREATEST(due_balance - ?, 0) WHERE id = ? AND shop_id = ?',
                    [$dueAmount, $sale['customer_id'], $shopId]
                );
            }

            // Void points earned/redeemed if customer was attached
            if ($sale['customer_id']) {
                $pointsEarned = (int)$sale['points_earned'];
                $pointsRedeemed = (int)$sale['points_redeemed'];
                
                DB::query(
                    'UPDATE customers 
                     SET loyalty_points = GREATEST(loyalty_points - ?, 0) + ? 
                     WHERE id = ? AND shop_id = ?',
                    [$pointsEarned, $pointsRedeemed, $sale['customer_id'], $shopId]
                );
            }

            // Delete sale items
            DB::query('DELETE FROM sale_items WHERE sale_id = ? AND shop_id = ?', [$saleId, $shopId]);

            // Delete sale record
            DB::query('DELETE FROM sales WHERE id = ? AND shop_id = ?', [$saleId, $shopId]);

            DB::commit();

            header('Content-Type: application/json');
            echo json_encode([
                'message' => "Sale #$saleId deleted successfully. Stock restored and totals adjusted.",
                'deleted_sale_id' => $saleId,
                'items_restored' => count($saleItems),
                'due_reversed' => $dueAmount
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            error_log('Delete sale error: ' . $e->getMessage());
            Auth::jsonError('Server error deleting sale transaction.', 500);
        }
    }

    public static function bulkDeleteSales($requestData) {
        Auth::authenticate();
        Auth::enforceTenant();
        Auth::authorize(['shop_admin']);

        $ids = $requestData['ids'] ?? [];
        $shopId = Auth::$shopId;

        if (empty($ids) || !is_array($ids)) {
            Auth::jsonError('Please provide an array of sale IDs to delete.', 400);
        }

        try {
            DB::beginTransaction();

            $totalRestoredItems = 0;
            $totalDueReversed = 0;
            $deletedSaleIds = [];

            foreach ($ids as $saleId) {
                $stmt = DB::query('SELECT * FROM sales WHERE id = ? AND shop_id = ? FOR UPDATE', [(int)$saleId, $shopId]);
                $sale = $stmt->fetch();

                if (!$sale) {
                    continue;
                }

                // Restore stock
                $stmt = DB::query('SELECT * FROM sale_items WHERE sale_id = ? AND shop_id = ?', [(int)$saleId, $shopId]);
                $saleItems = $stmt->fetchAll();

                foreach ($saleItems as $item) {
                    DB::query(
                        'UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ? AND shop_id = ?',
                        [(int)$item['quantity'], (int)$item['product_id'], $shopId]
                    );
                    $totalRestoredItems += (int)$item['quantity'];
                }

                // Reverse due balance
                $dueAmount = (float)$sale['due_amount'];
                if ($dueAmount > 0 && $sale['customer_id']) {
                    DB::query(
                        'UPDATE customers SET due_balance = GREATEST(due_balance - ?, 0) WHERE id = ? AND shop_id = ?',
                        [$dueAmount, $sale['customer_id'], $shopId]
                    );
                    $totalDueReversed += $dueAmount;
                }

                // Void loyalty points
                if ($sale['customer_id']) {
                    $pointsEarned = (int)$sale['points_earned'];
                    $pointsRedeemed = (int)$sale['points_redeemed'];
                    
                    DB::query(
                        'UPDATE customers 
                         SET loyalty_points = GREATEST(loyalty_points - ?, 0) + ? 
                         WHERE id = ? AND shop_id = ?',
                        [$pointsEarned, $pointsRedeemed, $sale['customer_id'], $shopId]
                    );
                }

                // Delete items
                DB::query('DELETE FROM sale_items WHERE sale_id = ? AND shop_id = ?', [(int)$saleId, $shopId]);

                // Delete sale
                DB::query('DELETE FROM sales WHERE id = ? AND shop_id = ?', [(int)$saleId, $shopId]);

                $deletedSaleIds[] = (int)$saleId;
            }

            DB::commit();

            header('Content-Type: application/json');
            echo json_encode([
                'message' => count($deletedSaleIds) . ' sales deleted successfully. Stock restored and customer balances updated.',
                'deleted_sale_ids' => $deletedSaleIds,
                'items_restored' => $totalRestoredItems,
                'due_reversed' => $totalDueReversed
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            error_log('Bulk delete sales error: ' . $e->getMessage());
            Auth::jsonError('Server error deleting sale transactions.', 500);
        }
    }
}
