import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const read = path => readFile(join(root, path), "utf8");
const json = async path => JSON.parse(await read(path));
const manifest = await json("package.json");
const staging = await mkdtemp(join(tmpdir(), "facefilter-release-smoke-"));
const stagedPackage = join(staging, "package");
await mkdir(stagedPackage);
const check = (name, fn) => Promise.resolve().then(fn).then(() => console.log(`PASS ${name}`));

await check("Unity version and npm definition match the npm package", async () => {
    const unity = await json("unity/package.json"), definition = await json("unity/needle-facefilter.npmdef");
    assert.equal(unity.name, "com.needle.face-filter");
    assert.equal(unity.version, manifest.version);
    assert.equal(definition.packageName, manifest.name);
    assert.equal(definition.packageVersion, manifest.version);
    assert.equal(definition.localPath, "..");
    assert.equal(definition.allowCodegen, false, "Use shipped Unity wrappers, not automatic regeneration of runtime-only classes");
});

await check("renamed Unity manager preserves its 1.x script identity and migration metadata", async () => {
    assert.match(await read("unity/Runtime/NeedleTrackingManager.cs.meta"), /^guid: 6353b3654683b8d00cb8547a2642cc07$/m);
    assert.match(await read("unity/Runtime/NeedleTrackingManager.cs"), /class NeedleTrackingManager : UnityEngine\.MonoBehaviour/);
    const partial = await read("unity/Runtime/Scripts/TrackingManager.cs");
    const assembly = await json("unity/Runtime/Needle.Facefilter.Runtime.asmdef");
    assert.match(partial, /MovedFrom\(true,/);
    assert.ok(partial.includes(`sourceAssembly: "${assembly.name}"`));
    assert.ok(partial.includes('sourceNamespace: "Needle.Typescript.GeneratedComponents"'));
    assert.ok(partial.includes('sourceClassName: "NeedleFilterTrackingManager"'));
    const registration = await read("codegen/register_types.ts");
    const names = [...registration.matchAll(/TypeStore\.add\("([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(names).size, names.length, "Duplicate runtime component registrations");
    assert.match(registration, /TypeStore\.add\("HandAttachment", HandAttachment\)/);
    assert.doesNotMatch(registration, /from ["']\.\.\/(?:lib|dist)\//, "Source registration must not import compiled copies");
    assert.match(registration, /TypeStore\.add\("NeedleTrackingManager", NeedleTrackingManager\)/);
    assert.match(registration, /TypeStore\.add\("HandTrackingBehaviour", HandTrackingBehaviour\)/);
});

await check("Unity metadata has no duplicate GUIDs or orphaned C# metadata", async () => {
    const guids = new Map();
    async function walk(dir) {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) await walk(path);
            else if (entry.name.endsWith(".meta")) {
                const guid = (await readFile(path, "utf8")).match(/^guid: ([a-f0-9]{32})$/m)?.[1];
                assert.ok(guid, `Missing GUID: ${path}`);
                assert.ok(!guids.has(guid), `Duplicate GUID: ${path} and ${guids.get(guid)}`);
                guids.set(guid, path);
                if (entry.name.endsWith(".cs.meta")) await stat(path.slice(0, -5));
            }
        }
    }
    await walk(join(root, "unity"));
});

await check("release TypeScript emits the library without compiling the Vite test app", async () => {
    const output = execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"),
        "--project", join(root, "tsconfig.json"), "--outDir", join(stagedPackage, "lib"),
        "--noEmit", "false", "--incremental", "false", "--skipLibCheck", "--listEmittedFiles"],
        { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    assert.ok(!/[\\/]tests[\\/]vite[\\/]/.test(output), "Test app leaked into release compilation");
    await stat(join(stagedPackage, "lib/index.js"));
    await stat(join(stagedPackage, "lib/codegen/register_types.js"));
});

await check("public API and component registration bundle for browsers", async () => {
    await build({ absWorkingDir: root, entryPoints: ["index.ts", "codegen/register_types.ts"],
        bundle: true, platform: "browser", format: "esm", outdir: join(staging, "bundle"), write: false,
        packages: "external", loader: { ".glb": "file" }, logLevel: "silent" });
});

await check("npm tarball includes Unity migration files and excludes tests", async () => {
    for (const path of ["package.json", ...manifest.files.filter(path => path !== "lib" && path !== "dist")]) {
        await cp(join(root, path), join(stagedPackage, path), { recursive: true });
    }
    // Exercise npm's actual packer, without running publish hooks or publishing.
    const npmCli = process.env.npm_execpath;
    assert.ok(npmCli, "Run this test via npm run test:release");
    const output = execFileSync(process.execPath, [npmCli, "pack", "--ignore-scripts", "--json",
        "--pack-destination", staging], { cwd: stagedPackage, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const [packed] = JSON.parse(output);
    const paths = new Set(packed.files.map(file => file.path));
    for (const path of ["index.ts", "src/TrackingManager.ts", "lib/index.js", "codegen/register_types.ts",
        "unity/package.json", "unity/needle-facefilter.npmdef", "unity/Runtime/NeedleTrackingManager.cs",
        "unity/Runtime/NeedleTrackingManager.cs.meta", "unity/Runtime/Scripts/TrackingManager.cs",
        "src/hands/HandAttachment.ts", "unity/Runtime/HandAttachment.cs", "unity/Runtime/HandAttachment.cs.meta",
        "unity/Runtime/Scripts/HandEditors.cs", "unity/Runtime/Scripts/HandEditors.cs.meta",
        "unity/Runtime/Models/left.glb", "unity/Runtime/Models/right.glb", "unity/Runtime/Models/LICENSE.md"])
        assert.ok(paths.has(path), `Tarball missing ${path}`);
    assert.ok(![...paths].some(path => path.startsWith("tests/") || path.includes("node_modules/")));
    assert.equal(packed.version, manifest.version);
    console.log(`Tarball: ${join(staging, packed.filename)}`);
});
console.log("Release smoke test passed. Unity editor loading, C# compilation, APIUpdater and rendering still need an editor test.");
