SELECT
    po.num AS po_num,
    postatus.name AS po_status,
    DATE(po.dateFirstShip) AS po_delivery_date,
    vendor.name AS vendor_name,
    COALESCE(po.email, email.datus) AS po_email,
    po.phone AS po_phone,

    poitemstatus.name AS poitem_status,
    poitem.partNum AS part_number,
    poitem.description AS part_desc,
    poitem.vendorPartNum AS vendor_part_num,

    DATE(poitem.dateScheduledFulfillment) AS line_delivery_date,

    poitem.qtyToFulfill AS qty_ordered,
    COALESCE(rcpt.qty, 0) AS qty_received,
    poitem.qtyToFulfill - COALESCE(rcpt.qty, 0) AS qty_balance

FROM po
    JOIN postatus ON postatus.id = po.statusid
    JOIN vendor ON vendor.id = po.vendorid
    LEFT JOIN contact AS email ON email.id = (
        SELECT id FROM contact WHERE typeid = 60 AND accountid = vendor.accountId LIMIT 1
    )
    JOIN poitem ON poitem.poid = po.id
    JOIN poitemstatus ON poitemstatus.id = poitem.statusId

    LEFT JOIN (
        SELECT
            receiptitem.poItemId,
            SUM(receiptitem.qty) AS qty
        FROM receiptitem
        WHERE receiptitem.statusid >= 30
        GROUP BY 1
    ) AS rcpt ON rcpt.poitemid = poitem.id

WHERE po.statusid BETWEEN 20 AND 50
AND poitem.statusid BETWEEN 10 AND 45
AND poitem.qtyToFulfill - COALESCE(rcpt.qty, 0) > 0
ORDER BY vendor.name, po.num, poitem.poLineItem;
