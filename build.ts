const REQUIRED_BUN = "1.3.11";
if (Bun.semver.order(Bun.version, REQUIRED_BUN) < 0) {
    console.warn(`Warning: Bun ${Bun.version} < ${REQUIRED_BUN}, upgrade recommended (bun upgrade)`);
}

const targets: Bun.Build.CompileTarget[] = [
    "bun-darwin-arm64",
    "bun-darwin-x64",
    "bun-linux-x64",
    "bun-linux-arm64",
    "bun-windows-x64",
];

await Promise.all(
    targets.flatMap((target) => [
        Bun.build({
            entrypoints: ["./control/index.ts"],
            compile: {
                target,
                outfile: `./dist/${target}/control${
                    target.includes("windows") ? ".exe" : ""
                }`,
            },
        }),
        Bun.build({
            entrypoints: ["./beacon/index.ts"],
            compile: {
                target,
                outfile: `./dist/${target}/beacon${
                    target.includes("windows") ? ".exe" : ""
                }`,
            },
        }),
    ]),
);
