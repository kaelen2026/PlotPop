export default function HomePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      {/* The wordmark is the brand name, not copy: §14's localisation rule
          starts applying with the first real sentence, in Creator Home. */}
      <h1 className="font-display text-display-sm text-foreground">PlotPop</h1>
    </main>
  );
}
