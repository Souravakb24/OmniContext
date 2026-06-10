// Shared ReactMarkdown config for answer rendering.
// - remark-gfm: tables, strikethrough, task lists
// - remark-math + rehype-katex: compile $…$ inline and $$…$$ block math
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

export const answerRemarkPlugins = [remarkGfm, remarkMath]
export const answerRehypePlugins = [rehypeKatex]

// Some models emit LaTeX with \( … \) and \[ … \] delimiters, which remark-math
// does not parse. Normalize those to the $ / $$ form KaTeX understands so the
// math renders regardless of which delimiter style the model chose.
export function normalizeMath(text) {
  if (!text) return text
  return text
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, body) => `$$${body}$$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, body) => `$${body}$`)
}
