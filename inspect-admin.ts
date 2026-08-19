import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error("SERVICE ROLE KEY NOT FOUND!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectAsAdmin() {
  console.log('--- ADMIN INSPECTION (BYPASSING RLS) ---');
  
  const { data, error } = await supabase
    .from('dashboard_sync_status')
    .select('*')
    .eq('sync_name', 'discover_projects')
    .maybeSingle();

  if (error) {
    console.error('ERROR:', error);
  } else {
    console.log('DATA (ADMIN VIEW):', JSON.stringify(data, null, 2));
  }
}

inspectAsAdmin();
