export function ContentSpinner() {
  return (
    <div className="flex h-full min-h-[60vh] w-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-primary" />
    </div>
  );
}
