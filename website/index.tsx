import { Hono } from "hono";
import type { worker } from "../alchemy.run.ts";
export type Env = typeof worker.Env;

import pkg from "../package.json" with { type: "json" };

const app = new Hono<{ Bindings: Env }>();

const { version } = pkg;

const ArrowRight = () => (
  <svg
    aria-hidden="true"
    class="lucide lucide-move-right-icon lucide-move-right hidden size-5 sm:inline"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width="1.5"
    viewBox="0 0 24 24"
  >
    <path d="M18 8L22 12L18 16" />
    <path d="M2 12H22" />
  </svg>
);

const ArrowDown = () => (
  <svg
    aria-hidden="true"
    class="lucide lucide-move-right-icon lucide-move-right size-5 sm:hidden"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width="1.5"
    viewBox="0 0 24 24"
  >
    <path d="M8 18L12 22L16 18" />
    <path d="M12 2V22" />
  </svg>
);

app.get("/", (c) =>
  c.html(
    <html lang="en">
      <head>
        <title>into-md</title>
        <meta charset="UTF-8" />
        <meta content="width=device-width, initial-scale=1.0" name="viewport" />
        <script src="https://cdn.tailwindcss.com" />
        <link href="https://fonts.googleapis.com" rel="preconnect" />
        <link crossOrigin href="https://fonts.gstatic.com" rel="preconnect" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100..900&family=Geist:wght@100..900&display=swap"
          rel="stylesheet"
        />
        <style
          // biome-ignore lint/security/noDangerouslySetInnerHtml: We're okay with this
          dangerouslySetInnerHTML={{
            __html: `
   html { font-size: 15px; };
      .geist-regular { font-family: "Geist", sans-serif; font-optical-sizing: auto; font-weight: 400; font-style: normal; }
   .geist-mono { font-family: "Geist Mono", monospace; font-optical-sizing: auto; font-weight: 400; font-style: normal; }
   .custom-box-shadow { box-shadow: 3.5px 3.5px 0px 0px rgb(221, 221, 221); }
   .custom-box-shadow:hover { box-shadow: 3.5px 3.5px 0px 0px rgb(212, 212, 212); }
   `,
          }}
        />
      </head>
      <body>
        <div class="geist-regular min-h-screen px-6 py-10 sm:px-8 sm:py-14">
          <main class="mx-auto flex max-w-2xl flex-col gap-8">
            <div class="flex flex-col gap-2">
              <h1 class="font-semibold text-2xl tracking-normal">into-md</h1>
              <p class="text-neutral-600 leading-[1.75]">
                Fetch any URL. Get clean markdown. Feed it to your LLM.
              </p>
              <span class="geist-mono text-neutral-400 text-sm">
                v{version}
              </span>
            </div>

            <section class="flex flex-col">
              <h2 class="mb-2 font-medium text-xl">Install</h2>
              <div class="mb-2 text-neutral-600 leading-[1.75]">
                Global install with your package manager of choice:
              </div>
              <pre class="geist-mono overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm leading-5">
                <code class="leading-[1.5rem]">
                  {"bun add -g into-md\n"}
                  {"npm install -g into-md\n"}
                  {"yarn global add into-md"}
                </code>
              </pre>
              <div class="mt-3 text-neutral-600 leading-[1.75]">
                Or use{" "}
                <code class="geist-mono rounded-sm border border-neutral-200 bg-neutral-50 px-1 py-0.5 text-sm">
                  bunx into-md
                </code>{" "}
                to run without installing.
              </div>
            </section>

            <section class="flex flex-col">
              <h2 class="mb-2 font-medium text-xl">How it works</h2>
              <div class="mb-4 text-neutral-600 leading-[1.75]">
                Pass any URL and get back clean, structured markdown ready for
                LLM consumption. into-md auto-detects whether a page needs a
                headless browser and falls back to Playwright if needed.
              </div>
              <div class="mx-auto">
                <div class="my-2 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
                  <div class="custom-box-shadow w-full rounded-md border border-black bg-white px-4 py-2 text-center font-medium text-sm sm:w-auto">
                    URL
                  </div>
                  <span class="text-lg text-neutral-400">
                    <ArrowRight />
                    <ArrowDown />
                  </span>
                  <div class="custom-box-shadow w-full rounded-md border border-black bg-white px-4 py-2 text-center font-medium text-sm sm:w-auto">
                    into-md
                  </div>
                  <span class="text-lg text-neutral-400">
                    <ArrowRight />
                    <ArrowDown />
                  </span>
                  <div class="custom-box-shadow w-full rounded-md border border-black bg-white px-4 py-2 text-center font-medium text-sm sm:w-auto">
                    clean markdown
                  </div>
                </div>
              </div>
            </section>

            <section class="flex flex-col">
              <h2 class="mb-2 font-medium text-xl">What you get</h2>
              <div class="my-2 flex flex-col gap-4">
                <div class="custom-box-shadow rounded-md border border-black bg-white px-4 pt-3 pb-4">
                  <h3 class="mb-1 font-medium text-base">Smart extraction</h3>
                  <p class="text-neutral-600 text-sm">
                    Uses readability heuristics to pull out the main content and
                    strip away navigation, ads, and clutter.
                  </p>
                </div>
                <div class="custom-box-shadow rounded-md border border-black bg-white px-4 pt-3 pb-4">
                  <h3 class="mb-1 font-medium text-base">Auto JS detection</h3>
                  <p class="text-neutral-600 text-sm">
                    Automatically detects SPAs and JS-rendered pages and falls
                    back to a headless browser when needed.
                  </p>
                </div>
                <div class="custom-box-shadow rounded-md border border-black bg-white px-4 pt-3 pb-4">
                  <h3 class="mb-1 font-medium text-base">LLM ready</h3>
                  <p class="text-neutral-600 text-sm">
                    Clean output with YAML frontmatter and semantic markdown,
                    optimized for feeding into AI context windows.
                  </p>
                </div>
                <div class="custom-box-shadow rounded-md border border-black bg-white px-4 pt-3 pb-4">
                  <h3 class="mb-1 font-medium text-base">Well structured</h3>
                  <p class="text-neutral-600 text-sm">
                    Tables converted to JSON, images preserved with context, and
                    code blocks auto-tagged for syntax highlighting.
                  </p>
                </div>
              </div>
            </section>

            <section class="flex flex-col">
              <h2 class="mb-2 font-medium text-xl">Example</h2>
              <pre class="geist-mono overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm leading-5">
                <code class="leading-[1.5rem]">
                  {"$ into-md https://example.com/article\n\n"}
                  {"---\n"}
                  {'title: "Example Article"\n'}
                  {'description: "A sample web page"\n'}
                  {'strategy: "auto>static"\n'}
                  {'source: "https://example.com/article"\n'}
                  {"---\n\n"}
                  {"# Example Article\n\n"}
                  {"The main content of the page, cleaned up\n"}
                  {"and ready for your LLM..."}
                </code>
              </pre>
            </section>

            <section class="flex flex-col">
              <h2 class="mb-2 font-medium text-xl">Learn more</h2>
              <p class="text-base text-neutral-600 leading-[1.75]">
                Full documentation, options reference, and source code are
                available on{" "}
                <a
                  class="text-blue-600 hover:underline"
                  href="https://github.com/nbbaier/into-md"
                  rel="noopener"
                  target="_blank"
                >
                  GitHub
                </a>
                . Issues and contributions welcome.
              </p>
            </section>

            <div class="flex flex-col pt-4">
              <div class="mb-4 w-full border-neutral-300 border-t" />
              <div class="flex items-center justify-between">
                <div class="text-neutral-600 text-sm">
                  Built by{" "}
                  <a
                    class="text-blue-600 text-sm hover:underline"
                    href="https://nicobaier.com"
                  >
                    Nico Baier
                  </a>
                </div>
                <a
                  class="text-blue-600 text-sm hover:underline"
                  href="https://github.com/nbbaier/into-md"
                >
                  github
                </a>
              </div>
            </div>
          </main>
        </div>
      </body>
    </html>
  )
);

export default { fetch: app.fetch };
