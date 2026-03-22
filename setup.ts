import { Effect } from "effect";

class DownloadError { readonly _tag = "DownloadError"; constructor(readonly message: string) {} }
class FileSystemError { readonly _tag = "FileSystemError"; constructor(readonly message: string) {} }

const GITHUB_RELEASE_URL = "https://github.com/waldmatias/kalien-test/releases/download/v0.1";

const runAsMain = <A, E>(effect: Effect.Effect<A, E, never>) => 
    Effect.runPromise(effect).then(
        () => Deno.exit(0),
        (error) => {
            console.error(error);
            Deno.exit(1);
        }
    );

const setupMiner = Effect.gen(function* () {
    const os = Deno.build.os;
    const binaryName = os === "windows" ? "kalien.exe" : "kalien";
    const downloadUrl = `${GITHUB_RELEASE_URL}/${binaryName}`;
    const targetDir = "./bin";
    const targetPath = `${targetDir}/${binaryName}`;

    const exists = yield* Effect.promise(() => 
        Deno.stat(targetPath).then(() => true).catch(() => false)
    );

    if (exists) {
        return yield* Effect.logInfo(`Miner already exists at ${targetPath}`);
    }

    yield* Effect.logInfo(`Starting setup for ${os}...`);

    yield* Effect.tryPromise({
        try: () => Deno.mkdir(targetDir, { recursive: true }),
        catch: (e) => new FileSystemError(`Failed to create directory: ${e}`)
    });

    const downloadData = yield* Effect.tryPromise({
        try: () => fetch(downloadUrl),
        catch: (e) => new DownloadError(`Network failure: ${e}`)
    }).pipe(
        Effect.filterOrFail(
            (response) => response.ok && !!response.body, 
            (response) => new DownloadError(`HTTP ${response.status}: ${response.statusText}`)
        )
    );

    yield* Effect.logInfo(`Downloading ${binaryName}...`);

    yield* Effect.tryPromise({
        try: async () => {
            const file = Deno.open(targetPath, { create: true, write: true, truncate: true });
            await downloadData.body!.pipeTo((await file).writable);
        },
        catch: (e) => new FileSystemError(`Failed to open file: ${e}`)
    });

    if (os !== "windows") {
        yield* Effect.promise(() => Deno.chmod(targetPath, 0o755));
    }

    yield* Effect.logInfo("Setup complete!");
});

runAsMain(setupMiner);