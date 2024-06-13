SELECT

so.num AS so_num,
so.totalTax AS so_total_tax,
so.dateIssued AS so_date_issued,
so.billToZip AS so_billto_zip,

soitem.productNum AS product_num,
soitem.qtyFulfilled AS qty_to_fulfill

FROM so
    JOIN soitem ON soitem.soid = so.id
    
WHERE DATE(so.dateIssued) BETWEEN :date_issued_start and :date_issued_end