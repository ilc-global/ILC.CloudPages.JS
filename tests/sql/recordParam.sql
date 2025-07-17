# Part
# sql: select id,num,description from part
# value: id
# display: num, DESCRIPTION
# search: num, DESCRIPTION

# Product
# sql: select id,num,description from product
# value: id
# display: num, DESCRIPTION
# search: num, DESCRIPTION

# BOM
# sql: select id,num,description from bom
# value: id
# display: num, DESCRIPTION
# search: num, DESCRIPTION

# Customer
# sql: SELECT id,NAME FROM customer 
# value: id
# display: name
# search: name

# Customer Group
# sql: SELECT id,name FROM accountgroup
# value: id
# display: name
# search: name

# Vendor
# sql: SELECT id,name FROM vendor
# value: id
# display: name
# search: name


# Kit
# sql: select id,num,description from product where kitflag = 1
# value: id
# display: num, DESCRIPTION
# search: num, DESCRIPTION


# Location Group
# sql: select id,name from locationgroup
# value: id
# display: name
# search: name


# Location
# sql: SELECT locationgroup.name AS lgp, location.name AS loc, location.id AS id from location  	JOIN locationgroup ON locationgroup.id = location.locationgroupid
# value: id
# display: lgp - loc
# search: loc

# Account
# sql: SELECT id,accountnumber,name FROM asaccount
# value: id
# display: name - accountnumber
# search: name,accountnumber

# Carrier
# sql: SELECT id,NAME FROM carrier
# value: id
# display: name
# search: name

# CarrierService
# sql: SELECT id,NAME FROM carrierservice
# value: id
# display: name
# search: name

# Class
# sql: SELECT id,NAME FROM qbclass
# value: id
# display: name
# search: name

# User
# sql: SELECT id,username,firstname,lastname FROM sysuser
# value: id
# display: username,firstname,lastname
# search: username,firstname,lastname

# Payment Method
# sql: SELECT id,name FROM paymentmethod
# value: id
# display: name
# search: name


# Product Tree 
# sql: SELECT id,name,parentid FROM producttree
# value: the id of what was selected, PLUS all child nodes from that node below as one comma separated list
# display: name (but this logic needs to traverse the tree nodes, see parentid, Product Tree->Baked Goods->Cookies for example
# search: name


