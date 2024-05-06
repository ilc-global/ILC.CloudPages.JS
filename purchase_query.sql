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
    LEFT JOIN receiptitem ON receiptitem.id = postpoitem.receiptItemId;
