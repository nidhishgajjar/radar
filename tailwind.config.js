/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				'exa-navy': '#0A1628',
				'exa-blue-dark': '#1E3A5F',
				'exa-blue': '#2E5C8A',
				'exa-blue-bright': '#4A90E2',
				'exa-electric': '#5AB9EA',
			},
			fontFamily: {
				sans: ['Inter', 'system-ui', 'sans-serif'],
			}
		}
	},
	plugins: []
};
