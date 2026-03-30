import { getAllAdmins } from '@/lib/admin'
import { SettingsClient } from './SettingsClient'
import { Shield, Info } from 'lucide-react'

export const metadata = { title: 'Configurações — Admin' }

export default async function SettingsPage() {
  const admins = await getAllAdmins()

  return <SettingsClient admins={admins} />
}
