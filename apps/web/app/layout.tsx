import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { TRPCProvider } from '@/lib/trpc/client'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'White Zap — Agentes de IA para WhatsApp e Instagram',
    template: '%s | White Zap',
  },
  description:
    'Crie agentes de IA que atendem clientes 24h no WhatsApp, Instagram e seu site. Sem programação. Configure em minutos e automatize vendas, suporte e muito mais.',
  keywords: [
    'chatbot whatsapp',
    'agente de IA',
    'automação atendimento',
    'inteligência artificial',
    'WhatsApp bot',
    'Instagram bot',
    'SaaS Brasil',
    'atendimento automático',
    'GPT-4 WhatsApp',
    'White Zap',
  ],
  authors: [{ name: 'White Zap', url: 'https://whiteerp.com' }],
  creator: 'White Zap',
  publisher: 'White Zap',
  metadataBase: new URL('https://whiteerp.com'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: 'https://whiteerp.com',
    siteName: 'White Zap',
    title: 'White Zap — Agentes de IA para WhatsApp e Instagram',
    description:
      'Automatize atendimento, vendas e suporte com agentes de IA inteligentes. Conecte WhatsApp, Instagram e seu site em minutos.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'White Zap — Agentes de IA para WhatsApp',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'White Zap — Agentes de IA para WhatsApp e Instagram',
    description:
      'Automatize atendimento com agentes de IA. Conecte WhatsApp, Instagram e seu site sem programar.',
    images: ['/og-image.png'],
    creator: '@whitezap',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
  category: 'technology',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#16a34a' },
    { media: '(prefers-color-scheme: dark)', color: '#15803d' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable} suppressHydrationWarning>
      <body className={`${inter.className} antialiased`}>
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  )
}
