import React, { useState, useEffect } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';
import { renderHighlightedText } from './HighlightText';

interface MarkdownRendererProps {
  content: string;
  rtl?: boolean;
  className?: string;
  highlightQuery?: string;
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join('');
  }
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractText(node.props?.children);
  }
  return '';
}

function highlightTextNodes(children: React.ReactNode, query?: string): React.ReactNode {
  if (!query?.trim()) return children;
  return React.Children.map(children, (child, idx) => {
    if (typeof child === 'string') {
      return (
        <React.Fragment key={`ht-${idx}`}>
          {renderHighlightedText(child, query)}
        </React.Fragment>
      );
    }
    return child;
  });
}

const CodeBlock: React.FC<{ language: string; code: string; highlightQuery?: string }> = ({
  language,
  code,
  highlightQuery,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      dir="ltr"
      className="my-3 rounded-xl overflow-hidden border border-purple-500/35 bg-[#070910] shadow-lg text-left"
    >
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#101322] border-b border-purple-500/25">
        <div className="flex items-center gap-2 text-[11px] font-mono text-purple-300 font-semibold">
          <Terminal className="w-3.5 h-3.5 text-purple-400" />
          <span>{language || 'code'}</span>
        </div>
        <button
          type="button"
          onClick={handleCopyCode}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-950/70 hover:bg-purple-900/70 border border-purple-500/30 text-[11px] text-purple-200 hover:text-white transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-300">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy code</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-xs sm:text-[13px] leading-relaxed font-mono text-gray-100 scrollbar-thin">
        <code>{renderHighlightedText(code, highlightQuery)}</code>
      </pre>
    </div>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  rtl = false,
  className = '',
  highlightQuery,
}) => {
  const [MarkdownModule, setMarkdownModule] = useState<any>(null);
  const [remarkGfmModule, setRemarkGfmModule] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      import('react-markdown'),
      import('remark-gfm'),
    ])
      .then(([mdMod, gfmMod]) => {
        if (isMounted) {
          setMarkdownModule(() => mdMod.default);
          setRemarkGfmModule(() => gfmMod.default);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  if (!content) return null;

  if (isLoading || !MarkdownModule) {
    return (
      <div
        dir={rtl ? 'rtl' : 'ltr'}
        className={`space-y-2 text-sm sm:text-[15px] leading-relaxed break-words text-gray-200 ${className}`}
      >
        <p>{content}</p>
      </div>
    );
  }

  const ReactMarkdown = MarkdownModule;
  const remarkGfm = remarkGfmModule;

  const components: any = {
    pre(props: any) {
      const children = props.children;
      const childArray = React.Children.toArray(children);
      const codeEl = childArray.find((c) => React.isValidElement(c)) as
        | React.ReactElement<{ className?: string; children?: React.ReactNode }>
        | undefined;
      const classNameProp = codeEl?.props?.className || '';
      const langMatch = /language-([a-zA-Z0-9_+-]+)/.exec(classNameProp);
      const language = langMatch ? langMatch[1] : 'code';
      const rawCode = extractText(codeEl ? codeEl.props.children : children).replace(/\n$/, '');

      return <CodeBlock language={language} code={rawCode} highlightQuery={highlightQuery} />;
    },
    code(props: any) {
      const { className: codeClassName, children } = props;
      return (
        <code
          dir="ltr"
          className={`px-1.5 py-0.5 mx-0.5 rounded-md bg-purple-950/70 border border-purple-500/30 text-purple-200 font-mono text-[0.85em] ${
            codeClassName || ''
          }`}
        >
          {highlightTextNodes(children, highlightQuery)}
        </code>
      );
    },
    p(props: any) {
      return (
        <p className="leading-relaxed text-gray-100 my-1.5 first:mt-0 last:mb-0">
          {highlightTextNodes(props.children, highlightQuery)}
        </p>
      );
    },
    strong(props: any) {
      return (
        <strong className="font-bold text-white">
          {highlightTextNodes(props.children, highlightQuery)}
        </strong>
      );
    },
    em(props: any) {
      return (
        <em className="italic text-purple-100">
          {highlightTextNodes(props.children, highlightQuery)}
        </em>
      );
    },
    del(props: any) {
      return (
        <del className="line-through text-gray-400">
          {highlightTextNodes(props.children, highlightQuery)}
        </del>
      );
    },
    a(props: any) {
      return (
        <a
          href={props.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-300 underline decoration-purple-400/60 hover:text-purple-200 break-all"
        >
          {highlightTextNodes(props.children, highlightQuery)}
        </a>
      );
    },
    h1(props: any) {
      return (
        <h1 className="text-lg sm:text-xl font-extrabold text-white pt-1.5 pb-0.5">
          {highlightTextNodes(props.children, highlightQuery)}
        </h1>
      );
    },
    h2(props: any) {
      return (
        <h2 className="text-base sm:text-lg font-bold text-purple-200 pt-1.5 pb-0.5">
          {highlightTextNodes(props.children, highlightQuery)}
        </h2>
      );
    },
    h3(props: any) {
      return (
        <h3 className="text-sm sm:text-base font-bold text-purple-300 pt-1">
          {highlightTextNodes(props.children, highlightQuery)}
        </h3>
      );
    },
    h4(props: any) {
      return (
        <h4 className="text-sm font-bold text-purple-300 pt-0.5">
          {highlightTextNodes(props.children, highlightQuery)}
        </h4>
      );
    },
    ul(props: any) {
      return (
        <ul
          className={`space-y-1 my-2 list-disc ${
            rtl ? 'pr-5' : 'pl-5'
          } text-gray-100`}
        >
          {props.children}
        </ul>
      );
    },
    ol(props: any) {
      return (
        <ol
          className={`space-y-1 my-2 list-decimal ${
            rtl ? 'pr-5' : 'pl-5'
          } text-gray-100`}
        >
          {props.children}
        </ol>
      );
    },
    li(props: any) {
      return (
        <li className="leading-relaxed">
          {highlightTextNodes(props.children, highlightQuery)}
        </li>
      );
    },
    blockquote(props: any) {
      return (
        <blockquote
          className={`my-2 border-purple-400/70 bg-purple-950/30 px-3.5 py-2 rounded-lg text-purple-100 italic ${
            rtl ? 'border-r-3' : 'border-l-3'
          }`}
        >
          {highlightTextNodes(props.children, highlightQuery)}
        </blockquote>
      );
    },
    hr() {
      return <hr className="border-white/10 my-3" />;
    },
    table(props: any) {
      return (
        <div className="overflow-x-auto my-2.5 rounded-xl border border-purple-500/25">
          <table className="w-full text-xs sm:text-sm border-collapse">{props.children}</table>
        </div>
      );
    },
    thead(props: any) {
      return <thead className="bg-purple-950/50 text-purple-200">{props.children}</thead>;
    },
    tbody(props: any) {
      return <tbody>{props.children}</tbody>;
    },
    tr(props: any) {
      return <tr className="border-b border-white/5 last:border-none">{props.children}</tr>;
    },
    th(props: any) {
      return (
        <th className="px-3 py-2 font-bold border-b border-purple-500/25 text-start">
          {highlightTextNodes(props.children, highlightQuery)}
        </th>
      );
    },
    td(props: any) {
      return (
        <td className="px-3 py-2 text-gray-200">
          {highlightTextNodes(props.children, highlightQuery)}
        </td>
      );
    },
  };

  return (
    <div
      dir={rtl ? 'rtl' : 'ltr'}
      className={`space-y-2 text-sm sm:text-[15px] leading-relaxed break-words ${
        rtl ? 'text-right' : 'text-left'
      } ${className}`}
    >
      <ReactMarkdown remarkPlugins={remarkGfm ? [remarkGfm] : []} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
};
