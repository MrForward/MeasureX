import type { Config } from 'tailwindcss';

const config: Config = {
    darkMode: ['class'],
    content: [
        './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
        './src/components/**/*.{js,ts,jsx,tsx,mdx}',
        './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            colors: {
                // MeasureX brand colors — indigo-violet accent on white.
                // Palette adapted from openoperative.com (signature #5147e6).
                brand: {
                    50: '#f1f0fe',
                    100: '#e5e3fd',
                    200: '#d0cbff', // OpenOperative light lavender token
                    300: '#b3acfb',
                    400: '#9b93ff', // OpenOperative periwinkle token
                    500: '#6f64ee',
                    600: '#5147e6', // OpenOperative signature indigo-violet
                    700: '#4038c9',
                    800: '#2f2aa1',
                    900: '#220296', // OpenOperative deep indigo token
                    950: '#16005e',
                },
                // Gradient endpoints
                'gradient-start': '#5147e6',
                'gradient-end': '#220296',
            },
            backgroundImage: {
                // Indigo → deep-indigo (white text stays legible on both ends).
                'brand-gradient': 'linear-gradient(135deg, #5147e6 0%, #220296 100%)',
                'brand-gradient-subtle': 'linear-gradient(135deg, #f1f0fe 0%, #eef2ff 100%)',
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)',
            },
        },
    },
    plugins: [
        require('@tailwindcss/typography'),
    ],
};

export default config;
