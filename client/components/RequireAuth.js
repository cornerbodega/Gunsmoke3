// components/RequireAuth.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../utils/supabase.js";

export default function RequireAuth({ children }) {
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push("/"); // redirect to splash/login
      } else {
        setLoading(false);
      }
    });
  }, [router]);

  if (loading) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        🔐 Checking login...
      </div>
    );
  }

  return children;
}
