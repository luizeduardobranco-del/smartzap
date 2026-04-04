import { Suspense } from 'react'
import { ConversationsPanel } from '@/components/conversations/ConversationsPanel'

export const metadata = { title: 'Conversas' }

export default function ConversationsPage() {
  return (
    <Suspense>
      <ConversationsPanel />
    </Suspense>
  )
}
