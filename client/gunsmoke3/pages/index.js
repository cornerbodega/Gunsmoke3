// Link to courtroom

// link to create scene from transcript
import Link from "next/link";

export default function Home() {
  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-bold">Gunsmoke</h1>
      <br></br>

      <Link href="/create-scene-from-transcript">
        <div className="text-blue-600">Create Scene from Transcript</div>
      </Link>
      <br></br>
      {/* <Link href="/courtroom">
        <div className="text-blue-600">Courtroom</div>
      </Link> */}
      <br></br>
      <Link href="/scenes">
        <div className="text-blue-600">Scenes</div>
      </Link>
    </div>
  );
}
