import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";


updateNpmdef();

/**
 * @typedef {{name:string, version:string, description?:string}} PackageJson
 * @typedef {Pick<PackageJson, "name" | "version" | "description">} UnityPackageJson
 * @typedef {{packageName:string, packageVersion:string}} Npmdef
 */

function updateNpmdef() {
    /** @type {PackageJson} */
    const currentPackageJson = JSON.parse(readFileSync("package.json", "utf8"));
    updateUnityPackage(currentPackageJson);
}

/**
 * @param {PackageJson} packageJson
 */
function updateUnityPackage(packageJson) {

    const dir = process.cwd() + "/unity";
    if (existsSync(dir)) {

        // Update Unity packagejson
        const unityPackageJsonPath = dir + "/package.json";
        /** @type {UnityPackageJson} */
        const unityPackageJson = JSON.parse(readFileSync(unityPackageJsonPath, "utf8"));
        unityPackageJson.version = packageJson.version;
        if (packageJson.description) unityPackageJson.description = packageJson.description;
        writeFileSync(unityPackageJsonPath, JSON.stringify(unityPackageJson, null, 4));
        console.log("Updated unity package.json");


        // Update npmdefs
        const npmdefs = readdirSync(dir).filter(f => f.endsWith(".npmdef"));
        for (const npmdef of npmdefs) {
            const fp = dir + "/" + npmdef;
            console.log(`Update npmdef: ${fp}`);
            /** @type {Npmdef} */
            const content = JSON.parse(readFileSync(fp, "utf8"));
            content.packageName = packageJson.name;
            content.packageVersion = packageJson.version;
            writeFileSync(fp, JSON.stringify(content, null, 4));
        }
    }
}