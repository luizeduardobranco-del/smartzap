import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'ZapAgent - Agentes de IA para seu negócio',
    template: '%s | ZapAgent',
  },
  description:
    'Crie funcionários virtuais de IA que atendem clientes 24h no WhatsApp, Instagram e seu site. Sem programação.',
  keywords: ['chatbot', 'IA', 'WhatsApp', 'atendimento automático', 'agente virtual', 'SaaS'],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={inter.className}>{children}</body>
    </html>
  )
}
