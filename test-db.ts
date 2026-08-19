import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testQuery() {
  console.log('--- TESTE DE QUERY ---');
  console.log('Querying dashboard_sync_status for discover_projects...');
  
  const { data, error } = await supabase
    .from('dashboard_sync_status')
    .select('last_run_at')
    .eq('sync_name', 'discover_projects')
    .maybeSingle();

  if (error) {
    console.error('ERROR:', error);
  } else {
    console.log('DATA:', JSON.stringify(data, null, 2));
    if (data && data.last_run_at) {
      console.log('Found last_run_at:', data.last_run_at);
      const date = new Date(data.last_run_at);
      console.log('Parsed date (UTC):', date.toISOString());
      console.log('Formatted date (pt-BR, America/Sao_Paulo):', date.toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }));
    } else {
      console.log('last_run_at is missing or null.');
    }
  }
}

testQuery();
