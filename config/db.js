const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");

// load env vars
dotenv.config({ path: "./.env" });

// "Supabase URL" and "Supabase Key"
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  autoRefreshToken: false,
  persistSession: false,
  detectSessionInUrl: false,
});

console.log(`Supabase Connected!`);

module.exports = supabase;
