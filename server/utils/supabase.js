const { createClient } = require("@supabase/supabase-js");
require("dotenv/config");

const getSupabase = () => {
  const supabase = createClient(
    process.env.PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  return supabase;
};

module.exports = { getSupabase }; // Use `module.exports` instead of `export`
