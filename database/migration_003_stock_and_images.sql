-- ============================================================
-- Migration 003: Stock quantity via inventory table
--                Ensure inventory row created for all products
-- ============================================================

-- Ensure every existing product has an inventory row (quantity 0)
INSERT INTO inventory (product_id, quantity, reserved_quantity, reorder_level, updated_at)
SELECT p.id, 0, 0, 5, NOW()
FROM products p
WHERE NOT EXISTS (
    SELECT 1 FROM inventory i WHERE i.product_id = p.id
);

-- Verify
SELECT p.id, p.name, i.quantity, i.reserved_quantity
FROM products p
LEFT JOIN inventory i ON i.product_id = p.id
ORDER BY p.id
LIMIT 20;
