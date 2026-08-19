SELECT 
    column_name, 
    data_type 
FROM 
    information_schema.columns 
WHERE 
    table_name = 'dashboard_sync_status';

SELECT * FROM public.dashboard_sync_status;
