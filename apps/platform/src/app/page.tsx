export default function Home() {
  return (
    <div className="flex h-full items-center justify-center px-8">
      <div className="max-w-md text-center">
        <div className="section-label">WorkOS</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">
          Pick a workspace to get started.
        </h1>
        <p className="mt-3 text-sm text-text-secondary">
          Board, Detail, and AI panels will render here once a workspace is
          selected from the sidebar.
        </p>
      </div>
    </div>
  );
}
