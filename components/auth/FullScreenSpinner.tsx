export function FullScreenSpinner() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-primary" />
    </div>
  );
}
