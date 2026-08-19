import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRLS() {
  console.log('--- TESTE DE RLS E DADOS ---');
  
  // 1. Tentar listar todos os registros para ver o que o anon/auth fake vê
  console.log('1. Listando registros em dashboard_sync_status...');
  const { data: allData, error: allErr } = await supabase
    .from('dashboard_sync_status')
    .select('*');
    
  if (allErr) {
    console.error('Erro ao listar:', allErr.message);
  } else {
    console.log('Registros encontrados:', allData.length);
    console.table(allData);
  }

  // 2. Tentar ver detalhes do discover_projects especificamente
  console.log('2. Buscando discover_projects especificamente...');
  const { data: discData, error: discErr } = await supabase
    .from('dashboard_sync_status')
    .select('*')
    .eq('sync_name', 'discover_projects')
    .maybeSingle();

  if (discErr) {
    console.error('Erro na busca específica:', discErr.message);
  } else {
    console.log('discover_projects data:', discData);
  }
}

checkRLS();
