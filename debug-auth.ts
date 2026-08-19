import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugAuth() {
  console.log('--- AUTH & SESSION DEBUG ---');
  
  // Tentar pegar a sessão atual (provavelmente vazia no CLI)
  const { data: { session } } = await supabase.auth.getSession();
  console.log('Session exists:', !!session);
  if (session) {
    console.log('User ID:', session.user.id);
    console.log('User Email:', session.user.email);
  } else {
    console.log('No session found for CLI.');
  }

  // Verificar políticas de RLS da tabela
  console.log('\nChecking RLS policies for dashboard_sync_status...');
  const { data: rlsData, error: rlsErr } = await supabase.rpc('get_policies', { table_name: 'dashboard_sync_status' });
  if (rlsErr) {
    // get_policies é um chute, provavelmente não existe por padrão
    console.log('Could not fetch policies via RPC (normal).');
  }

  // Tentar inserir um registro de teste se possível (não deve funcionar com anon)
  console.log('\nTesting insert permission (should fail for anon)...');
  const { error: insErr } = await supabase
    .from('dashboard_sync_status')
    .insert({ sync_name: 'cli_test', last_run_at: new Date().toISOString() });
    
  if (insErr) {
    console.log('Insert failed as expected:', insErr.message);
  } else {
    console.log('Insert succeeded! (Check if RLS is disabled or allows anon inserts)');
  }
}

debugAuth();
