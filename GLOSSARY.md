# into-md

into-md turns content available at a URL into markdown for use as LLM context.

## Language

### Obtaining content

**Fetch mode**:
The requested policy for obtaining content: automatic, static-only (no browser), or browser-only. Fetch mode constrains which strategies are acceptable; it does not describe the result's origin.
_Avoid_: Render mode, strategy

**Strategy**:
The method that originally produced a result: static HTML (`static`), browser-rendered HTML (`headless`), or server-provided markdown (`markdown`). A reused result retains its original strategy, so static-only mode permits `static` or `markdown`, while browser-only mode permits only `headless`.
_Avoid_: Fetch mode, output format

**Browser fallback**:
A switch from static retrieval to browser rendering because the static page appears to be missing content that rendering might reveal. It is distinct from extraction fallback and is not general recovery from retrieval errors.
_Avoid_: Extraction fallback, error recovery

### Selecting content

**Main content**:
The page's central material, distinct from surrounding navigation, advertisements, and other page chrome. It need not be an article.
_Avoid_: Article, page body

**Content scope**:
The requested policy for selecting HTML content: main-content scope or full-page scope. It is independent of fetch mode and does not guarantee that main content can be identified.
_Avoid_: Fetch mode, selected content

**Main-content scope**:
A content scope that seeks to isolate the page's main content, with extraction fallback when that content cannot be identified.
_Avoid_: Article mode, guaranteed main content

**Full-page scope**:
A content scope that selects the page body without attempting to isolate main content; explicit exclusions can still narrow the selection. It does not mean untouched source or content without conversion.
_Avoid_: Raw source, unprocessed output

**Selected content**:
The HTML content chosen for markdown conversion, whether identified main content or the page body. Selection alone does not establish that main content was identified.
_Avoid_: Main content, article, markdown output

**Extraction fallback**:
Selection of the page body when main content cannot be identified under main-content scope. It preserves a best-effort conversion source without establishing that main content was found or that browser rendering is needed.
_Avoid_: Browser fallback, successful main-content extraction
