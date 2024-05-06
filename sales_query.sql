SELECT
    so.num AS so_num,
    so.datecreated AS so_datecreated,
    so.dateissued AS so_dateissued,
    so.datecompleted AS so_datecompleted,
    sostatus.name AS so_statusname,
    postso.postDate AS post_date,

    customer.name AS customer_name,
    so.customerpo AS customer_po,

    so.billtoname AS bill_name,
    so.billtoaddress AS bill_adr,
    so.billtocity AS bill_city,
    billstate.code AS bill_state,
    so.billtozip AS bill_zip,
    billcountry.abbreviation AS bill_country,

    so.shiptoname AS ship_name,
    so.shiptoaddress AS ship_adr,
    so.shiptocity AS ship_city,
    shipstate.code AS ship_state,
    so.shiptozip AS ship_zip,
    shipcountry.abbreviation AS ship_country,

    soitemtype.name AS line_type,
    soitem.solineitem AS line_number,
    product.num AS product_num,
    product.description AS product_description,

    postsoitem.qty AS shipped_qty,
    soitem.unitPrice AS line_unit_price,
    postsoitem.totalprice AS total_revenue,
    postsoitem.postedtotalcost / postsoitem.qty AS line_unit_cost,
    postsoitem.postedTotalCost AS total_cogs

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

ORDER BY postso.id, soitem.solineitem;
