//! Prototype Rust port of the into-md static pipeline, built only to benchmark
//! against the TypeScript implementation. Headless mode and the response
//! cache are intentionally not ported (see ../REPORT.md).

use std::io::Write;
use std::rc::Rc;
use std::time::Instant;

use clap::Parser;
use dom_query::Document;
use dom_smoothie::Readability;
use htmd::element_handler::{HandlerResult, Handlers};
use htmd::options::{BulletListMarker, Options};
use htmd::{Element, HtmlToMarkdown, Node};
use markup5ever_rcdom::NodeData;
use ureq::ResponseExt;
use url::Url;

const DEFAULT_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36";
const SPA_ROOT_IDS: [&str; 5] = ["root", "app", "__next", "__nuxt", "__svelte"];
const STAGE_1_BODY_TEXT_MIN: usize = 100;
const STAGE_2_CONTENT_MIN: usize = 200;
const STRUCTURAL: &str = "article, p, pre, li, h1, h2, h3, h4, h5, h6";

#[derive(Parser)]
#[command(name = "into-md-rs")]
struct Cli {
    /// URL to fetch
    url: Option<String>,
    /// Read HTML from a local file instead of fetching (benchmarking)
    #[arg(long)]
    file: Option<String>,
    /// Base URL used with --file
    #[arg(long, default_value = "https://example.com/page")]
    base_url: String,
    #[arg(short, long)]
    output: Option<String>,
    #[arg(long)]
    raw: bool,
    #[arg(long)]
    strip_links: bool,
    #[arg(long)]
    exclude: Option<String>,
    #[arg(long, default_value_t = 30_000)]
    timeout: u64,
    #[arg(long)]
    user_agent: Option<String>,
    /// Accepted for CLI parity with the TS version (static is the only mode here)
    #[arg(long = "no-js")]
    no_js: bool,
    #[arg(long = "no-cache")]
    no_cache: bool,
    /// Run the pipeline N extra times and print per-stage medians as JSON
    #[arg(long, default_value_t = 0)]
    repeat: usize,
}

#[derive(Default, Clone)]
struct Meta {
    title: Option<String>,
    description: Option<String>,
    author: Option<String>,
}

#[derive(Default, Clone, Copy)]
struct Timings {
    stage1: f64,
    extract: f64,
    stage2: f64,
    convert: f64,
    total: f64,
}

fn ms(t: Instant) -> f64 {
    t.elapsed().as_secs_f64() * 1000.0
}

fn collapse_ws_len(s: &str) -> usize {
    s.split_whitespace()
        .map(|w| w.chars().count() + 1)
        .sum::<usize>()
        .saturating_sub(1)
}

fn meta_attr(doc: &Document, sel: &str) -> Option<String> {
    doc.select(sel).attr("content").map(|v| v.to_string())
}

