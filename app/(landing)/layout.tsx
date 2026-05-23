export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main
      style={{
        width: "100%",
        minHeight: "100vh",
      }}
    >
      {children}
    </main>
  );
}