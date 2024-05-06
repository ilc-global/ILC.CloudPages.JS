select

so.num as so_num,
so.totalprice as so_totalprice,
so.totaltax as so_totaltax,
customer.name as customer_name

from so
    join customer on customer.id = so.customerid

limit 50