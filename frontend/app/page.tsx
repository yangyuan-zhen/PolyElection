export default function HomePage() {
  return (
    <main
      style={{
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: "#000",
      }}
    >
      <iframe
        title="PolyElection Legacy Dashboard"
        src="/legacy/index.html?v=legacy-v1"
        style={{ height: "100%", width: "100%", border: 0 }}
      />
    </main>
  );
}
