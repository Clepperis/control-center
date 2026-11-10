import type { ReactNode } from "react";

function inline(text: string): ReactNode[] {
  // Small, deliberately conservative Markdown subset. React escapes raw HTML;
  // images remain text and never trigger remote requests. No MDX or raw HTML.
  return text
    .split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|!?\[[^\]\n]+\]\([^\s)]+\))/g)
    .map((part, i) => {
      if (part.startsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
      if (part.startsWith("**"))
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      if (link) {
        try {
          const url = new URL(link[2]);
          if (
            ["https:", "http:", "mailto:"].includes(url.protocol) &&
            !url.username &&
            !url.password
          )
            return (
              <a
                key={i}
                href={url.href}
                rel="noopener noreferrer"
                target="_blank"
              >
                {link[1]}
              </a>
            );
        } catch {}
      }
      return part;
    });
}
export function SafeMarkdown({
  text,
  plain = false,
}: {
  text: string;
  plain?: boolean;
}) {
  if (plain) return <pre className="knowledge-plain">{text}</pre>;
  const lines = text.split("\n"),
    nodes: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      const marker = line.trim().slice(0, 3),
        code: string[] = [];
      while (++i < lines.length && !lines[i].trim().startsWith(marker))
        code.push(lines[i]);
      nodes.push(
        <pre key={i}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const H = heading[1].length < 3 ? "h3" : "h4";
      nodes.push(<H key={i}>{inline(heading[2])}</H>);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      do {
        items.push(
          <li key={i}>{inline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>,
        );
        i++;
      } while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]));
      i--;
      nodes.push(<ul key={`list-${i}`}>{items}</ul>);
      continue;
    }
    if (line.trim()) nodes.push(<p key={i}>{inline(line)}</p>);
  }
  return <div className="knowledge-markdown">{nodes}</div>;
}
