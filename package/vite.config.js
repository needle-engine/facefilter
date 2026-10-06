const { transform } = require("esbuild");

// needle-publish-helper uses this config when building the distributable files.
// Its default minifier returns an empty source map, which Vite 8 cannot parse.
module.exports = {
    base: "./",
    assetsInclude: ["**/*.wasm", "**/*.data.txt"],
    build: {
        minify: false,
        lib: {
            entry: "./index.ts",
            name: "facefilter",
            formats: ["es", "esm", "cjs"],
            fileName: (format) => ({
                es: "facefilter.js",
                esm: "facefilter.min.js",
                cjs: "facefilter.umd.cjs",
            })[format],
        },
        rollupOptions: {
            external: [
                "@needle-tools/engine",
                "three",
                "three/examples/jsm/loaders/GLTFLoader.js",
                "three/examples/jsm/libs/meshopt_decoder.module.js",
                "three/examples/jsm/loaders/DRACOLoader.js",
                "three/examples/jsm/loaders/KTX2Loader.js",
            ],
            output: {
                minifyInternalExports: false,
                codeSplitting: false,
                assetFileNames: "[name][extname]",
                globals: {
                    three: "THREE",
                    "@needle-tools/engine": "NEEDLE",
                },
                plugins: [{
                    name: "minify-es",
                    renderChunk: {
                        order: "post",
                        async handler(code, chunk) {
                            if (!chunk.fileName.endsWith(".min.js")) return null;
                            const result = await transform(code, { minify: true });
                            return { code: result.code, map: null };
                        },
                    },
                }],
            },
        },
    },
};
