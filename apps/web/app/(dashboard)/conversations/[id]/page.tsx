import { ConversationView } from '@/components/conversations/ConversationView'

export const metadata = { title: 'Conversa' }

export default function ConversationPage({ params }: { params: { id: string } }) {
  return <ConversationView contactId={params.id} />
}
