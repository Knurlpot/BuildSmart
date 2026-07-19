import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";

export const runtime = "nodejs";

function getPythonExecutable() {
  const candidates = [
    process.env.PYTHON_PATH,
    "/Users/knurlrandel/Desktop/Projects/Capstone/buildsmart/.venv/bin/python",
    "python3",
    "python",
  ];
  return candidates.find(Boolean) as string | undefined;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const files = formData.getAll("files").filter((value): value is File => value instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "No files received" }, { status: 400 });
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "buildsmart-pricelist-"));
  const savedPaths: Array<{ originalName: string; tempPath: string }> = [];

  try {
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const tempPath = path.join(tempDir, safeName);
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(tempPath, buffer);
      savedPaths.push({ originalName: file.name, tempPath });
    }

    const scriptPath = path.join(process.cwd(), "lib/pricelist/ingestion.py");
    const pythonPath = getPythonExecutable();

    if (!pythonPath) {
      throw new Error("Python runtime is not available");
    }

    const payload = JSON.stringify({ files: savedPaths.map(({ originalName, tempPath }) => ({ originalName, tempPath })) });
    const result = await new Promise<string>((resolve, reject) => {
      const child = spawn(pythonPath, [scriptPath, payload], {
        cwd: process.cwd(),
        env: { ...process.env, PYTHONPATH: process.cwd(), PYTHONWARNINGS: "ignore" },
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(stderr || `Python exited with ${code}`));
          return;
        }
        resolve(JSON.stringify({ stdout, stderr }));
      });
    });

    // The child process may emit warnings or other non-JSON text before/around
    // the JSON payload. We expect a JSON object or array to be present; try to
    // parse the full stdout first, then fall back to extracting the last JSON
    // object/array found in the captured stdout.
    const out = JSON.parse(result) as { stdout: string; stderr: string };
    const full = out.stdout || "";
    const childStderr = out.stderr || "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(full);
    } catch (err) {
      // Try to extract the last {...} or [...] chunk from stdout
      const trimmed = full.trim();
      const objMatch = trimmed.match(/({[\s\S]*})\s*$/);
      const arrMatch = trimmed.match(/(\[[\s\S]*\])\s*$/);
      const candidate = objMatch?.[1] ?? arrMatch?.[1];
      if (!candidate) {
        return NextResponse.json({ error: "Failed to parse ingestion output", raw_stdout: full, raw_stderr: childStderr }, { status: 500 });
      }
      try {
        parsed = JSON.parse(candidate);
      } catch (err2) {
        return NextResponse.json({ error: "Failed to parse ingestion output", raw_stdout: full, raw_stderr: childStderr }, { status: 500 });
      }
    }

    return NextResponse.json(parsed);

    if (parsed && typeof parsed === "object" && "error" in parsed && typeof (parsed as { error?: unknown }).error === "string") {
      throw new Error((parsed as { error: string }).error);
    }

    return NextResponse.json(parsed);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  } finally {
    await Promise.allSettled(savedPaths.map(({ tempPath }) => fs.unlink(tempPath).catch(() => undefined)));
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
