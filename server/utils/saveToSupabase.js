const { createClient } = require("@supabase/supabase-js");
require("dotenv/config");

const saveToSupabase = async (table, dataToSave) => {
  const getSupabase = () => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    return supabase;
  };

  const supabase = getSupabase();

  try {
    const response = await supabase.from(table).insert(dataToSave).select();

    if (response.error) {
      throw response.error;
    }

    return response.data;
  } catch (error) {
    console.error("Error inserting data:", error.message);
  }
};

module.exports = saveToSupabase; // Use `module.exports` instead of `export default`
