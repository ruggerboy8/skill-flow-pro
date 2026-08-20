import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				},
				brand: {
					// DSN-3: removed the legacy numeric scale (50/600/900) that used to
					// back Button/ProMovesLogo/LandingPage. Those now consume the
					// `primary` token, which resolves to brand navy (see src/index.css).
					// Zero remaining consumers as of this migration; re-add if a future
					// surface needs the raw hex again.
					// DSN-5a: the six locked brand colors, sourced from
					// promoves-brand/exports/README.md via the --brand-* CSS vars.
					navy: 'hsl(var(--brand-navy))',
					blue: 'hsl(var(--brand-blue))',
					signal: 'hsl(var(--brand-signal))',
					bone: 'hsl(var(--brand-bone))',
					charcoal: 'hsl(var(--brand-charcoal))',
					gray: 'hsl(var(--brand-gray))'
				},
				slatebrand: {
					400: '#949aa1',
					600: '#515458'
				},
				// Domain colors mapped for utilities (bg-domain-planning, etc.)
				domain: {
					clinical: 'hsl(var(--domain-clinical))',
					clerical: 'hsl(var(--domain-clerical))',
					cultural: 'hsl(var(--domain-cultural))',
					'case-acceptance': 'hsl(var(--domain-case-acceptance))'
				}
			},
			// Glassmorphism utilities
			boxShadow: {
				glass: '0 8px 32px 0 rgba(31, 38, 135, 0.07)',
				'glass-hover': '0 8px 32px 0 rgba(31, 38, 135, 0.15)'
			},
			backgroundImage: {
				'glass-gradient': 'linear-gradient(135deg, rgba(255, 255, 255, 0.80) 0%, rgba(255, 255, 255, 0.40) 100%)'
			},
		fontSize: {
			'2xs': ['0.625rem', { lineHeight: '0.875rem' }],
		},
		fontFamily: {
			sans: ['"Biondi Sans"', 'ui-sans-serif', 'system-ui']
		},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			// DSN-5a: brand motion contract (run-once, no bounce). Duration
			// steps live only as CSS vars for now (--duration-quick/standard/brand
			// in src/index.css); add a transitionDuration section here if a
			// later ticket needs them as Tailwind utilities.
			transitionTimingFunction: {
				brand: 'var(--ease-brand)'
			},
		keyframes: {
			'accordion-down': {
				from: {
					height: '0'
				},
				to: {
					height: 'var(--radix-accordion-content-height)'
				}
			},
			'accordion-up': {
				from: {
					height: 'var(--radix-accordion-content-height)'
				},
				to: {
					height: '0'
				}
			},
			'pulse-glow': {
				'0%, 100%': {
					boxShadow: '0 0 0 0 rgba(239, 68, 68, 0.5)'
				},
				'50%': {
					boxShadow: '0 0 0 8px rgba(239, 68, 68, 0)'
				}
			},
			'spring-settle': {
				'0%': { transform: 'translateX(0) scale(1)' },
				'30%': { transform: 'translateX(-4px) scale(0.98)' },
				'60%': { transform: 'translateX(2px) scale(1.01)' },
				'100%': { transform: 'translateX(0) scale(1)' }
			}
		},
		animation: {
			'accordion-down': 'accordion-down 0.2s ease-out',
			'accordion-up': 'accordion-up 0.2s ease-out',
			'pulse-glow': 'pulse-glow 1.5s ease-in-out infinite',
			'spring-settle': 'spring-settle 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
		}
		}
	},
	plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
