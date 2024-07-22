import { context } from "esbuild";
import { rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import autoprefixer from "autoprefixer";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { transform, Features } from "lightningcss";

const dev = process.argv[2] === "dev";

/** @type {import("esbuild").Plugin} */
const cssPlugin = {
  name: "postcss",
  setup(build) {
    const pc = postcss([
      tailwindcss({ config: "tailwind.config.js" }),
      autoprefixer()
    ]);
    
    build.onResolve({ filter: /^css$/ }, args => {
      const path = join(args.resolveDir, "main.css");
      return {
        path,
        namespace: "postcss",
        watchDirs: [args.resolveDir]
      };
    });

    build.onLoad({ filter: /.*/, namespace: "postcss" }, async args => {
      const content = await readFile(args.path, "utf8");
      const processed = await pc.process(content, { from: args.path });
      
      // run through lightningcss
      const result = transform({
        filename: args.path,
        code: Buffer.from(processed.css),
        minify: !dev,
        sourceMap: false,
        nonStandard: { deepSelectorCombinator: true },
        include: Features.Nesting,
        errorRecovery: true
      });

      return {
        contents: result.code,
        loader: "text"
      };
    });
  }
};

const ctx = await context({
  entryPoints: ["frontend/main.ts"],
  bundle: true,
  minify: !dev,
  sourcemap: dev,
  outfile: "static/main.js",
  plugins: [cssPlugin]
});

if (dev) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
