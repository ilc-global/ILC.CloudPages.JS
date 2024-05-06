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

