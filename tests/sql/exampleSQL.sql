Basic Shipped / Posted / Accounting Accurate Sales Query
SELECT
	so.num as so_num, 
	so.datecreated as so_datecreated, 
	so.dateissued as so_dateissued, 
	so.datecompleted as so_datecompleted, 
	sostatus.name as so_statusname, 
	postso.postDate as post_date, 
	
	customer.name as customer_name, 
	so.customerpo as customer_po, 
	
	so.billtoname as bill_name, 
	so.billtoaddress as bill_adr, 
	so.billtocity as bill_city, 
	billstate.code as bill_state, 
	so.billtozip as bill_zip, 
	billcountry.abbreviation as bill_country, 
	
	so.shiptoname as ship_name, 
	so.shiptoaddress as ship_adr, 
	so.shiptocity as ship_city, 
	shipstate.code as ship_state, 
	so.shiptozip as ship_zip, 
	shipcountry.abbreviation as ship_country, 
	
	soitemtype.name as line_type, 
	soitem.solineitem as line_number, 
	product.num as product_num, 
	product.description as product_description, 
	
	
	postsoitem.qty as shipped_qty, 
	soitem.unitPrice AS line_unit_price,
	postsoitem.totalprice as total_revenue, 
	postsoitem.postedtotalcost/postsoitem.qty as line_unit_cost, 
	postsoitem.postedTotalCost as total_cogs
	
FROM postso
	JOIN so ON so.id = postso.soid

	JOIN sostatus ON sostatus.id = so.statusId
	JOIN customer ON customer.id = so.customerId
	
	LEFT JOIN stateconst AS billstate ON billstate.id = so.billToStateId
	LEFT JOIN stateconst AS shipstate ON shipstate.id = so.shipToStateId
	LEFT JOIN countryconst AS billcountry ON billcountry.id = so.billToCountryId
	LEFT JOIN countryconst AS shipcountry ON shipcountry.id = so.shipToCountryId

	JOIN postsoitem ON postsoitem.postsoid = postso.id	
	JOIN soitem ON soitem.id = postsoitem.soitemid
	JOIN soitemtype ON soitemtype.id = soitem.typeId	
	
	LEFT JOIN product ON product.id = soitem.productId
	LEFT JOIN part ON part.id = product.partId

ORDER BY postso.id,soitem.solineitem 


Basic Received / Posted / Accounting Accurate Purchase Query
SELECT

	po.num AS po_num,
	po.dateIssued AS po_dateissued,
	locationgroup.name AS receive_lgp,
	vendor.name AS vendor_name,
	postpo.postDate AS date_posted,
	receiptitem.dateReceived AS date_received,
	receiptitem.dateReconciled AS date_reconciled,
	
	poitemtype.name AS line_type,
	poitem.partNum AS line_part_num,
	poitem.description AS line_part_description,
	poitem.vendorPartNum AS vendor_part_num,
	poitem.unitCost AS line_unit_cost,
	
	postpoitem.qty AS line_qty_received,
	postpoitem.postedTotalCost AS line_posted_total_cost,
	uom.code AS uom_code

FROM postpo
	JOIN po ON postpo.poId = po.id
	JOIN locationgroup ON locationgroup.id = po.locationGroupId
	JOIN vendor ON vendor.id = po.vendorId
	JOIN postpoitem ON postpoitem.postPoId = postpo.id
	JOIN poitem ON poitem.id = postpoitem.poItemId
	JOIN poitemtype ON poitemtype.id = poitem.typeId
	JOIN uom ON uom.id = poitem.uomId	
	LEFT JOIN receiptitem ON receiptitem.id = postpoitem.receiptItemId


Basic Open Purchase Order Query
SELECT
    po.num AS po_num,
    postatus.NAME AS po_status,
    DATE(po.dateFirstShip) AS po_delivery_date,
    vendor.NAME AS vendor_name,
    COALESCE(po.email,email.datus) AS po_email,
    po.phone AS po_phone,
    
    poitemstatus.NAME AS poitem_status,
    poitem.partNum AS part_number,
    poitem.description AS part_desc,
    poitem.vendorPartNum AS vendor_part_num,
    
    DATE(poitem.dateScheduledFulfillment) AS line_delivery_date,
    
    poitem.qtyToFulfill AS qty_ordered,
    COALESCE(rcpt.qty,0) AS qty_received,
    poitem.qtyToFulfill - COALESCE(rcpt.qty,0) AS qty_balance
FROM po
    JOIN postatus ON postatus.id = po.statusid
    JOIN vendor ON vendor.id = po.vendorid
    LEFT JOIN contact AS email ON email.id = (SELECT id FROM contact WHERE typeid = 60 AND accountid = vendor.accountId LIMIT 1)
    JOIN poitem ON poitem.poid = po.id
    JOIN poitemstatus ON poitemstatus.id = poitem.statusId
    
    LEFT JOIN (
    select
        receiptitem.poItemId,
        SUM(receiptitem.qty) AS qty
    FROM receiptitem
    WHERE receiptitem.statusid >= 30         
    GROUP BY 1
    ) AS rcpt ON rcpt.poitemid = poitem.id 
WHERE po.statusid BETWEEN 20 AND 50
AND poitem.statusid BETWEEN 10 AND 45
AND poitem.qtyToFulfill - COALESCE(rcpt.qty,0) > 0
ORDER BY vendor.NAME, po.num, poitem.poLineItem


Basic Open Sales Order Query
SELECT

so.num AS so_num,
sostatus.name AS so_status,
so.dateIssued AS so_date_issued,
customer.name AS customer_name,

so.shipToCity AS so_shipto_city,
stateconst.code AS so_shipto_state,
countryconst.abbreviation AS so_shipto_country,

soitemtype.name AS line_type,
soitem.soLineItem AS line_sequence,
soitem.productNum AS line_product_num,
soitem.description AS line_product_desc,
soitem.qtyToFulfill AS line_order_qty,
soitem.qtyPicked AS line_picked_qty,
soitem.qtyFulfilled AS line_fulfilled_qty,
(soitem.qtytofulfill-soitem.qtyfulfilled) AS line_open_qty,
uom.code AS uom_code,
soitemstatus.name AS line_status


FROM so
	JOIN sostatus ON sostatus.id = so.statusId
	JOIN customer ON customer.id = so.customerId
	LEFT JOIN stateconst ON stateconst.id = so.shipToStateId
	LEFT JOIN countryconst ON countryconst.id = COALESCE(so.shipToCountryId,stateconst.countryConstID)
	JOIN soitem ON soitem.soid = so.id
	JOIN uom ON uom.id = soitem.uomid
	JOIN soitemstatus ON soitemstatus.id = soitem.statusId
	JOIN soitemtype ON soitemtype.id = soitem.typeId


WHERE so.statusId BETWEEN 20 AND 25
AND soitem.typeid between 10 AND 40
AND (soitem.qtytofulfill-soitem.qtyfulfilled) > 0 	