import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 py-16 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-3xl font-semibold">BuildSmart is ready for PostgreSQL</h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          Add your database connection string to the environment file and open the health check endpoint to verify the connection.
        </p>

        <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="font-medium">Next steps</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
            <li>Copy .env.local.example to .env.local</li>
            <li>Set DATABASE_URL to your PostgreSQL connection string</li>
            <li>Start the app and visit /api/health</li>
          </ul>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/api/health"
            className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Check database health
          </Link>
          <a
            href="https://node-postgres.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            pg docs
          </a>
        </div>
      </div>
    </main>
  );
}
