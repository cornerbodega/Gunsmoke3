import Link from "next/link";
import RequireAuth from "../components/RequireAuth";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/utils/supabase";
export default function Home() {
  const user = useUser();
  console.log(`user?.id: ${user?.id}`);

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Logout failed:", error.message);
    } else {
      // Optionally redirect to landing/login page
      window.location.href = "/";
    }
  }
  return (
    <RequireAuth>
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(to bottom, black, #111)",
          color: "white",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "4rem",
              fontWeight: "900",
              backgroundImage: "linear-gradient(to right, red, orange, red)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              animation: "pulse 2s infinite",
            }}
          >
            Gunsmoke3D
          </h1>
          <p
            style={{
              fontSize: "1.2rem",
              color: "#ccc",
              maxWidth: "600px",
              margin: "1rem auto",
            }}
          >
            Create, visualize, and relive intense courtroom drama.
          </p>
        </div>

        <div
          style={{
            marginTop: "2rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.5rem",
            width: "100%",
            maxWidth: "400px",
          }}
        >
          <Link href="/create-scene-from-transcript">
            <div
              style={{
                backgroundColor: "#b91c1c",
                padding: "1rem",
                borderRadius: "1rem",
                textAlign: "center",
                fontWeight: "600",
                fontSize: "1.1rem",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(255,0,0,0.4)",
                transition: "all 0.3s ease",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = "#991b1b")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "#b91c1c")
              }
            >
              🎬 Create Scene from Transcript
            </div>
          </Link>

          {/* Uncomment when Courtroom is ready */}
          {/* <Link href="/courtroom">
          <div style={{ ...buttonStyle, backgroundColor: "#2563eb" }}>
            ⚖️ Enter the Courtroom
          </div>
        </Link> */}

          <Link href="/scenes">
            <div
              style={{
                backgroundColor: "#6b21a8",
                padding: "1rem",
                borderRadius: "1rem",
                textAlign: "center",
                fontWeight: "600",
                fontSize: "1.1rem",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(128,0,255,0.4)",
                transition: "all 0.3s ease",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = "#581c87")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "#6b21a8")
              }
            >
              🎥 View Scenes
            </div>
          </Link>
          <div style={{ marginTop: "1rem" }}>
            <button onClick={handleLogout}>Log Out</button>
          </div>
        </div>

        {/* Keyframe style for pulse animation */}
        <style jsx>{`
          @keyframes pulse {
            0% {
              transform: scale(1);
            }
            50% {
              transform: scale(1.05);
            }
            100% {
              transform: scale(1);
            }
          }
        `}</style>
      </div>
    </RequireAuth>
  );
}
