import { useMemo } from 'react';
import { marked } from 'marked';

interface Props {
  markdown: string;
}

marked.setOptions({
  gfm: true,
  breaks: true,
});

export default function MarkdownPreview({ markdown }: Props) {
  const html = useMemo(() => {
    if (!markdown.trim()) return '<p style="color:var(--color-ink-muted);font-style:italic;">Preview will appear here...</p>';
    return marked.parse(markdown) as string;
  }, [markdown]);

  return (
    <div className="flex justify-center p-8 px-6 pb-12 flex-1">
      <div className="w-full max-w-[780px] bg-paper rounded-md shadow-[0_1px_3px_var(--color-paper-shadow),0_8px_24px_var(--color-paper-shadow)] border border-border-light p-12">
        <div
          className="prose"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