fn extract_metadata(doc: &Document) -> Meta {
    let title_sel = doc.select("title");
    let title = if title_sel.exists() {
        Some(title_sel.text().to_string())
    } else {
        meta_attr(doc, r#"meta[property="og:title"]"#)
    };
    Meta {
        title,
        description: meta_attr(doc, r#"meta[name="description"]"#)
            .or_else(|| meta_attr(doc, r#"meta[property="og:description"]"#)),
        author: meta_attr(doc, r#"meta[name="author"]"#)
            .or_else(|| meta_attr(doc, r#"meta[property="article:author"]"#)),
    }
}

/// Stage 1 auto-detect: empty SPA root or <noscript> mentioning JS with a sparse body.
fn stage1_needs_browser(doc: &Document) -> Option<&'static str> {
    for id in SPA_ROOT_IDS {
        let root = doc.select(&format!("#{id}"));
        if !root.exists() {
            continue;
        }
        let clone = Document::from(root.html().to_string());
        clone.select("script, style").remove();
        let text = clone.select("body").text();
        let t = text.trim().to_lowercase();
        if t.is_empty() || t == "loading" || t == "loading..." {
            return Some("Empty SPA root div detected");
        }
    }
    let qualifying = doc.select("noscript").iter().any(|n| {
        n.text().to_lowercase().contains("javascript")
            && !n.ancestors(None).iter().any(|a| {
                let c = format!(
                    "{} {}",
                    a.attr("class").unwrap_or_default(),
                    a.attr("id").unwrap_or_default()
                )
                .to_lowercase();
                c.contains("cookie") || c.contains("consent") || c.contains("banner")
            })
    });
    if qualifying {
        let body = Document::from(doc.select("body").html().to_string());
        body.select("script, style").remove();
        if collapse_ws_len(&body.select("body").text()) < STAGE_1_BODY_TEXT_MIN {
            return Some("Noscript with javascript and sparse body");
        }
    }
    None
}

fn stage2_too_sparse(extracted_html: &str) -> bool {
    let doc = Document::from(extracted_html);
    if doc.select("body").text().trim().chars().count() >= STAGE_2_CONTENT_MIN {
        return false;
    }
    !doc.select(STRUCTURAL).exists()
}

fn extract(html: &str, base: &str, raw: bool, exclude: &[String]) -> (String, Meta, Document) {
    let doc = Document::from(html);
    for sel in exclude {
        doc.select(sel).remove();
    }
    let mut meta = extract_metadata(&doc);
    if raw {
        return (doc.html().to_string(), meta, doc);
    }
    let reader_doc = Document::from(doc.html());
    let content = match Readability::with_document(reader_doc, Some(base), None)
        .and_then(|mut r| r.parse())
    {
        Ok(article) => {
            if meta.title.is_none() && !article.title.is_empty() {
                meta.title = Some(article.title.clone());
            }
            if meta.author.is_none() {
                meta.author = article.byline.clone();
            }
            article.content.to_string()
        }
        Err(_) => doc.select("body").inner_html().to_string(),
    };
    (content, meta, doc)
}

// ---------- markdown conversion (htmd + custom rules mirroring converter.ts) ----------

fn attr(el: &Element, name: &str) -> Option<String> {
    el.attrs
        .iter()
        .find(|a| &*a.name.local == name)
        .map(|a| a.value.to_string())
}

fn node_tag(node: &Rc<Node>) -> Option<String> {
    match &node.data {
        NodeData::Element { name, .. } => Some(name.local.to_string()),
        _ => None,
    }
}

fn text_content(node: &Rc<Node>, out: &mut String) {
    match &node.data {
        NodeData::Text { contents } => out.push_str(&contents.borrow()),
        _ => {
            for c in node.children.borrow().iter() {
                text_content(c, out);
            }
        }
    }
}

fn text_of(node: &Rc<Node>) -> String {
    let mut s = String::new();
    text_content(node, &mut s);
    s.trim().to_string()
}

fn descendants(node: &Rc<Node>, tags: &[&str], stop_at_table: bool, out: &mut Vec<Rc<Node>>) {
    for c in node.children.borrow().iter() {
        let tag = node_tag(c);
        if let Some(t) = tag.as_deref() {
            if tags.contains(&t) {
                out.push(c.clone());
            }
            if stop_at_table && t == "table" {
                continue;
            }
        }
        descendants(c, tags, stop_at_table, out);
    }
}

fn find_all(node: &Rc<Node>, tags: &[&str]) -> Vec<Rc<Node>> {
    let mut v = Vec::new();
    descendants(node, tags, false, &mut v);
    v
}

fn has_ancestor(node: &Rc<Node>, tag: &str, stop: &Rc<Node>) -> bool {
    let mut cur = node.parent.take();
    node.parent.set(cur.clone());
    while let Some(w) = cur {
        let Some(p) = w.upgrade() else { break };
        if Rc::ptr_eq(&p, stop) {
            return false;
        }
        if node_tag(&p).as_deref() == Some(tag) {
            return true;
        }
        cur = p.parent.take();
        p.parent.set(cur.clone());
    }
    false
}

fn table_to_json(table: &Rc<Node>) -> String {
    let caption = find_all(table, &["caption"])
        .first()
        .map(text_of)
        .filter(|s| !s.is_empty());
    let thead_th: Vec<_> = find_all(table, &["thead"])
        .iter()
        .flat_map(|t| find_all(t, &["th"]))
        .collect();
    let all_rows = find_all(table, &["tr"]);
    let headers: Vec<String> = if !thead_th.is_empty() {
        thead_th
            .iter()
            .map(text_of)
            .filter(|s| !s.is_empty())
            .collect()
    } else if let Some(first) = all_rows.first() {
        find_all(first, &["th", "td"])
            .iter()
            .enumerate()
            .map(|(i, c)| {
                let t = text_of(c);
                if t.is_empty() {
                    format!("Column {}", i + 1)
                } else {
                    t
                }
            })
            .collect()
    } else {
        Vec::new()
    };
    let body_rows: Vec<_> = find_all(table, &["tbody"])
        .iter()
        .flat_map(|t| find_all(t, &["tr"]))
        .collect();
    let mut data_rows = if body_rows.is_empty() {
        all_rows
            .into_iter()
            .filter(|r| !has_ancestor(r, "thead", table))
            .collect()
    } else {
        body_rows
    };
    if thead_th.is_empty() && !data_rows.is_empty() {
        data_rows.remove(0);
    }
    let rows: Vec<serde_json::Value> = data_rows
        .iter()
        .filter_map(|r| {
            let cells = find_all(r, &["td", "th"]);
            if cells.is_empty() {
                return None;
            }
            let mut m = serde_json::Map::new();
            for (i, c) in cells.iter().enumerate() {
                let k = headers
                    .get(i)
                    .cloned()
                    .unwrap_or_else(|| format!("Column {}", i + 1));
                m.insert(k, text_of(c).into());
            }
            Some(serde_json::Value::Object(m))
        })
        .collect();
    let mut obj = serde_json::Map::new();
    if let Some(c) = caption {
        obj.insert("caption".into(), c.into());
    }
    obj.insert("headers".into(), headers.into());
    obj.insert("rows".into(), rows.into());
    serde_json::to_string_pretty(&serde_json::Value::Object(obj)).unwrap_or_default()
}

fn absolutize(base: &Url, href: &str) -> String {
    base.join(href)
        .map(|u| u.to_string())
        .unwrap_or_else(|_| href.to_string())
}

fn figure_caption(node: &Rc<Node>) -> Option<String> {
    let mut cur = node.parent.take();
    node.parent.set(cur.clone());
    while let Some(w) = cur {
        let p = w.upgrade()?;
        if node_tag(&p).as_deref() == Some("figure") {
            return find_all(&p, &["figcaption"])
                .first()
                .map(text_of)
                .filter(|s| !s.is_empty());
        }
        cur = p.parent.take();
        p.parent.set(cur.clone());
    }
    None
}

fn build_converter(base: &str, strip_links: bool) -> HtmlToMarkdown {
    let base_a = Url::parse(base).expect("valid base url");
    let base_i = base_a.clone();
    HtmlToMarkdown::builder()
        .options(Options {
            bullet_list_marker: BulletListMarker::Dash,
            ..Default::default()
        })
        .skip_tags(vec!["script", "style"])
        .add_handler(
            vec!["a"],
            move |h: &dyn Handlers, el: Element| -> Option<HandlerResult> {
                let content = h.walk_children(el.node).content;
                match attr(&el, "href") {
                    Some(href) if !strip_links => {
                        Some(format!("[{content}]({})", absolutize(&base_a, &href)).into())
                    }
                    _ => Some(content.into()),
                }
            },
        )
        .add_handler(
            vec!["img"],
            move |_: &dyn Handlers, el: Element| -> Option<HandlerResult> {
                let src = attr(&el, "src")
                    .map(|s| absolutize(&base_i, &s))
                    .unwrap_or_default();
                let alt = attr(&el, "alt").unwrap_or_default();
                let caption = figure_caption(el.node).or_else(|| {
                    attr(&el, "title")
                        .map(|t| t.trim().to_string())
                        .filter(|t| !t.is_empty())
                });
                Some(
                    match caption {
                        Some(c) => format!("![{alt}]({src})\n*{c}*"),
                        None => format!("![{alt}]({src})"),
                    }
                    .into(),
                )
            },
        )
        .add_handler(
            vec!["table"],
            |_: &dyn Handlers, el: Element| -> Option<HandlerResult> {
                Some(format!("\n\n```json\n{}\n```\n\n", table_to_json(el.node)).into())
            },
        )
        .add_handler(
            vec!["iframe", "embed", "video"],
            |_: &dyn Handlers, el: Element| -> Option<HandlerResult> {
                Some(
                    attr(&el, "src")
                        .map(|s| format!("[Embedded content: {s}]"))
                        .unwrap_or_default()
                        .into(),
                )
            },
        )
        .build()
}

// ---------- pipeline ----------

fn pipeline(
    html: &str,
    base: &str,
    cli: &Cli,
    exclude: &[String],
) -> (String, Meta, Timings, Option<&'static str>) {
    let mut t = Timings::default();
    let t0 = Instant::now();
    let s = Instant::now();
    let probe = Document::from(html);
    let fallback = stage1_needs_browser(&probe);
    t.stage1 = ms(s);
    let s = Instant::now();
    let (content, meta, _doc) = extract(html, base, cli.raw, exclude);
    t.extract = ms(s);
    let s = Instant::now();
    let fallback = fallback.or_else(|| {
        (!cli.raw && stage2_too_sparse(&content)).then_some("Extracted content is too sparse")
    });
    t.stage2 = ms(s);
    let s = Instant::now();
    let md = build_converter(base, cli.strip_links)
        .convert(&content)
        .unwrap_or_default();
    t.convert = ms(s);
    t.total = ms(t0);
    (md, meta, t, fallback)
}

fn esc(v: &str) -> String {
    v.replace('"', "\\\"")
}

fn frontmatter(meta: &Meta, source: &str, strategy: &str) -> String {
    let mut lines = vec!["---".to_string()];
    for (k, v) in [
        ("title", &meta.title),
        ("description", &meta.description),
        ("author", &meta.author),
    ] {
        if let Some(v) = v {
            lines.push(format!("{k}: \"{}\"", esc(v)));
        }
    }
    lines.push(format!("strategy: \"{strategy}\""));
    lines.push(format!("source: \"{}\"", esc(source)));
    lines.push("---".into());
    lines.join("\n")
}

fn fetch(url: &str, cli: &Cli) -> Result<(String, String, bool), String> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_millis(cli.timeout)))
        .build()
        .into();
    let mut resp = agent
        .get(url)
        .header("Accept", "text/markdown, text/html")
        .header(
            "User-Agent",
            cli.user_agent.as_deref().unwrap_or(DEFAULT_USER_AGENT),
        )
        .call()
        .map_err(|e| format!("Request failed: {e}"))?;
    let final_url = resp.get_uri().to_string();
    let is_md = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.contains("text/markdown"));
    let body = resp
        .body_mut()
        .with_config()
        .limit(64 * 1024 * 1024)
        .read_to_string()
        .map_err(|e| e.to_string())?;
    Ok((final_url, body, is_md))
}

fn median(mut v: Vec<f64>) -> f64 {
    v.sort_by(|a, b| a.total_cmp(b));
    v[v.len() / 2]
}

fn main() {
    let cli = Cli::parse();
    let exclude: Vec<String> = cli
        .exclude
        .as_deref()
        .unwrap_or("")
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect();

    let (source, html) = if let Some(path) = &cli.file {
        (
            cli.base_url.clone(),
            std::fs::read_to_string(path).expect("read --file"),
        )
    } else {
        let Some(raw_url) = &cli.url else {
            eprintln!("usage: into-md-rs <url>");
            std::process::exit(1)
        };
        let url = if raw_url.starts_with("http://") || raw_url.starts_with("https://") {
            raw_url.clone()
        } else {
            format!("https://{raw_url}")
        };
        match fetch(&url, &cli) {
            Ok((final_url, body, true)) => {
                eprintln!("Strategy: auto > markdown");
                println!("{}", body.trim());
                let _ = final_url;
                return;
            }
            Ok((final_url, body, false)) => (final_url, body),
            Err(e) => {
                eprintln!("{e}");
                std::process::exit(1)
            }
        }
    };

    let (md, meta, first, fallback) = pipeline(&html, &source, &cli, &exclude);
    if let Some(reason) = fallback {
        eprintln!("Auto-detect: {reason} (headless not implemented in prototype; using static)");
    }
    eprintln!("Strategy: auto > static");

    if cli.repeat > 0 {
        let runs: Vec<Timings> = (0..cli.repeat)
            .map(|_| pipeline(&html, &source, &cli, &exclude).2)
            .collect();
        let m =
            |f: fn(&Timings) -> f64| (median(runs.iter().map(f).collect()) * 10.0).round() / 10.0;
        println!(
            "{{\"firstRunMs\":{:.1},\"stage1\":{},\"extract\":{},\"stage2\":{},\"convert\":{},\"totalMs\":{},\"mdKb\":{}}}",
            first.total,
            m(|t| t.stage1),
            m(|t| t.extract),
            m(|t| t.stage2),
            m(|t| t.convert),
            m(|t| t.total),
            md.len() / 1024
        );
        return;
    }

    let output = format!("{}\n\n{}", frontmatter(&meta, &source, "auto>static"), md)
        .trim()
        .to_string();
    match &cli.output {
        Some(path) => std::fs::write(path, &output).expect("write output"),
        None => {
            let _ = writeln!(std::io::stdout().lock(), "{output}");
        }
    }
}
