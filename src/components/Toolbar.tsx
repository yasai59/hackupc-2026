interface Props {
  onFormat: (type: string) => void;
  wordCount: number;
  charCount: number;
  onDownload: () => void;
}

interface ToolbarButton {
  label: string;
  action: () => void;
  title: string;
  className: string;
}

export default function Toolbar({ onFormat, wordCount, charCount, onDownload }: Props) {
  const buttons: ToolbarButton[] = [
    { label: 'H1', action: () => onFormat('h1'), title: 'Heading 1', className: 'font-bold text-[15px]' },
    { label: 'H2', action: () => onFormat('h2'), title: 'Heading 2', className: 'font-semibold text-[13px]' },
    { label: 'H3', action: () => onFormat('h3'), title: 'Heading 3', className: 'font-semibold text-[12px]' },
    { label: 'B', action: () => onFormat('bold'), title: 'Bold (Ctrl+B)', className: 'font-bold' },
    { label: 'I', action: () => onFormat('italic'), title: 'Italic (Ctrl+I)', className: 'italic' },
    { label: 'S', action: () => onFormat('strikethrough'), title: 'Strikethrough', className: 'line-through' },
    { label: '""', action: () => onFormat('quote'), title: 'Blockquote', className: '' },
    { label: '#', action: () => onFormat('code'), title: 'Inline Code', className: '' },
    { label: '```', action: () => onFormat('codeblock'), title: 'Code Block', className: '' },
    { label: '—', action: () => onFormat('hr'), title: 'Horizontal Rule', className: '' },
    { label: '•', action: () => onFormat('ul'), title: 'Unordered List', className: '' },
    { label: '1.', action: () => onFormat('ol'), title: 'Ordered List', className: '' },
    { label: '🔗', action: () => onFormat('link'), title: 'Link', className: '' },
  ];

  const baseBtnClass = 'font-ui text-[13px] font-medium text-ink-light px-2.5 py-1.5 rounded-sm transition-all duration-150 flex items-center justify-center leading-none hover:bg-toolbar-hover hover:text-ink cursor-pointer';

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-toolbar-bg border-b border-border-light sticky top-0 z-10 backdrop-blur-sm">
      <div className="flex items-center gap-0.5">
        <span className="font-ui text-[15px] font-bold text-accent tracking-tight mr-1">inkwell</span>
        <div className="w-px h-5 bg-border mx-1.5 flex-shrink-0" />
        {buttons.map((btn, i) => (
          <button
            key={i}
            onClick={btn.action}
            title={btn.title}
            className={`${baseBtnClass} ${btn.className}`}
          >
            {btn.label}
          </button>
        ))}
      </div>
      <div className="flex items-center">
        <button
          onClick={onDownload}
          title="Download Markdown"
          className="font-ui text-[12px] font-semibold px-3 py-1 bg-accent text-white border-none rounded-sm cursor-pointer transition-colors duration-150 mr-2.5 hover:bg-accent-hover"
        >
          ↓ .md
        </button>
        <span className="font-ui text-[12px] text-ink-muted whitespace-nowrap">{wordCount} words · {charCount} chars</span>
      </div>
    </div>
  );
}
