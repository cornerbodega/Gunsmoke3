const { createClient } = require("@supabase/supabase-js");
require("dotenv/config");

const saveToSupabase = async (table, dataToSave, options = {}) => {
  const getSupabase = () => {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  };

  const supabase = getSupabase();

  try {
    const query = options.onConflict
      ? supabase
          .from(table)
          .upsert(dataToSave, { onConflict: options.onConflict })
          .select()
      : supabase.from(table).insert(dataToSave).select();

    const response = await query;

    if (response.error) {
      throw response.error;
    }

    return response.data;
  } catch (error) {
    console.error("❌ Error inserting data into", table, ":", error.message);
  }
};

module.exports = saveToSupabase;
