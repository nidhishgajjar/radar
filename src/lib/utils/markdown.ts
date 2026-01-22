import { marked } from 'marked';

// Configure marked for clean rendering
marked.setOptions({
	gfm: true,
	breaks: true,
	headerIds: false,
	mangle: false
});

export function renderMarkdown(text: string): string {
	return marked.parse(text) as string;
}
