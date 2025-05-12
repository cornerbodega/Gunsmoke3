// components/LoginButton.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function LoginButton() {
  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          process.env.NODE_ENV === "development"
            ? "http://localhost:3000/home"
            : "https://yourdomain.com/home",
      },
    });
  };

  return (
    <button
      onClick={handleLogin}
      style={{
        position: "absolute",
        bottom: "2rem",
        left: "50%",
        transform: "translateX(-50%)",
        padding: "1rem 2rem",
        fontSize: "1.2rem",
        borderRadius: "0.5rem",
        background: "linear-gradient(to right, red, orange)",
        color: "white",
        border: "none",
        cursor: "pointer",
        zIndex: 10,
      }}
    >
      Sign in with Google
    </button>
  );
}
